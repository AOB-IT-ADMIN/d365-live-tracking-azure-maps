# CRM Entity Setup Guide

This guide describes how to create the `cr971_livetracking` custom entity in Dynamics 365 CRM.

> **Publisher prefix `cr971_` is fixed for all deployments of this solution.**

---

## Entity Overview

| Property | Value |
|---|---|
| Display Name | Live Tracking |
| Plural Name | Live Trackings |
| Logical Name | `cr971_livetracking` |
| Entity Set Name (OData) | `cr971_livetrackings` |
| Ownership | User/Team |

---

## Step 1: Create the Entity

1. Go to **Settings → Customizations → Customize the System**
2. Click **Entities → New**
3. Fill in:
   - **Display Name**: `Live Tracking`
   - **Plural Name**: `Live Trackings`
   - **Name**: `livetracking` (prefix `cr971_` is auto-applied)
   - **Ownership**: `User or Team`
4. Disable all **Communication & Collaboration** options (not needed)
5. Click **Save**

---

## Step 2: Add Fields

Navigate to the entity's **Fields** section and create each field below.

### Core Location Fields

| Display Name | Logical Name | Type | Precision / Details |
|---|---|---|---|
| Latitude | `cr971_latitude` | Decimal Number | Precision: 10, Min: -90, Max: 90 |
| Longitude | `cr971_longitude` | Decimal Number | Precision: 10, Min: -180, Max: 180 |
| Altitude | `cr971_altitude` | Decimal Number | Precision: 2 |
| Speed | `cr971_speed` | Decimal Number | Precision: 2 (m/s) |
| Heading | `cr971_heading` | Decimal Number | Precision: 1, Min: 0, Max: 360 |
| Accuracy | `cr971_accuracy` | Decimal Number | Precision: 1 (metres) |

### Session & Tracking Fields

| Display Name | Logical Name | Type | Details |
|---|---|---|---|
| Timestamp | `cr971_timestamp` | Date and Time | Format: Date and Time, Behavior: User Local |
| Session ID | `cr971_sessionid` | Single Line of Text | Max: 150 chars |
| Distance | `cr971_distance` | Decimal Number | Precision: 3 (kilometres) |

### Device Fields

| Display Name | Logical Name | Type | Details |
|---|---|---|---|
| Device Type | `cr971_devicetype` | Option Set | Options: Android (1), iOS (2) |
| Battery Level | `cr971_batterylevel` | Whole Number | Min: 0, Max: 100 |

---

## Step 3: Create the Device Type Option Set

For `cr971_devicetype`, create a **local option set**:

| Label | Value |
|---|---|
| Android | 1 |
| iOS | 2 |

---

## Step 4: Create Views

### Active Tracking View
- **Filter**: `cr971_timestamp` = Today
- **Columns**: Session ID, Latitude, Longitude, Speed, Timestamp
- **Sort**: Timestamp descending

### Tracking by Session View
- **Filter**: None
- **Columns**: Session ID, Distance, Timestamp
- **Sort**: Session ID, then Timestamp

---

## Step 5: Security Role Configuration

Assign the following privileges on `cr971_livetracking` to the **Salesperson** security role:

| Privilege | Level |
|---|---|
| Create | Organization |
| Read | Organization |
| Write | User |
| Delete | User |
| Append | Organization |
| Append To | Organization |

Then assign the **Salesperson** role to each user who will use the mobile app.

---

## Step 6: Publish

Click **Publish All Customizations**.

---

## Field Reference (for Developers)

All field names are also accessible in code via `D365_CONFIG.fields` in `config.ts`:

```typescript
import { D365_CONFIG } from '../constants/config';

const { fields, trackingEntity } = D365_CONFIG;

// Entity set name for OData
console.log(trackingEntity);        // → 'cr971_livetrackings'

// Field names
console.log(fields.latitude);       // → 'cr971_latitude'
console.log(fields.timestamp);      // → 'cr971_timestamp'
console.log(fields.sessionId);      // → 'cr971_sessionid'
```
