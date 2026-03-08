# D365 Live Tracking — Setup Guide

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | v18 or later |
| Expo CLI | `npm install -g expo-cli` |
| Expo Go (mobile) | From App Store / Google Play |
| Azure AD App Registration | See [azure-ad-config.md](azure-ad-config.md) |
| Dynamics 365 CRM | Environment with System Customizer role |
| Azure Maps | Subscription key |

---

## Part 1 — Dynamics 365 Setup

### Step 1: Create Publisher & Solution

1. Go to **make.powerapps.com** → **Solutions** → **New Solution**
2. Create a publisher with prefix **`cr971`** (this is fixed for all deployments)
3. Name the solution **Live Tracking App**

### Step 2: Create the Custom Entity

Follow [crm-entity-setup.md](crm-entity-setup.md) to create:
- Entity: **`cr971_livetracking`** (plural: `cr971_livetrackings`)
- All fields with prefix `cr971_`

### Step 3: Upload Web Resources

Upload the three files from `crm-webresource/` in this order:

| File | Web Resource Name | Type |
|---|---|---|
| `css/LiveTrackingMap.css` | `cr971_LiveTrackingMapCSS` | CSS |
| `js/LiveTrackingMap.js` | `cr971_LiveTrackingMapJS` | JavaScript |
| `html/LiveTrackingMap.html` | `cr971_LiveTrackingMapHTML` | HTML |

Go to **Settings → Customizations → Customize the System → Web Resources → New**

> After uploading all three, click **Publish All Customizations**.

### Step 4: Configure Security Role

Assign the following privileges on **`cr971_livetracking`** to the **Salesperson** role:

| Privilege | Level |
|---|---|
| Create | Organization |
| Read | Organization |
| Write | User |

Then assign the **Salesperson** role to each user who will use the mobile app.

### Step 5: Open the Live Map

```
https://<your-org>.crm.dynamics.com/WebResources/cr971_LiveTrackingMapHTML
```

---

## Part 2 — Azure AD App Registration

See [azure-ad-config.md](azure-ad-config.md) for full steps.

**Quick summary:**
1. Register an app in **portal.azure.com** → Azure Active Directory → App registrations
2. Add Redirect URIs:
   - `exp://YOUR_LAN_IP:8081` (for Expo Go — replace `YOUR_LAN_IP` with your machine's local network IP, e.g. `192.168.1.100`)
   - `d365livetracker://auth` (for production standalone build)
3. Add API Permission: `Dynamics CRM → user_impersonation`
4. Note the **Application (client) ID** — users enter this in the app

---

## Part 3 — Mobile App Setup

### Step 1: Install Dependencies

```bash
cd mobile-app
npm install
```

### Step 2: Start Expo Dev Server

```bash
npx expo start -c
```

Scan the QR code in **Expo Go** on your mobile device.

### Step 3: First Launch — Connection Setup

On first launch, enter:

| Field | Value |
|---|---|
| Azure AD Client ID | Your App Registration Client ID |
| Dynamics 365 URL | `https://yourorg.crm.dynamics.com` |

> **Note:** The entity prefix `cr971_` is fixed and built into the app — no need to enter it.

### Step 4: Sign In & Track

1. Tap **Sign in with Microsoft** and log in with your D365 credentials
2. On the **Dashboard** tab, tap **Start Tracking**
3. Check the Live Map web resource — your location appears within 15–30 seconds

---

## Part 4 — Production Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure build
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

Register redirect URI `d365livetracker://auth` in Azure AD before distributing the production build.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Map shows no markers | Check that `cr971_LiveTrackingMapJS` is the latest version (re-upload and publish) |
| Login fails | Verify redirect URI is registered in Azure AD |
| No records in CRM | Check Salesperson security role has Create permission on `cr971_livetracking` |
| Background tracking on Android | Not supported in Expo Go — use a development build |
