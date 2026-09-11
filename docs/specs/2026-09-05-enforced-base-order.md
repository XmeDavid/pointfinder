# Enforced base order

## Product behavior

An optional **Enforce base order** setting in Game Settings gives every team
the same ordered route through the game's bases. It defaults to off. The route
belongs to bases; team-specific challenge assignments remain independent.
Checking in advances a team's route. Submissions, review decisions, and challenge
completion do not establish a check-in or prevent the next visit.

With enforcement enabled, Bases exposes **Arrange route** and displays generated
one-based numbers. Operators can drag bases or use keyboard-accessible move
actions, then save or cancel. The map and details use the same numbers while
retaining existing status meanings. Disabling enforcement removes numbering and
visit restrictions but retains the saved order.

The setting and route can change only during setup. Adding or deleting a base in
a live ordered game must not silently renumber the route. Existing lifecycle,
readiness, permissions, localization, and audited rescue boundaries still apply.

## Player behavior

The player sees the next required base in the logbook and numbers alongside
player-facing challenge titles. An early scan produces **Visit Base N first**
and an explanation, with **Show Base N** only when the base is visible to that
team. Hidden bases retain their privacy rules. A number alone must never reveal
an operator name, hidden title, or location.

The earliest missing check-in across the complete route determines progression,
including bases hidden by visibility or stages. Later scans cannot bypass a
missing earlier visit. Repeat check-ins return the existing visit. An operator's
existing audited manual check-in can record a rescued visit; a visibility unlock
alone does not record a visit or satisfy ordering.

## Offline and server authority

The server validates ordering for every new player check-in, after validating
game membership and NFC proof. Cached route metadata and valid pending local
check-ins allow provisional ordered progress offline, visibly pending sync.
The queue preserves dependencies: a later visit must not overtake an earlier
visit that has not synced. A failed prerequisite cannot establish progress.

Premature scans rejected for ordering must not be accepted automatically later.
The player visits the missing base, returns, and scans again. The server's
canonical next-required number corrects stale local team state on refresh.

## Additive contracts

- `enforceBaseOrder`: boolean on game setup, game data, and snapshot game metadata.
- `sequenceNumber`: nullable one-based base position on base and progress DTOs;
  numbering uses the complete saved route, not a filtered player list.
- `nextRequiredBaseNumber`: nullable number on player game data and snapshot game
  metadata; null means no remaining required check-in when enforcement is enabled.
- `PREVIOUS_BASE_REQUIRED`: check-in rejection with
  `errors.nextRequiredBaseNumber` as a string; no hidden identifiers or content.

Older games and clients can omit the new setting. Export/import retains the
setting and route. Browser and Tauri consume the same React implementation;
legacy SwiftUI/Compose UI parity requires separate verification.
