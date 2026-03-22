# Real-time Game Config Sync

## Problem

When multiple operators edit game configuration (challenges, bases, teams, etc.) from different devices or platforms, changes made on one device don't appear on others until the app is restarted or data is manually refetched. The root cause: no WebSocket event exists for configuration changes, and mobile clients cache entity lists without invalidation signals.

## Solution

Add a `game_config` WebSocket event type that broadcasts invalidation signals whenever an operator mutates game configuration. All connected operator clients (iOS, Android, web admin) react by refetching the affected entity list.

## Event Format

Uses the existing broadcast envelope:

```json
{
  "version": 1,
  "type": "game_config",
  "gameId": "uuid",
  "emittedAt": "2026-03-22T17:00:00Z",
  "data": {
    "entity": "challenges",
    "action": "updated"
  }
}
```

**Entities**: `challenges`, `bases`, `teams`, `assignments`, `game_settings`, `variables`, `notifications_config`

**Actions**: `created`, `updated`, `deleted` — informational only; clients always refetch the full list regardless of action.

## Backend Changes

### GameEventBroadcaster

Add method:

```java
public void broadcastGameConfig(UUID gameId, String entity, String action)
```

Follows the existing transaction-deferred broadcast pattern (event fires after DB commit).

### Service Layer Call Sites

Every operator-facing mutation method calls `broadcastGameConfig`:

| Service | Methods | Entity |
|---------|---------|--------|
| `ChallengeService` | create, update, delete | `challenges` |
| `BaseService` | create, update, delete, setNfcLinked | `bases` |
| `TeamService` | create, update, delete | `teams` |
| `AssignmentService` | create, update, delete | `assignments` |
| `GameService` | update settings (name, description, etc.) | `game_settings` |
| `TeamVariableService` | create, update, delete | `variables` |
| `NotificationService` | update notification preferences | `notifications_config` |

Note: `TeamService` check-ins already broadcast `activity` events — no `game_config` for those.

Note: `GameEventBroadcaster` is not yet injected into `ChallengeService`, `BaseService`, `AssignmentService`, or `TeamVariableService` — the implementer must add the dependency injection.

## iOS Changes

### Event Handling

In operator views that display entity lists, listen for `mobileRealtimeEvent` notifications (existing pattern). When `type == "game_config"`, check `data.entity` and trigger the appropriate refetch.

Key views to modify: `ChallengesManagementView`, `BasesManagementView`, `TeamsManagementView`, `GameSettingsView`, `OperatorSetupHubView`.

The `onReconnect` callback already refetches all data — this adds mid-session invalidation for when another operator makes changes.

## Android Changes

### Cache Invalidation

Collect from `MobileRealtimeClient.events` SharedFlow in the operator ViewModel/repository layer. When `type == "game_config"`, invalidate the relevant `CacheEntry` in `OperatorRepository` and trigger a refetch. The existing 30-second cache mechanism stays — we just force-invalidate it when a config event arrives.

Note: `OperatorRepository` only caches `bases`, `challenges`, `teams`, and `assignments`. For `game_settings` and `variables`, there is no cache — the handler should still trigger a UI refresh/re-fetch for these entities.

## Web Admin Changes

### useGameWebSocket Hook

Add a `game_config` case to the existing event type switch statement. Map entity names to React Query cache keys:

| Entity | Invalidated Query Keys |
|--------|----------------------|
| `challenges` | `["challenges", gameId]` |
| `bases` | `["bases", gameId]` |
| `teams` | `["teams", gameId]` |
| `assignments` | `["assignments", gameId]` |
| `game_settings` | `["game", gameId]` |
| `variables` | `["game-variables", gameId]`, `["challenge-variables", gameId]`, `["team-variables-completeness", gameId]` |
| `notifications_config` | `["notifications", gameId]` |

## Scope Boundaries

- **Operators only** — players get challenge data through the check-in flow, not cached lists
- **No conflict resolution** — last write wins (same as today)
- **No delta updates** — always full refetch of the entity list
- **Invalidation only** — event carries entity + action metadata, not the changed data (avoids payload bloat from base64 content)
