# Push Notifications Setup Guide

One-time configuration steps required to enable iOS push notifications.

---

## 1. Apple Developer Portal

**Required for: Development + Production**

Go to [developer.apple.com](https://developer.apple.com) and sign in.

### 1.1 Enable Push Notifications on the App ID

1. Navigate to **Certificates, Identifiers & Profiles** > **Identifiers**
2. Select your app's identifier (Bundle ID)
3. Scroll to **Capabilities** and enable **Push Notifications**
4. Click **Save**

> This single toggle covers both development (sandbox) and production environments.

### 1.2 Generate an APNs Authentication Key (.p8)

1. Navigate to **Certificates, Identifiers & Profiles** > **Keys**
2. Click the **+** button to create a new key
3. Give it a name (e.g., `APNs Push Key`)
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue**, then **Register**
6. **Download the `.p8` file immediately** -- Apple only allows one download
7. Note the **Key ID** shown on the confirmation page (10-character string, e.g., `ABC123DEFG`)
8. Note your **Team ID** -- visible in the top-right corner of the portal or under **Membership Details** (also a 10-character string)

> The `.p8` key works for all apps under your team, for both sandbox and production APNs. It never expires. Store it securely.

### Values to record

| Value | Example | Where to find it |
|-------|---------|------------------|
| Key ID | `ABC123DEFG` | Keys page, after creating the key |
| Team ID | `XYZ987UVWX` | Membership Details or top-right of portal |
| Bundle ID | `com.dbv.scoutmission` | Identifiers page |
| .p8 file | `AuthKey_ABC123DEFG.p8` | Downloaded during key creation |

---

## 2. Xcode Project Settings

**Required for: Development + Production**

Open the project in Xcode (`dbv-nfc-ios/dbv-nfc-games.xcodeproj`).

### 2.1 Add Push Notifications Capability

1. Select the project in the navigator
2. Select the **dbv-nfc-games** target
3. Go to the **Signing & Capabilities** tab
4. Click **+ Capability**
5. Search for and add **Push Notifications**

This adds the `aps-environment` entitlement to the app. Xcode will automatically set it to `development` for debug builds and `production` for release/archive builds.

### 2.2 (Optional) Add Background Modes

Only needed if you want to support silent push notifications in the future (e.g., background data refresh).

1. In the same **Signing & Capabilities** tab, click **+ Capability**
2. Add **Background Modes**
3. Check **Remote notifications**

> Not required for basic visible push notifications. Can be added later.

---

## 3. Backend Server Configuration

### 3.1 Development Environment

**Required for: Development only**

Place the `.p8` file in the backend resources directory:

```
backend/src/main/resources/AuthKey_XXXXXXXX.p8
```

Add to `application.properties` (or `application-dev.properties`):

```properties
apns.key-path=classpath:AuthKey_XXXXXXXX.p8
apns.key-id=YOUR_KEY_ID
apns.team-id=YOUR_TEAM_ID
apns.bundle-id=com.dbv.scoutmission
apns.production=false
```

> With `apns.production=false`, the backend connects to `api.sandbox.push.apple.com`, which delivers pushes to apps built with a development provisioning profile (i.e., running from Xcode or TestFlight internal builds).

### 3.2 Production Environment

**Required for: Production only**

For the production server (Docker), mount the `.p8` file or provide it via a secret. Do **not** commit it to the repository.

Option A -- Mount as a Docker volume (add to `docker-compose.yml`):

```yaml
backend:
  volumes:
    - ./secrets/AuthKey_XXXXXXXX.p8:/app/config/apns-key.p8
```

Option B -- Store as an environment variable (base64-encoded):

```bash
APNS_KEY_BASE64=$(base64 < AuthKey_XXXXXXXX.p8)
```

Set the configuration via environment variables:

```properties
apns.key-path=/app/config/apns-key.p8   # or handle base64 decoding in code
apns.key-id=YOUR_KEY_ID
apns.team-id=YOUR_TEAM_ID
apns.bundle-id=com.dbv.scoutmission
apns.production=true
```

> With `apns.production=true`, the backend connects to `api.push.apple.com`, which delivers pushes to apps installed from the App Store or TestFlight external builds.

---

## Quick Reference: Dev vs Production

| Step | Development | Production | Notes |
|------|:-----------:|:----------:|-------|
| Enable Push on App ID | Required | Required | Same toggle covers both |
| Generate .p8 key | Required | Required | Same key for both |
| Xcode Push capability | Required | Required | Xcode auto-switches entitlement |
| Xcode Background Modes | Optional | Optional | Only for silent push |
| `.p8` in resources/ | Yes | No | Don't commit to repo |
| `.p8` via Docker/secrets | No | Yes | Secure storage |
| `apns.production=false` | Yes | -- | Sandbox APNs |
| `apns.production=true` | -- | Yes | Production APNs |

---

## Testing Checklist

- [ ] Apple Developer Portal: Push Notifications enabled on App ID
- [ ] Apple Developer Portal: APNs key (.p8) generated and downloaded
- [ ] Key ID, Team ID, and Bundle ID recorded
- [ ] Xcode: Push Notifications capability added
- [ ] Backend: `.p8` file placed and configuration set
- [ ] Backend: `apns.production` set to `false` for development
- [ ] Run app from Xcode on a **physical device** (push does not work on Simulator)
- [ ] Verify notification permission prompt appears
- [ ] Verify device token is sent to backend (check player record in DB)
- [ ] Send a test notification from web admin panel
- [ ] Verify push notification arrives on device

---

## Security Notes

- **Never commit the `.p8` file** to version control. Add it to `.gitignore`.
- The `.p8` key can send pushes to **any** app under your Apple Developer team. Treat it like a private key.
- If compromised, revoke it in the Apple Developer Portal (Keys > your key > Revoke) and generate a new one.
