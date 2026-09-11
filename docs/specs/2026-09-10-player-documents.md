# Player documents (PF-10, first slice)

Local working spec. Not committed; the roadmap records the shipped slice.

## Product behavior

Operators can already upload files and write rich documents per game and mark
each one **Shared with players**. Nothing in the player app showed them. This
slice adds a **Documents** screen to the player app so a team can open the
maps, schedules, rules and instructions the organizer shared.

The screen lists every resource the team may currently see, in the order the
backend already returns them: shared resources first, then resources embedded
in bases the team checked in at and challenges the team submitted to. Each row
shows the name, a kind icon, and for files the size. Tapping a document opens
it inline through the shared player rich-content renderer. Tapping a file opens
it with the platform's external opener (a new tab in the browser, the system
viewer on Tauri).

The entry point is a fourth icon button in the player map header, next to
Notifications, Logbook and Settings, with test id `player-documents-btn`.

## Offline

The list is cached per player and game with the same cache the game data uses.
When the network is down and a cached copy exists, the screen shows the cached
list and a hint that files need a connection. Documents stay readable from the
cache because their content ships with the list. File rows are disabled while
offline. Presigned file links expire after about an hour, so opening a file
from a list fetched more than 45 minutes ago refetches the list first.

## Authorization hardening

The player download endpoint verified only that a resource belonged to the
game. It now also verifies the resource is visible to the calling player's
team under the same rule the list uses: shared with players, or embedded in a
base the team checked in at, or embedded in a challenge the team submitted to.
The team-aware visibility computation moves from the controller into
`ResourceEmbedService` so both paths agree. Document content in the player
list is passed through the same HTML enrichment challenges use, so file embeds
inside a document resolve.

## Out of scope

- A three-audience policy or "unlock this file by completing this challenge"
  semantics (PF-11). The existing exposure rule is preserved, not redefined.
- Organization-scoped resources. Only game-scoped resources reach players.
- Realtime invalidation when an operator toggles sharing. The list refetches on
  screen open and on window focus.
- Legacy iOS and Android apps.

## Tests

- Backend: `ResourceEmbedServiceTest` covers allow (shared), allow (embedded in
  a checked-in base), deny (neither), deny (wrong game).
- Web: `DocumentsScreen.test.tsx` covers list, empty, error with retry,
  document detail rendering, and the offline cached path.
- i18n: `playerApp.documents.*` and `playerApp.map.documents` in en/pt/de.
