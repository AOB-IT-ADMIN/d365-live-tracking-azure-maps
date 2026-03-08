# Azure AD App Registration Guide

This guide walks you through creating an Azure AD (Entra ID) app registration for the D365 Live Tracker mobile app.

---

## Step 1: Register the Application

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID → App registrations → New registration**
3. Fill in:
   - **Name**: `D365 Live Tracker`
   - **Supported account types**: `Accounts in this organizational directory only`
4. Click **Register**

## Step 2: Note the Client ID

From the **Overview** page, copy:

| Field | Where Used |
|---|---|
| **Application (client) ID** | Entered by user in the mobile app Connection Setup screen |
| Directory (tenant) ID | Not required — app uses `organizations` tenant for multi-org support |

## Step 3: Configure API Permissions

1. Go to **API permissions → Add a permission**
2. Select **APIs my organization uses** → search **Dynamics CRM**
3. Select **Delegated permissions** → check **`user_impersonation`**
4. Click **Add permissions**
5. Click **Grant admin consent for [your org]** ✅

Final permissions table:

| API | Permission | Type | Status |
|---|---|---|---|
| Dynamics CRM | `user_impersonation` | Delegated | ✅ Granted |

## Step 4: Configure Redirect URIs

1. Go to **Authentication → Add a platform → Mobile and desktop applications**
2. Add the following redirect URIs:

| URI | When Used |
|---|---|
| `exp://192.168.x.x:8081` | Expo Go development (replace with your machine's LAN IP) |
| `exp://localhost:8081` | Expo Go on simulator |
| `d365livetracker://auth` | Production standalone build |

3. Under **Advanced settings**: set **Allow public client flows** → **Yes**
4. Click **Save**

## Step 5: Distribute to Users

Provide each user with:

1. **Application (client) ID** from Step 2
2. **Dynamics 365 URL** — e.g. `https://yourorg.crm.dynamics.com`

On first launch, users enter these in the **Connection Setup** screen. They are stored securely in the device Keychain — no code changes needed per client.

> **The entity prefix `cr971_` is built into the app and does NOT need to be provided to users.**

---

## Security Notes

- Uses **delegated permissions** — acts on behalf of the signed-in user only
- No client secret required (this is a public client / mobile app)
- Tokens stored with `expo-secure-store` (iOS Keychain / Android Keystore)
- Consider adding **Conditional Access** policies for additional MFA enforcement
