# Mobile Operator Feature Parity Design

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Full web-admin operator parity on Android and iOS, with better UX
**Branch reference:** `dev/mobile-operator` (prior attempt, to be replaced)

## Context

Operators frequently need to create and edit games in the field with no computer access. The web-admin has ~55 API endpoints across 10+ feature categories. The mobile apps currently support live monitoring (map, submissions review) but lack game setup capabilities.

The `dev/mobile-operator` branch attempted a wizard-based approach but had quality issues: duplicate logic across platforms, inconsistent data models, missing validation, incomplete feature coverage (~25% of web parity).

## Design Approach: Adaptive Context

Two entry points into the same data:

- **Map tab** -- spatial view for field work. Place bases where you stand, tap to edit.
- **Setup tab** -- structured hub with readiness checklist and entity lists for planning.

Both operate on the same data. Add a base on the map, it appears in the list. Edit a challenge in the list, it updates on the map.

## Navigation

### Bottom Navigation (inside a game)

**Setup mode:**

```
Map | Setup | Submissions | More
```

**Live mode:**

```
Map | Setup | Submissions | More
```

When game goes live, Setup moves into More. Live tab replaces it:

```
Map | Live | Submissions | More
```

- **Map** -- Dual-purpose: edit mode for setup, monitoring mode when live
- **Setup** -- Hub with warnings and entity management links
- **Live** -- Segmented control: Leaderboard | Activity
- **Submissions** -- Existing review flow (already implemented)
- **More** -- Settings, Notifications, Operators, Export, app preferences

## Game List Screen

The entry point before entering a game.

- List of operator's games with name, status, base/team counts
- **Create Game** button opens create screen:
  - Name field (required)
  - Description field
  - Start from: Empty game OR Import from file (file picker)
  - Single "Create" button for both paths
- Operator names the game regardless of import; imported file pre-fills bases, challenges, teams, assignments

## Map Tab

### Setup mode (edit mode on by default)

- Full-screen MapLibre map with base markers
- **Blue dot** showing operator's current GPS location
- **"Center on me" button** to snap map to current position
- **Long-press map** to create a base at those coordinates
- **Floating "+" button** to create a base at current GPS location
- **Tap a base marker** to open bottom sheet with:
  - Base name, challenge count, NFC status
  - "Edit Base" -- full base edit screen
  - "Add Challenge" -- new challenge pre-linked to this base
  - "Write NFC" -- existing NFC write flow
- **Edit toggle** (top-right) to enable/disable editing. Prevents accidental edits when off.
- **Unlock connection arrows** rendered between bases (directional, dashed lines)

### Live mode (edit mode off by default)

- Team location markers with team colors
- Base markers with status colors (not_visited, checked_in, submitted, completed, rejected)
- Stale location detection (5+ minute old data)
- Edit toggle still available for field adjustments during live game

### Ended mode

- Read-only. Edit toggle hidden. Final state visualization.

## Setup Tab (Hub)

Lightweight overview. Only shows what needs attention.

```
Game Name
Status: Setup

-- Needs Attention --
(warning) NFC missing (3 bases)        ->
(warning) Location-bound unassigned    ->
(warning) Team variables incomplete    ->

-- Manage --
Bases                            (5)  ->
Challenges                       (8)  ->
Teams                            (3)  ->

        [ Go Live ]
```

- **"Needs Attention" section** only visible when there are warnings. Disappears when everything is ready.
- Each warning is **tappable** -- navigates to the relevant screen.
- Manage items show inline counts.
- **Go Live** button enabled only when no warnings remain. Shows confirmation dialog.
- When game is `live`, this screen accessible via More. Shows read-only summary with option to end game.

## Base Management

### Bases list

- Cards showing: name, challenge count, NFC link status
- "+" button to create new base

### Base detail/edit screen

- **Mini map at top** with draggable pin for positioning. No manual lat/lng input ever. Operator drags pin on map to set/adjust coordinates.
- Fields: Name, Description
- Options: Require presence (toggle), Hidden base (toggle), Fixed challenge (dropdown)
- **Challenges section** at bottom: list of linked challenges with "Add Challenge" button (creates challenge pre-linked to this base)
- **Three-dot menu**: Write NFC, Delete Base
- Challenge list items are tappable -- opens challenge editor

### Three ways to set base location

