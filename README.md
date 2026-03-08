# D365 Live Tracking — Azure Maps

Real-time GPS location tracking for Dynamics 365 CRM, visualised on Azure Maps.

---

## What It Does

| Feature | Details |
|---|---|
| 📱 Mobile App | React Native (Expo) — iOS & Android |
| 🔐 Authentication | Azure AD (Entra ID) OAuth2 / PKCE |
| 📍 GPS Tracking | 5-second intervals, 2-metre minimum movement |
| ☁️ Sync | OData batch upload to D365 Dataverse |
| 🗺️ Map Dashboard | Azure Maps web resource embedded in D365 |
| 📜 History | Session replay per user in the mobile app |

---

## Quick Start

### Prerequisites
- D365 CRM environment (System Customizer role)
- Azure AD App Registration (see [docs/azure-ad-config.md](docs/azure-ad-config.md))
- Azure Maps subscription key
- Node.js 18+, Expo Go on your phone

### Setup
```bash
cd mobile-app
npm install
npx expo start -c
```

Full instructions: [docs/setup-guide.md](docs/setup-guide.md)

---

## Repository Structure

```
.
├── mobile-app/                   # Expo React Native app
│   ├── app/                      # Expo Router screens
│   │   ├── (auth)/login.tsx      # Connection setup + sign-in
│   │   └── (tabs)/               # Dashboard, History, Settings
│   └── src/
│       ├── auth/AuthProvider.tsx  # Token management (SecureStore)
│       ├── constants/config.ts    # D365_CONFIG, LOCATION_CONFIG, theme
│       ├── services/
│       │   ├── D365Client.ts      # OData Web API client
│       │   ├── LocationService.ts # GPS engine + session manager
│       │   └── TrackingManager.ts # Upload pipeline (batch + retry)
│       └── types/index.ts         # TrackingRecord, TrackingHistoryEntry
│
├── crm-webresource/              # D365 web resource (map dashboard)
│   ├── html/LiveTrackingMap.html  → cr971_LiveTrackingMapHTML
│   ├── css/LiveTrackingMap.css    → cr971_LiveTrackingMapCSS
│   └── js/LiveTrackingMap.js      → cr971_LiveTrackingMapJS
│
└── docs/
    ├── setup-guide.md             # End-to-end deployment guide
    ├── crm-entity-setup.md        # Entity + field creation steps
    ├── azure-ad-config.md         # App registration walkthrough
    ├── architecture.md            # System design + data flow
    └── admin-user-guide.md        # Daily use for admins and reps
```

---

## Key Configuration

### Publisher Prefix
All Dataverse entity and field names use the prefix **`cr971_`** — this is fixed for all deployments of this solution.

Field names are centralised in `D365_CONFIG.fields` in `src/constants/config.ts`:

```typescript
export const D365_CONFIG = {
    entityPrefix:   'cr971_',
    trackingEntity: 'cr971_livetrackings',
    fields: {
        latitude:   'cr971_latitude',
        longitude:  'cr971_longitude',
        timestamp:  'cr971_timestamp',
        sessionId:  'cr971_sessionid',
        // ... see config.ts for full list
    },
};
```

### Runtime Configuration (per client)
Only two values need to be set by the end-user at first launch:

| Value | Entered by |
|---|---|
| Azure AD Client ID | User (provided by IT admin) |
| Dynamics 365 URL | User (provided by IT admin) |

These are stored in the device Keychain via `expo-secure-store`.

### Azure Maps Key
Set in `crm-webresource/js/LiveTrackingMap.js`:

```js
const CONFIG = {
    azureMapsKey: 'YOUR_AZURE_MAPS_SUBSCRIPTION_KEY',
    ...
};
```

---

## Documentation

| Doc | Purpose |
|---|---|
| [Setup Guide](docs/setup-guide.md) | Full end-to-end deployment |
| [CRM Entity Setup](docs/crm-entity-setup.md) | Entity and field creation |
| [Azure AD Config](docs/azure-ad-config.md) | App registration and permissions |
| [Architecture](docs/architecture.md) | System design and data flow |
| [Admin & User Guide](docs/admin-user-guide.md) | Day-to-day usage |
