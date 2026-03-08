# Admin & User Guide: D365 Live Tracker

---

## 👨‍💼 Administrator — One-Time Setup

### 1. Azure AD App Registration
Follow [azure-ad-config.md](azure-ad-config.md) and:
- Register **D365 Live Tracker** app
- Grant **Dynamics CRM → `user_impersonation`** API permission + admin consent
- Add redirect URIs (Expo Go + production)
- Copy the **Application (client) ID**

### 2. Create CRM Entity
Follow [crm-entity-setup.md](crm-entity-setup.md) to create:
- Entity: **`cr971_livetracking`** with all required fields
- Security role: Grant Create / Read / Write on `cr971_livetracking` to **Salesperson** role
- Publish all customizations

### 3. Upload Web Resources
Upload from `crm-webresource/` in this order:

| File | Name in D365 | Type |
|---|---|---|
| `css/LiveTrackingMap.css` | `cr971_LiveTrackingMapCSS` | CSS |
| `js/LiveTrackingMap.js` | `cr971_LiveTrackingMapJS` | JavaScript |
| `html/LiveTrackingMap.html` | `cr971_LiveTrackingMapHTML` | HTML |

> ⚠️ Publish **All Customizations** after uploading.

### 4. Configure Azure Maps Key
In `LiveTrackingMap.js`, the `CONFIG` block at the top contains:
```js
const CONFIG = {
    azureMapsKey: 'YOUR_AZURE_MAPS_KEY_HERE',
    ...
};
```
Replace with your actual Azure Maps **Subscription Key** and re-upload.

### 5. Distribute to Users
Send each user:
- **Application (client) ID** (from Step 1)
- **Dynamics 365 URL** (e.g., `https://yourorg.crm.dynamics.com`)

---

## 👨‍💼 Administrator — Daily Monitoring

### View the Live Map
Open in a D365-authenticated browser:
```
https://<your-org>.crm.dynamics.com/WebResources/cr971_LiveTrackingMapHTML
```

Or embed as a **Dashboard component** in D365 for easy daily access.

### Map Features
| Feature | Description |
|---|---|
| 📍 Live markers | Current position of each tracked user |
| 🔵 Trail line | Full route for each session |
| 📊 Metrics panel | Distance, duration, speed per user |
| 📅 Date filter | Filter to any past date |
| 🔄 Auto-refresh | Map updates every 15 seconds |

---

## 🏃‍♂️ User (Sales Rep) — First Launch

### Step 1: Connection Setup
On first launch, enter:
- **Azure AD Client ID** → provided by your IT admin
- **Dynamics 365 URL** → provided by your IT admin (e.g. `https://yourcompany.crm.dynamics.com`)

Tap **Save Configuration** — this is saved securely and only needs to be entered once.

### Step 2: Sign In
Tap **Sign in with Microsoft** and log in with your company Microsoft 365 account.

### Step 3: Start Tracking
1. Open the **Dashboard** tab
2. Tap **Start Tracking** — a green indicator appears
3. Your GPS location is sent to D365 every 5–15 seconds
4. When done, tap **Stop Tracking**

### Step 4: View History
The **History** tab shows all past sessions with:
- Start / end time
- Total distance
- Number of GPS points recorded
- Individual point coordinates and speed

---

## ❓ Troubleshooting

| Problem | Solution |
|---|---|
| Map shows blank / no markers | Re-upload & publish `cr971_LiveTrackingMapJS` |
| Login fails — redirect error | Ask admin to verify redirect URIs in Azure AD |
| No data in CRM | Check Salesperson security role has Create permission on `cr971_livetracking` |
| Android background stops | Background location not supported in Expo Go — use a production build |
| Wrong config entered | Settings tab → **Clear Connection Config** → re-enter |
