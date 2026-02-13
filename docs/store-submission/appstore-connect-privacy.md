# App Store Connect - Privacy Nutrition Labels

Reference for filling App Store Connect > App Privacy section.

## Data Not Collected for Tracking

PointFinder does **not** track users across apps or websites. No ATT prompt is needed. Answer "No" to tracking.

## Data Types Collected

### Location - Precise Location

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes (linked to team/player) |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Lat/lng sent every ~30s during active gameplay for live team monitoring by operators. When-in-use only. |

### Contact Info - Name

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Player display name entered at join. Operator name + email at registration/login. |

### Contact Info - Email Address

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Operator email used for login and invite system. Players do not provide email. |

### Identifiers - Device ID

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Random UUID generated per install, used for player identification. Not IDFA/IDFV. |

### Identifiers - User ID

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Server-assigned UUIDs for players, teams, operators. |

### User Content - Photos or Videos

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes (linked to team submission) |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Optional photo challenge submissions. Stored server-side. |

### User Content - Other User Content

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Text answers to challenges, check-in events, game progress data. |

### Usage Data - Product Interaction

| Field | Answer |
|-------|--------|
| Collected? | Yes |
| Linked to identity? | Yes |
| Used for tracking? | No |
| Purpose | App Functionality |
| Notes | Check-ins, submissions, activity events - core gameplay. |

## App Review Notes (Permissions)

Use these in the "Notes for Reviewer" field:

```
Location: The app uses when-in-use location to track team positions on a live
map during organized scouting games. Operators monitor team movement across
physical bases. Location is sent every ~30 seconds only during active gameplay.

Camera: Used to scan QR join codes and to capture photos for photo-based
challenge submissions.

Photo Library: Players may choose existing photos from their library for
photo challenge submissions.

NFC: Players scan NFC tags at physical game bases to check in. Operators
write base IDs to NFC tags during game setup.

Push Notifications: Used to deliver game updates and operator messages
to active players during events.
```

## Privacy Policy URL

`https://desbravadores.dev/privacy/`
