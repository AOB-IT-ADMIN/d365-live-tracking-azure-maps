/**
 * @fileoverview Azure Maps real-time tracking visualisation for D365 Live Tracker.
 *
 * Runs as an IIFE inside a Dynamics 365 HTML web resource. Authenticates via the
 * hosting CRM context (Xrm), fetches tracking data from the D365 Web API, and
 * renders live user positions, movement trails, and performance metrics on an
 * Azure Maps instance.
 *
 * @requires Azure Maps Web SDK (atlas)
 * @requires Dynamics 365 Web API (Xrm.Utility / fetch with credentials)
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────

    /**
     * Static configuration values for the web resource.
     * Replace `azureMapsKey` with your Azure Maps subscription key before deploying.
     */
    const CONFIG = Object.freeze({
        /** Azure Maps subscription key from the Azure Portal. */
        /** ⚠️  Replace with your Azure Maps subscription key from the Azure Portal.
         *  Get it from: portal.azure.com → Azure Maps → Authentication → Shared Key.
         *  Never commit a real key to source control. */
        azureMapsKey: 'YOUR_AZURE_MAPS_SUBSCRIPTION_KEY',
        /** Logical plural name of the live-tracking custom entity — prefix cr971_ (OpenLayers Azure SDK Dev). */
        trackingEntity: 'cr971_livetrackings',
        /** Default auto-refresh interval in milliseconds. */
        refreshIntervalMs: 15_000,
        /** Opacity of the user trail polyline (0–1). */
        trailOpacity: 0.7,
        /** Stroke width of the user trail polyline in pixels. */
        trailStrokeWidth: 3,
        /** Threshold in milliseconds; users updated within this window are "active". */
        activeUserThresholdMs: 300_000, // 5 minutes
        /** Map camera animation duration in milliseconds.  */
        cameraAnimationDurationMs: 500,
        /** Maximum number of records to fetch per refresh. */
        maxRecordsPerFetch: 5_000,
    });

    /**
     * Ordered colour palette — each user is assigned the next available colour
     * in a round-robin fashion.
     */
    const USER_COLOUR_PALETTE = Object.freeze([
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
        '#D946EF', '#0EA5E9', '#84CC16', '#E11D48', '#A855F7',
    ]);

    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    /** @type {atlas.Map | null} */
    let map = null;

    /** @type {atlas.source.DataSource | null} */
    let datasource = null;

    /** @type {ReturnType<typeof setInterval> | null} */
    let refreshTimer = null;

    /**
     * In-memory store of user tracking data keyed by userId.
     * @type {Record<string, UserTrackingData>}
     */
    let usersData = {};

    /** Currently selected user ID for the metrics panel, or `null`. */
    let selectedUserId = null;

    /** Round-robin index into {@link USER_COLOUR_PALETTE}. */
    let nextColourIndex = 0;

    /**
     * Tracks which user trail layers have already been added to the map
     * to prevent duplicate layer registration.
     * @type {Record<string, atlas.layer.LineLayer>}
     */
    const addedTrailLayers = {};

    // ─────────────────────────────────────────────────────────
    // Type Definitions (JSDoc)
    // ─────────────────────────────────────────────────────────

    /**
     * @typedef {Object} TrackingPoint
     * @property {number} lat        - WGS-84 latitude.
     * @property {number} lng        - WGS-84 longitude.
     * @property {number|null} speed - Speed in m/s, or null.
     * @property {number|null} heading - Heading in degrees, or null.
     * @property {string} timestamp  - ISO 8601 UTC timestamp.
     * @property {number} distance   - Cumulative distance in km.
     * @property {number|null} accuracy - GPS accuracy radius in metres.
     */

    /**
     * @typedef {Object} UserTrackingData
     * @property {string} userId         - D365 user GUID or fallback identifier.
     * @property {string} name           - Resolved display name.
     * @property {string} colour         - Hex colour assigned to this user.
     * @property {TrackingPoint[]} points - Ordered list of location fixes.
     * @property {number} totalDistance  - Most recent cumulative distance in km.
     * @property {string|null} lastUpdate - ISO 8601 timestamp of the latest fix.
     * @property {string} deviceType     - 'Android' or 'iOS'.
     * @property {string} sessionId      - Active session identifier.
     */

    // ─────────────────────────────────────────────────────────
    // DOM References
    // ─────────────────────────────────────────────────────────

    const userListContainer = /** @type {HTMLElement} */ (document.getElementById('userList'));
    const userCountBadge = /** @type {HTMLElement} */ (document.getElementById('userCount'));
    const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('searchUsers'));
    const dateFilterInput = /** @type {HTMLInputElement} */ (document.getElementById('dateFilter'));
    const refreshButton = /** @type {HTMLButtonElement} */ (document.getElementById('btnRefresh'));
    const clearDateButton = /** @type {HTMLButtonElement} */ (document.getElementById('btnClearDate'));
    const autoRefreshCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('autoRefresh'));
    const refreshIntervalSelect = /** @type {HTMLSelectElement} */ (document.getElementById('refreshInterval'));
    const loadingOverlay = /** @type {HTMLElement} */ (document.getElementById('loadingOverlay'));
    const metricsOverlay = /** @type {HTMLElement} */ (document.getElementById('metricsOverlay'));
    const closeMetricsButton = /** @type {HTMLButtonElement} */ (document.getElementById('btnCloseMetrics'));

    // ─────────────────────────────────────────────────────────
    // Initialisation
    // ─────────────────────────────────────────────────────────

    /**
     * Bootstraps the map, registers event handlers, and performs the initial
     * data load. Must be called after the DOM is ready.
     */
    function init() {
        dateFilterInput.value = toDateInputValue(new Date());

        map = new atlas.Map('map', {
            authOptions: {
                authType: 'subscriptionKey',
                subscriptionKey: CONFIG.azureMapsKey,
            },
            center: [0, 0],
            zoom: 2,
            style: 'night',
            language: 'en-US',
        });

        map.events.add('ready', onMapReady);

        registerEventHandlers();
    }

    /**
     * Handler invoked when the Azure Maps instance is fully initialised.
     * Sets up the data source, map layers, and triggers the first data load.
     */
    function onMapReady() {
        datasource = new atlas.source.DataSource(null, { cluster: false });
        map.sources.add(datasource);

        const symbolLayer = createUserMarkerLayer(datasource);
        map.layers.add(symbolLayer);

        map.events.add('click', symbolLayer, handleMarkerClick);

        loadTrackingData();
        startAutoRefresh();
    }

    /**
     * Attaches all UI control event handlers.
     */
    function registerEventHandlers() {
        refreshButton.addEventListener('click', loadTrackingData);

        clearDateButton.addEventListener('click', () => {
            dateFilterInput.value = '';
            loadTrackingData();
        });

        dateFilterInput.addEventListener('change', loadTrackingData);
        searchInput.addEventListener('input', filterUserListBySearchTerm);

        autoRefreshCheckbox.addEventListener('change', () => {
            autoRefreshCheckbox.checked ? startAutoRefresh() : stopAutoRefresh();
        });

        refreshIntervalSelect.addEventListener('change', () => {
            CONFIG.refreshIntervalMs = parseInt(refreshIntervalSelect.value, 10);
            if (autoRefreshCheckbox.checked) {
                stopAutoRefresh();
                startAutoRefresh();
            }
        });

        closeMetricsButton.addEventListener('click', () => {
            metricsOverlay.style.display = 'none';
            selectedUserId = null;
            renderUserList();
        });
    }

    // ─────────────────────────────────────────────────────────
    // Map Layer Factories
    // ─────────────────────────────────────────────────────────

    /**
     * Creates the symbol layer that renders current-position markers with labels.
     *
     * @param {atlas.source.DataSource} source - Data source feeding the layer.
     * @returns {atlas.layer.SymbolLayer} Configured symbol layer.
     */
    function createUserMarkerLayer(source) {
        return new atlas.layer.SymbolLayer(source, null, {
            iconOptions: {
                image: 'marker-blue',
                size: 0.8,
                allowOverlap: true,
            },
            textOptions: {
                textField: ['get', 'userName'],
                offset: [0, 1.5],
                color: '#ffffff',
                haloColor: '#000000',
                haloWidth: 1,
                size: 12,
            },
            filter: ['==', ['get', 'type'], 'current-position'],
        });
    }

    /**
     * Adds a uniquely coloured line layer for the given user's movement trail.
     * Each user receives at most one trail layer (idempotent).
     *
     * @param {string} userId - The unique user identifier.
     * @param {string} colour - Hex colour for this user's trail.
     */
    function addTrailLayerForUser(userId, colour) {
        if (addedTrailLayers[userId]) return;

        const lineLayer = new atlas.layer.LineLayer(datasource, null, {
            strokeColor: colour,
            strokeWidth: CONFIG.trailStrokeWidth,
            strokeOpacity: CONFIG.trailOpacity,
            filter: [
                'all',
                ['==', ['get', 'type'], 'trail'],
                ['==', ['get', 'userId'], userId],
            ],
        });

        map.layers.add(lineLayer);
        addedTrailLayers[userId] = lineLayer;
    }

    // ─────────────────────────────────────────────────────────
    // Data Loading & Processing
    // ─────────────────────────────────────────────────────────

    /**
     * Fetches the latest tracking records from the D365 Web API, processes them
     * into the in-memory user map, and re-renders the map and sidebar.
     */
    async function loadTrackingData() {
        setLoadingVisible(true);

        try {
            const records = await fetchTrackingRecords();
            processTrackingRecords(records);
            renderMap();
            renderUserList();
        } catch (fetchError) {
            console.error('[LiveTrackingMap] Failed to load tracking data:', fetchError);
        } finally {
            setLoadingVisible(false);
        }
    }

    /**
     * Builds the OData query URL and fetches tracking records via the CRM API.
     *
     * @returns {Promise<Object[]>} Array of raw CRM tracking record objects.
     */
    async function fetchTrackingRecords() {
        const dateValue = dateFilterInput.value;
        const dateFilter = dateValue
            ? `&$filter=cr971_timestamp ge ${dateValue}T00:00:00Z and cr971_timestamp le ${dateValue}T23:59:59Z`
            : '';

        const selectFields = [
            'cr971_livetrackingid',
            'cr971_latitude',
            'cr971_longitude',
            'cr971_speed',
            'cr971_heading',
            'cr971_accuracy',
            'cr971_timestamp',
            'cr971_sessionid',
            'cr971_distance',
            'cr971_devicetype',
        ].join(',');

        const url =
            `${getOrgBaseUrl()}/api/data/v9.2/${CONFIG.trackingEntity}` +
            `?$select=${selectFields}&$orderby=cr971_timestamp asc&$top=${CONFIG.maxRecordsPerFetch}${dateFilter}`;

        const response = await fetchFromCrm(url);
        return response.value || [];
    }

    /**
     * Transforms raw CRM records into the {@link UserTrackingData} in-memory map.
     * Resets the map on each call to ensure stale data is cleared.
     *
     * @param {Object[]} records - Raw CRM entity records.
     */
    function processTrackingRecords(records) {
        usersData = {};
        nextColourIndex = 0;

        for (const record of records) {
            const userId = record['cr971_sessionid'] || 'unknown';

            if (!usersData[userId]) {
                usersData[userId] = {
                    userId,
                    name: 'User',
                    colour: getNextColour(),
                    points: [],
                    totalDistance: 0,
                    lastUpdate: null,
                    deviceType: record['cr971_devicetype'] === 1 ? 'Android' : 'iOS',
                    sessionId: record['cr971_sessionid'],
                };
            }

            usersData[userId].points.push({
                lat: record['cr971_latitude'],
                lng: record['cr971_longitude'],
                speed: record['cr971_speed'],
                heading: record['cr971_heading'],
                timestamp: record['cr971_timestamp'],
                distance: record['cr971_distance'],
                accuracy: record['cr971_accuracy'],
            });

            usersData[userId].totalDistance = record['cr971_distance'] || 0;
            usersData[userId].lastUpdate = record['cr971_timestamp'];
        }

        void resolveUserDisplayNames();
    }

    /**
     * Asynchronously resolves the display names of users whose IDs are valid GUIDs
     * by querying the `systemusers` entity. Falls back to the session ID.
     */
    async function resolveUserDisplayNames() {
        const guidPattern = /^[0-9a-f-]{36}$/i;
        const resolvableIds = Object.keys(usersData).filter(
            (id) => id !== 'unknown' && guidPattern.test(id),
        );

        await Promise.allSettled(
            resolvableIds.map(async (userId) => {
                try {
                    const url = `${getOrgBaseUrl()}/api/data/v9.2/systemusers(${userId})?$select=fullname`;
                    const result = await fetchFromCrm(url);
                    if (result?.fullname) {
                        usersData[userId].name = result.fullname;
                    }
                } catch {
                    usersData[userId].name =
                        usersData[userId].sessionId || userId.substring(0, 8);
                }
            }),
        );

        // Apply fallback names for any still unresolved users.
        Object.values(usersData).forEach((user) => {
            if (user.name === 'User') {
                user.name = user.sessionId || user.userId.substring(0, 8);
            }
        });

        renderUserList();
    }

    // ─────────────────────────────────────────────────────────
    // Map Rendering
    // ─────────────────────────────────────────────────────────

    /**
     * Re-renders all user trails and current-position markers on the map.
     * Auto-fits the camera to encompass all active users.
     */
    function renderMap() {
        if (!datasource) return;

        datasource.clear();

        const allCurrentPositions = [];

        Object.values(usersData).forEach((user) => {
            if (user.points.length === 0) return;

            if (user.points.length > 1) {
                const lineCoordinates = user.points.map((p) => [p.lng, p.lat]);
                datasource.add(
                    new atlas.data.Feature(
                        new atlas.data.LineString(lineCoordinates),
                        { userId: user.userId, type: 'trail' },
                    ),
                );
                addTrailLayerForUser(user.userId, user.colour);
            }

            const latestPoint = user.points[user.points.length - 1];
            datasource.add(
                new atlas.data.Feature(
                    new atlas.data.Point([latestPoint.lng, latestPoint.lat]),
                    {
                        userId: user.userId,
                        userName: user.name,
                        type: 'current-position',
                        color: user.colour,
                    },
                ),
            );

            allCurrentPositions.push([latestPoint.lng, latestPoint.lat]);
        });

        if (allCurrentPositions.length > 0) {
            const boundingBox = atlas.data.BoundingBox.fromPositions(allCurrentPositions);
            map.setCamera({
                bounds: boundingBox,
                padding: 80,
                type: 'ease',
                duration: CONFIG.cameraAnimationDurationMs,
            });
        }
    }

    // ─────────────────────────────────────────────────────────
    // Sidebar Rendering
    // ─────────────────────────────────────────────────────────

    /**
     * Re-renders the user list sidebar from the current {@link usersData} state.
     */
    function renderUserList() {
        const userEntries = Object.values(usersData);
        userCountBadge.textContent = String(userEntries.length);

        if (userEntries.length === 0) {
            userListContainer.innerHTML = buildEmptyStateHtml();
            return;
        }

        userListContainer.innerHTML = userEntries.map(buildUserCardHtml).join('');
    }

    /**
     * Builds the HTML string for the empty-state placeholder.
     *
     * @returns {string} An HTML string for the empty state element.
     */
    function buildEmptyStateHtml() {
        return (
            '<div class="empty-state">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="12" cy="10" r="3"/>' +
            '<path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z"/>' +
            '</svg>' +
            '<p>No active users</p>' +
            '<p class="subtle">Users will appear here when they start tracking</p>' +
            '</div>'
        );
    }

    /**
     * Builds the HTML string for a single user card in the sidebar.
     *
     * @param {UserTrackingData} user - The user data to render.
     * @returns {string} An HTML string for the user card element.
     */
    function buildUserCardHtml(user) {
        const isSelected = selectedUserId === user.userId;
        const isActive =
            user.lastUpdate !== null &&
            Date.now() - new Date(user.lastUpdate).getTime() < CONFIG.activeUserThresholdMs;
        const timeSinceLabel = user.lastUpdate ? formatTimeSince(user.lastUpdate) : 'unknown';

        return (
            `<div class="user-card${isSelected ? ' active' : ''}" ` +
            `onclick="window._selectUser('${user.userId}')">` +
            `<div class="user-avatar" style="background:${user.colour}">` +
            escapeHtml(user.name.charAt(0).toUpperCase()) +
            '</div>' +
            '<div class="user-info">' +
            `<div class="user-name">${escapeHtml(user.name)}</div>` +
            '<div class="user-details">' +
            `${user.totalDistance.toFixed(2)} km · ${user.points.length} pts · ${timeSinceLabel}` +
            '</div></div>' +
            `<div class="status-dot ${isActive ? 'active' : 'inactive'}"></div>` +
            '</div>'
        );
    }

    // ─────────────────────────────────────────────────────────
    // User Selection & Metrics
    // ─────────────────────────────────────────────────────────

    /**
     * Selects a user, centres the map on their latest position,
     * and populates the metrics overlay panel.
     *
     * @param {string} userId - The unique identifier of the user to select.
     */
    function selectUser(userId) {
        const user = usersData[userId];
        if (!user) return;

        selectedUserId = userId;

        populateMetricsPanel(user);
        metricsOverlay.style.display = 'block';

        const latestPoint = user.points[user.points.length - 1];
        if (latestPoint) {
            map.setCamera({
                center: [latestPoint.lng, latestPoint.lat],
                zoom: 15,
                type: 'ease',
                duration: CONFIG.cameraAnimationDurationMs,
            });
        }

        renderUserList();
    }

    /**
     * Populates the metrics overlay with data from the selected user.
     *
     * @param {UserTrackingData} user - The user whose metrics to display.
     */
    function populateMetricsPanel(user) {
        setElementText('metricsUserName', user.name);
        setElementText('metricDistance', user.totalDistance.toFixed(2));
        setElementText('metricPoints', String(user.points.length));

        if (user.points.length >= 2) {
            const sessionStartMs = new Date(user.points[0].timestamp).getTime();
            const sessionEndMs = new Date(user.points[user.points.length - 1].timestamp).getTime();
            const durationMs = sessionEndMs - sessionStartMs;

            setElementText('metricDuration', formatDuration(durationMs));

            const elapsedHours = durationMs / 3_600_000;
            const avgSpeedKmh = elapsedHours > 0 ? user.totalDistance / elapsedHours : 0;
            setElementText('metricSpeed', avgSpeedKmh.toFixed(1));
        } else {
            setElementText('metricDuration', '00:00:00');
            setElementText('metricSpeed', '0.0');
        }
    }

    // Expose selectUser for inline onclick handlers in dynamically built HTML.
    window._selectUser = selectUser;

    // ─────────────────────────────────────────────────────────
    // Marker Click Handler
    // ─────────────────────────────────────────────────────────

    /**
     * Handles click events on user markers in the map.
     *
     * @param {atlas.MapMouseEvent} event - The Atlas mouse event.
     */
    function handleMarkerClick(event) {
        if (event.shapes && event.shapes.length > 0) {
            const properties = event.shapes[0].getProperties();
            selectUser(properties.userId);
        }
    }

    // ─────────────────────────────────────────────────────────
    // Search / Filter
    // ─────────────────────────────────────────────────────────

    /**
     * Filters the visible user cards in the sidebar based on the current
     * search input value. Case-insensitive substring match on the display name.
     */
    function filterUserListBySearchTerm() {
        const searchTerm = searchInput.value.toLowerCase();
        const userCards = userListContainer.querySelectorAll('.user-card');
        userCards.forEach((card) => {
            const nameElement = card.querySelector('.user-name');
            const isVisible = nameElement
                ? nameElement.textContent.toLowerCase().includes(searchTerm)
                : true;
            card.style.display = isVisible ? '' : 'none';
        });
    }

    // ─────────────────────────────────────────────────────────
    // Auto-refresh
    // ─────────────────────────────────────────────────────────

    /**
     * Starts the auto-refresh interval. Stops any existing interval first.
     */
    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(loadTrackingData, CONFIG.refreshIntervalMs);
    }

    /**
     * Stops and clears the auto-refresh interval.
     */
    function stopAutoRefresh() {
        if (refreshTimer !== null) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    // ─────────────────────────────────────────────────────────
    // D365 / Xrm Helpers
    // ─────────────────────────────────────────────────────────

    /**
     * Returns the base URL of the host Dynamics 365 organisation.
     * Uses the Xrm context when available (inside CRM), falling back
     * to `window.location.origin` for standalone development testing.
     *
     * @returns {string} The CRM organisation base URL.
     */
    function getOrgBaseUrl() {
        if (
            typeof Xrm !== 'undefined' &&
            Xrm.Utility &&
            typeof Xrm.Utility.getGlobalContext === 'function'
        ) {
            return Xrm.Utility.getGlobalContext().getClientUrl();
        }
        return window.location.origin;
    }

    /**
     * Executes an authenticated fetch against the D365 Web API.
     * Uses the browser's session cookie (`credentials: 'include'`) which is valid
     * within the CRM web resource iframe context.
     *
     * @param {string} url - The fully-qualified OData request URL.
     * @returns {Promise<Object>} Parsed JSON response body.
     * @throws {Error} When the API responds with a non-2xx status code.
     */
    async function fetchFromCrm(url) {
        const oDataHeaders = {
            Accept: 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, {
            headers: oDataHeaders,
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(
                `CRM Web API request failed [${response.status}]: ${response.statusText}`,
            );
        }

        return response.json();
    }

    // ─────────────────────────────────────────────────────────
    // Utility Helpers
    // ─────────────────────────────────────────────────────────

    /**
     * Returns the next colour from the round-robin palette.
     *
     * @returns {string} A hex colour string.
     */
    function getNextColour() {
        const colour = USER_COLOUR_PALETTE[nextColourIndex % USER_COLOUR_PALETTE.length];
        nextColourIndex++;
        return colour;
    }

    /**
     * Formats a duration in milliseconds to `HH:MM:SS`.
     *
     * @param {number} totalMs - Duration in milliseconds.
     * @returns {string} Zero-padded hours:minutes:seconds string.
     */
    function formatDuration(totalMs) {
        if (!totalMs || totalMs < 0) return '00:00:00';

        const totalSeconds = Math.floor(totalMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${zeroPad(hours)}:${zeroPad(minutes)}:${zeroPad(seconds)}`;
    }

    /**
     * Zero-pads a number to at least two digits.
     *
     * @param {number} value - Non-negative integer to pad.
     * @returns {string} Zero-padded string.
     */
    function zeroPad(value) {
        return value < 10 ? `0${value}` : String(value);
    }

    /**
     * Returns a human-readable relative time label (e.g., "5m ago", "2h ago").
     *
     * @param {string} isoTimestamp - ISO 8601 timestamp string.
     * @returns {string} Relative time label.
     */
    function formatTimeSince(isoTimestamp) {
        const elapsedMs = Date.now() - new Date(isoTimestamp).getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60_000);

        if (elapsedMinutes < 1) return 'now';
        if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

        const elapsedHours = Math.floor(elapsedMinutes / 60);
        if (elapsedHours < 24) return `${elapsedHours}h ago`;

        return `${Math.floor(elapsedHours / 24)}d ago`;
    }

    /**
     * Converts a `Date` to a `YYYY-MM-DD` string for use as an `<input type="date">` value.
     *
     * @param {Date} date - The date to format.
     * @returns {string} ISO-format date string (date part only).
     */
    function toDateInputValue(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Safely sets the `textContent` of a DOM element by ID.
     *
     * @param {string} elementId - Target element ID.
     * @param {string} text      - Text content to set.
     */
    function setElementText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * Toggles the loading overlay visibility.
     *
     * @param {boolean} isVisible - Whether to show (`true`) or hide (`false`) the overlay.
     */
    function setLoadingVisible(isVisible) {
        loadingOverlay.className = isVisible ? 'loading-overlay' : 'loading-overlay hidden';
    }

    /**
     * Escapes a string for safe insertion into HTML content.
     * Prevents XSS from user-controlled display names.
     *
     * @param {string} rawString - The untrusted string to escape.
     * @returns {string} HTML-safe escaped string.
     */
    function escapeHtml(rawString) {
        const temporaryElement = document.createElement('div');
        temporaryElement.textContent = rawString;
        return temporaryElement.innerHTML;
    }

    // ─────────────────────────────────────────────────────────
    // Bootstrap
    // ─────────────────────────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
