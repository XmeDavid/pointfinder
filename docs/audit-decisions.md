# Audit Decisions

> Decisions made during audit fix verification (2026-05-24, updated 2026-05-27).

## Finding 6.16 -- Remaining contentDescription = null instances

**Decision:** Keep the 3 remaining `contentDescription = null` instances as-is.

**Alternatives considered:**
- Add content descriptions to all 3 icon instances
- Remove only standalone interactive icons' null descriptions

**Rationale:** The 3 remaining instances (in `PlayerGameplayScreens.kt` and `SetupHubScreen.kt`) are all decorative icons placed inside `Button` or `OutlinedButton` composables that already have `Text` children. Android TalkBack reads the button's text content, making an icon description redundant. Adding a description would cause screen readers to announce the icon separately, creating a worse experience (e.g., "Location, Check in at base" instead of just "Check in at base"). The original finding targeted 56 instances; the 53 that were standalone interactive icons have already been fixed.

## Finding 3.9 -- AppState god object tendency

**Decision:** No refactoring at this time.

**Alternatives considered:**
- Split AppState into domain-specific state holders (AuthState, GameState, SyncState, etc.)
- Extract extension files into separate @Observable classes composed by AppState

**Rationale:** AppState is the central observable in the iOS app. Splitting it would require changes to every SwiftUI view that accesses it via @Environment, plus careful coordination of cross-domain state (e.g., auth state affecting sync state). The current structure uses MARK sections and extension files for organization. The risk of introducing bugs during a split outweighs the maintainability benefit. This should be done as a dedicated, well-tested refactoring task with full iOS test coverage first.
