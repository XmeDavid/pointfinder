# Player Sync Status Banner

## Problem

When players submit photos or queue actions offline, they have no feedback on whether their submissions are being uploaded, waiting to sync, or stuck. The only indication is the solve result screen showing "pending", with no visibility into the sync queue.

## Solution

A tiny pill-shaped banner in the top-right of the player navigation bar that appears only when there are pending queue items. Tappable to open a bottom sheet showing each queued action with its status.

## Banner

**Placement**: Top-right corner of the player nav bar, inline. Hidden when queue is empty (0 pending items).

**Two states** (only one shown at a time):
- **Syncing** (blue): spinner icon + "Syncing N" — shown when online and `isSyncing` is true, or when online and pending count > 0
- **Offline** (red): wifi-off icon + "Offline (N)" — shown when `isOnline` is false and pending count > 0

**Behavior**: Tapping the pill opens the queue detail sheet. Banner animates in/out when items enter/leave the queue.

## Queue Detail Sheet

**Trigger**: Tap the banner pill.

**Layout**: Bottom sheet (iOS `.sheet` / Android `ModalBottomSheet`) with a simple list of pending actions.

**Each item shows**:
- Icon: camera for photo/video submissions, pin for check-ins, text icon for text submissions
- Label: challenge name or base name (from the pending action metadata)
- Status badge (right-aligned):
  - **UPLOADING** (blue) — with a progress bar below showing bytes uploaded / total bytes
  - **QUEUED** (gray) — waiting for the current upload to finish
  - **NO CONNECTION** (red) — offline, waiting for connectivity

**Items disappear** from the list as they sync. When the last item syncs, the sheet auto-dismisses and the banner disappears.

## Data Layer Changes

### iOS

`SyncEngine.isSyncing` is already `@Observable`. `AppState` already exposes `pendingActionsCount` and `isOnline`. For the banner:
- Access `syncEngine.isSyncing` directly from SwiftUI views (SyncEngine is `@Observable`)
- For the detail sheet, call `await OfflineQueue.shared.allPending()` to get the list of pending actions
- Upload progress is already tracked per action in `PendingAction.uploadChunkIndex` / `uploadTotalChunks`

No new data layer code needed on iOS — just UI.

### Android

`AppSessionState` already has `pendingActionsCount` and `isOnline`. Need to add:
- Expose `isSyncing: StateFlow<Boolean>` from `PlayerRepository` (wrap the existing `Mutex.isLocked` or add a `MutableStateFlow`)
- Add `isSyncing` to `AppSessionState` and collect it in the ViewModel
- For the detail sheet, query `pendingActions()` from the DAO (already exists)
- Upload progress already tracked in `PendingActionEntity.uploadChunkIndex` / `uploadTotalChunks`

## UI Components

### iOS
- `SyncStatusBanner` — SwiftUI view, placed in the player navigation bar `.toolbar` as a `ToolbarItem(placement: .topBarTrailing)`
- `SyncQueueSheet` — bottom sheet listing pending actions with progress

### Android
- `SyncStatusBanner` — Composable, placed in the player screen's `TopAppBar` actions
- `SyncQueueSheet` — `ModalBottomSheet` listing pending actions with progress

## Scope

- **Players only** — operators don't have offline queues
- **Both platforms** — iOS and Android
- **No retry button** — sync retries automatically on reconnect
- **No clear/cancel** — players can't cancel pending submissions
- **Challenge/base names**: Use the name stored in the pending action metadata if available, otherwise show "Submission" / "Check-in" as fallback