1. Long-press map (pre-fills coordinates from tap point)
2. "+" button on map (uses current GPS)
3. Drag the pin in the base edit screen (fine-tune)

## Challenge Management

### Challenges list

- Cards showing: title, points, linked base (if any), answer type indicator
- "+" button to create new challenge

### Challenge edit screen

- Fields: Title, Points
- **Content section** with preview cards:
  - Description -- shows rendered HTML preview, tap "Edit" to open full-screen rich text editor
  - Completion Message -- same pattern
- **Answer section**: Type (text/file dropdown), Auto-validate toggle, Correct answers (tag-style chips with "+" to add)
- **Linking section**: Fixed to base (dropdown), Location-bound (toggle), Unlocks base (dropdown)
- **Three-dot menu**: Delete Challenge

### Full-screen Rich Text Editor

Dedicated screen for editing description and completion message content.

- **Toolbar**: Bold, Italic, Underline, H1, H2, Bullet list, Horizontal rule, Image, Link
- **Full-screen content area** with ample room for keyboard + toolbar + content
- **Three-dot menu**:
  - "Insert Variable" -- picker listing available game-level and challenge-level variables. Tapping inserts `{{variable_name}}` at cursor position.
  - "Create Variable" -- available when no variables exist yet. Names the variable inline, creates it immediately.
  - "Preview as Team" -- resolves variables for a selected team, shows rendered output
- **"Done" button** returns to challenge edit screen with updated content

### Variable system

- Variables are created in the rich text editor (in context of the content that uses them)
- Per-team values are filled in on the Team detail screen
- No separate variable management screen needed -- creation happens where they're used, values are set where teams are managed

## Teams Management

### Teams list

- Cards showing: team color dot, name, join code with copy-to-clipboard button, player count
- "+" button opens create form: name + color picker (row of ~12 color swatches)

### Team detail screen

- Fields: Name (editable), Color (editable, color swatch picker)
- **Join Code section**: code display, copy button, QR code button (opens full-screen QR)
- **Variables section**: lists all defined variables with this team's values. "Add Variable Value" if any are unset.
- **Players section**: list with remove buttons (setup mode only)
- **Three-dot menu**: Delete Team

## Live Tab

Single screen with segmented control at top:

### Leaderboard segment

- Ranked team list with color dots, team names, points, completed challenge counts

### Activity segment

- Real-time event feed: check-ins, submissions, approvals, rejections
- Event type icons, team color badges, timestamps

Both segments update via WebSocket in real-time.

## More Tab

```
-- Game --
Settings                     ->
Notifications                ->
Operators                    ->

-- Data --
Export Game                   ->

-- App --
Language             English  ->
Theme                System   ->
Switch Game                   ->
Log Out
```

When game is `live`, Setup is added at the top of the Game section.

### Settings screen

Game name, description, start/end dates (native date pickers), uniform assignment toggle, tile source selector, broadcast enable/code.

### Notifications screen

Message text field + team target picker (All Teams or specific team) + send button. Sent notifications list below.

### Operators screen

List of current game operators + invite by email.

### Export

Generates JSON, opens native share sheet.

## Assignments

Simplified for mobile: uniform and fixed assignments only.

- Uniform assignment is a game-level toggle in Settings
- Fixed challenges are set per-base in the base edit screen
- Per-team custom assignments deferred to web-admin

## Scope Boundaries

### In scope (full parity)

- Game CRUD with import/export
- Base CRUD with map-based positioning
- Challenge CRUD with full rich text editing
- Team CRUD with colors, join codes, QR, player management
- Team variables (create in editor, fill per team)
- Game lifecycle (setup, live, ended)
- Operator management (invite/remove)
- Notifications (send to teams)
- Settings (all game metadata)
- Live monitoring (map, leaderboard, activity)
- Submission review (already implemented)
- NFC write/link (already implemented)

### Deferred

- Per-team custom assignments (use web-admin)
- Bulk assignment matrix view

### Not in scope

- Player mobile experience (stays exactly as-is)
- Any backend API changes (all endpoints already exist)

## Platform Notes

- Both Android (Jetpack Compose) and iOS (SwiftUI) implement the same design
- Rich text editor: platform-native implementations (no WebView wrapper)
- Map: MapLibre on both platforms (already in use)
- Real-time: existing WebSocket/STOMP infrastructure
- Localization: all new strings in EN, PT, DE
