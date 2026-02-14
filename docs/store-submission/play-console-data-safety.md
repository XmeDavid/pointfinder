# Google Play Console - Data Safety Form

Reference for filling Play Console > App content > Data safety section.

## Overview Questions

| Question | Answer |
|----------|--------|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS/TLS) |
| Do you provide a way for users to request that their data is deleted? | Yes |

## Data Collection

### Location - Precise location

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Shared with third parties? | No |
| Required or optional? | Required (for gameplay) |
| Purpose | App functionality |
| Notes | Lat/lng via Fused Location Provider, sent to own backend every ~30s during active player sessions. |

### Personal info - Name

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Shared with third parties? | No |
| Required or optional? | Required |
| Purpose | App functionality, Account management |
| Notes | Player display name at join. Operator name at registration. |

### Personal info - Email address

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Shared with third parties? | No |
| Required or optional? | Required (operators only) |
| Purpose | App functionality, Account management |
| Notes | Operator login. Players do not provide email. |

### Photos and videos - Photos

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Shared with third parties? | No |
| Required or optional? | Optional |
| Purpose | App functionality |
| Notes | Photo challenge submissions uploaded to own server. |

### App activity - App interactions

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Shared with third parties? | No |
| Required or optional? | Required |
| Purpose | App functionality |
| Notes | Check-ins, submissions, activity events, game progress. |

### App activity - Other user-generated content

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Shared with third parties? | No |
| Required or optional? | Required |
| Purpose | App functionality |
| Notes | Text answers to challenges. |

### Device or other IDs

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Shared with third parties? | No |
| Required or optional? | Required |
| Purpose | App functionality |
| Notes | Android ID used as device identifier for player sessions. Firebase installation ID for push notifications. |

## Data Sharing

No data is shared with third parties. Data is sent only to the app's own backend server and to platform push services (FCM) as service providers acting on the developer's behalf.

## Data Handling and Security

| Question | Answer |
|----------|--------|
| Is data encrypted in transit? | Yes |
| Can users request data deletion? | Yes |
| Deletion mechanism | In-app (Settings > Delete Account) and via email to info@pointfinder.pt |
| Deletion URL for Play Console form | https://pointfinder.pt/privacy/#deletion-request |

## Third-Party Libraries

| Library | Data accessed | Purpose |
|---------|---------------|---------|
| Firebase Cloud Messaging | Push token, device ID | Push notifications |
| Google Maps SDK | Map tile requests (no PII sent) | Map display |
| OkHttp / Retrofit | All API data | HTTP client |

## Privacy Policy URL

`https://pointfinder.pt/privacy/`
