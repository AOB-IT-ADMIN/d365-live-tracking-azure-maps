# Architecture Documentation

## System Overview

The D365 Live Tracking system consists of three main components:

```
┌──────────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│   📱 Mobile App      │     │   🔐 Azure AD    │     │   📦 D365 CRM            │
│   (Expo / RN)        │────▶│   (Entra ID)     │     │   (Dataverse)            │
│                      │     └──────────────────┘     │                          │
│  • OAuth2 Auth       │           Access Token        │  • cr971_livetracking    │
│  • GPS Tracking      │                │               │    entity                │
│  • Offline Queue     │     ┌──────────┘               │  • OData Web API v9.2   │
│  • Batch Upload      │─────┼──────────────────────────▶│                          │
│                      │     POST /api/data/v9.2/       │                          │
└──────────────────────┘     cr971_livetrackings        └──────────┬──────────────┘
                                                                   │
                                                        GET (every 15 sec)
                                                                   │
                                                        ┌──────────▼──────────────┐
                                                        │   🗺️ Azure Maps         │
                                                        │   Web Resource           │
                                                        │   (cr971_LiveTrackingMap)│
                                                        │                          │
                                                        │  • Real-time markers     │
                                                        │  • Session trails        │
                                                        │  • Metrics sidebar       │
                                                        └──────────────────────────┘
```

---

## Data Flow

### 1. Authentication
```
Mobile App → expo-auth-session → Azure AD (MSAL) → Access Token
                                                          └→ Scoped to Dynamics CRM user_impersonation
```

### 2. Location Tracking (every 5 seconds / 2 metres)
```
GPS Sensor → expo-location → LocationService → TrackingManager
                                  │                   │
                              jitter filter     batch (5 records)
                                  │                   │
                              onLocationUpdate      D365Client.batchCreateRecords()
                                  │                   │
                              UI state update      POST → cr971_livetrackings
```

Offline resilience:
```
Failed POST → QueuedLocation (AsyncStorage) → retried on next flush cycle
              max 5 retries → discard
```

### 3. Map Visualization (every 15 seconds)
```
Azure Maps Web Resource → fetch (session cookie) → D365 API → cr971_livetrackings
         │                                                              │
         └── processTrackingRecords() → group by sessionId             │
         └── renderMap() → Azure Maps datasource + markers ◀───────────┘
         └── renderUserList() → sidebar panel
```

---

## Project Structure

```
d365-live-tracking/
├── mobile-app/                        # React Native / Expo application
│   ├── app/
│   │   ├── (auth)/login.tsx           # Connection setup + sign-in screen
│   │   ├── (tabs)/dashboard.tsx       # Start/stop tracking, live status
│   │   ├── (tabs)/history.tsx         # Past session viewer
│   │   └── (tabs)/settings.tsx        # Config and sign-out
│   └── src/
│       ├── auth/AuthProvider.tsx       # OAuth2 token management
│       ├── constants/config.ts         # D365_CONFIG (fields), LOCATION_CONFIG, COLORS
│       ├── services/
│       │   ├── D365Client.ts           # OData Web API wrapper
│       │   ├── LocationService.ts      # GPS engine + session management
│       │   └── TrackingManager.ts      # Pipeline orchestrator
│       └── types/index.ts             # TrackingRecord, TrackingHistoryEntry interfaces
│
├── crm-webresource/                   # D365 map web resource
│   ├── html/LiveTrackingMap.html      # Shell page, SDK loader
│   ├── css/LiveTrackingMap.css        # Map and UI styles
│   └── js/LiveTrackingMap.js          # Map logic, data fetching, rendering
│
└── docs/                              # This documentation
    ├── setup-guide.md
    ├── crm-entity-setup.md
    ├── azure-ad-config.md
    ├── architecture.md                 ← you are here
    └── admin-user-guide.md
```

---

## Key Design Decisions

### Why Expo + React Native?
- Cross-platform (iOS + Android) from a single codebase
- `expo-location` provides a unified high-accuracy GPS API
- `expo-task-manager` enables background location tracking (production builds)
- Hot-reload development cycle speeds iteration

### Why OAuth2 Authorization Code Flow?
- No client secret stored in the app (public client / PKCE)
- Token refresh happens silently in the background
- Tokens stored in iOS Keychain / Android Keystore via `expo-secure-store`

### Why OData $batch for uploads?
- D365 has API throttling limits (~6,000 requests / 5 min)
- Batching 5 records per call reduces HTTP requests by 80%
- Reduces battery drain from network activity

### Why polling for the map?
- D365 CRM web resources operate in a sandboxed context without WebSocket support
- 15-second polling provides a near-real-time experience with minimal server load
- Upgrade path: Azure SignalR + Azure Functions for true real-time streaming

---

## Scalability Considerations

| Concern | Mitigation |
|---|---|
| API throttling | Batch API calls, exponential backoff retry |
| Large datasets | Date filtering + `$top` pagination in all queries |
| Battery drain | Minimum 5s interval + 2m distance filter; jitter smoothing |
| Offline mode | AsyncStorage queue, auto-retry on reconnect, discard after 5 attempts |
| Many users on map | Azure Maps marker clustering when zoomed out |
| Multiple simultaneous trackers | Records grouped by `cr971_sessionid`; each shown as separate trail |

---

## Security Model

| Layer | Implementation |
|---|---|
| Authentication | Azure AD OAuth2 PKCE flow |
| Authorization | D365 security roles control entity CRUD access |
| Token storage | `expo-secure-store` (OS-level encrypted) |
| Data in transit | HTTPS/TLS on all API endpoints |
| Data at rest | Microsoft Dataverse platform encryption |
| Web resource access | D365 session cookie (same-origin fetch in CRM context) |
