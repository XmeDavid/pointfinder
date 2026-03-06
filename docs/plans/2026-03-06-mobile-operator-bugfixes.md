# Mobile Operator Bugfixes Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 11 issues found during testing of iOS and Android operator features.

**Architecture:** Bug fixes across iOS (SwiftUI) and Android (Jetpack Compose) mobile apps. All backend APIs already exist and are correct — issues are all client-side.

**Tech Stack:** Swift/SwiftUI (iOS), Kotlin/Jetpack Compose (Android), MapLibre for maps

---

## Task 1: iOS — Fix variable saving UUID case mismatch

**Root cause:** Swift `UUID.uuidString` returns uppercase (e.g. `"A1B2C3..."`), but the backend stores team IDs as lowercase UUIDs. `normalizedTeamVariables()` and `addVariable()` in `TeamVariablesEditorView.swift` use uppercase keys, while `TeamDetailView.swift` uses `.lowercased()`. This means variable values written from the editor use uppercase keys that don't match backend lowercase keys.

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/TeamVariablesEditorView.swift`

**Changes:**

1. In `normalizedTeamVariables()` (line 5), lowercase the team IDs:
```swift
let teamIds = teams.map { $0.id.uuidString.lowercased() }
```

2. In `addVariable()` (line 231), lowercase the team IDs:
```swift
let teamValues = Dictionary(uniqueKeysWithValues: teams.map { ($0.id.uuidString.lowercased(), "") })
```

3. In `value(for:teamId:)` (line 134) and `updateValue(for:teamId:value:)` (line 135), the `teamId` parameter comes from `team.id.uuidString` — these callers need `.lowercased()`:
```swift
// line 134
get: { value(for: variable.key, teamId: team.id.uuidString.lowercased()) },
// line 135
set: { updateValue(for: variable.key, teamId: team.id.uuidString.lowercased(), value: $0) }
```

**Verify:** Build iOS, navigate to team variables editor, set values, save, reload page — values should persist.

---

## Task 2: iOS — Fix map auto-zoom on every re-render

**Root cause:** `MapLibreMapView.swift` `updateUIView()` (lines 99-124) fits bounds to `fitCoordinates` on EVERY call to `updateUIView()`. Since annotations, polling data, and state changes all trigger re-renders, the map constantly re-fits to show all bases, overriding user pan/zoom.

**Files:**
- Modify: `ios-app/dbv-nfc-games/Components/MapLibreMapView.swift`

**Changes:**

In `updateUIView()`, only fit coordinates on first render (when `hasInitialized` is false). After that, don't re-fit — the user is in control:

```swift
// Fit bounds only on initial load
if !context.coordinator.hasInitialized && !fitCoordinates.isEmpty {
    if fitCoordinates.count > 1 {
        let bounds = fitCoordinates.reduce(
            MLNCoordinateBounds(sw: fitCoordinates[0], ne: fitCoordinates[0])
        ) { result, coord in
            MLNCoordinateBounds(
                sw: CLLocationCoordinate2D(
                    latitude: min(result.sw.latitude, coord.latitude),
                    longitude: min(result.sw.longitude, coord.longitude)
                ),
                ne: CLLocationCoordinate2D(
                    latitude: max(result.ne.latitude, coord.latitude),
                    longitude: max(result.ne.longitude, coord.longitude)
                )
            )
        }
        let camera = mapView.cameraThatFitsCoordinateBounds(bounds, edgePadding: UIEdgeInsets(top: 60, left: 40, bottom: 60, right: 40))
        mapView.setCamera(camera, animated: false)
    } else if fitCoordinates.count == 1 {
        mapView.setCenter(fitCoordinates[0], zoomLevel: 15, animated: false)
    }
    context.coordinator.hasInitialized = true
}
```

Remove the old fitCoordinates block (lines 99-124) and replace with the above.

**Verify:** Build iOS, open map, zoom in on a base, wait 10+ seconds for polling — map should NOT snap back to show all bases.

---

## Task 3: iOS + Android — Two-state location button

**Desired behavior (both platforms):**
- Default state: button shows "center on me" icon → tapping centers on user location
- After centering on user: button shows "show all bases" icon → tapping fits all bases in view
- After user drags/zooms the map manually: resets to "center on me" state

**3a: iOS — Simplify to two states, fix tap issues**

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/OperatorMapView.swift`
- Modify: `ios-app/dbv-nfc-games/Components/MapLibreMapView.swift`

**Changes in OperatorMapView.swift:**

1. Replace `MapFocusState` enum (3 states) with 2 states:
```swift
private enum MapFocusState { case centerOnMe, showAllBases }
@State private var mapFocusState: MapFocusState = .centerOnMe
```

2. Replace location button icon logic:
```swift
private var locationButtonIcon: String {
    switch mapFocusState {
    case .centerOnMe: return "location"
    case .showAllBases: return "map"
    }
}
```

3. Replace button action (around line 127-148):
```swift
Button {
    switch mapFocusState {
    case .centerOnMe:
        if let loc = locationManager.lastLocation {
            centerTarget = CLLocationCoordinate2D(
                latitude: loc.latitude,
                longitude: loc.longitude
            )
            mapFocusState = .showAllBases
        }
    case .showAllBases:
        if !bases.isEmpty {
            fitAllBasesTarget = UUID() // trigger re-fit
            mapFocusState = .centerOnMe
        }
    }
} label: {
    Image(systemName: locationButtonIcon)
        .font(.title3)
        .padding(10)
        .background(.ultraThinMaterial)
        .clipShape(Circle())
}
```

4. Remove the jitter noise — it was a workaround for the auto-zoom issue (fixed in Task 2).

**Changes in MapLibreMapView.swift:**

Add a `fitAllBasesId: UUID?` parameter. When it changes (non-nil), re-fit to `fitCoordinates`. This replaces the "always fit on every render" behavior:

```swift
var fitAllBasesId: UUID? = nil
```

In the Coordinator, track `lastFitId`:
```swift
var lastFitId: UUID?
```

In `updateUIView()`, add after the centerOnCoordinate block:
```swift
if let fitId = fitAllBasesId, fitId != coordinator.lastFitId, !fitCoordinates.isEmpty {
    // fit bounds logic here (same as current, but animated: true)
    coordinator.lastFitId = fitId
}
```

Also add a `onRegionDidChange` callback to `MapLibreMapView` to detect user interaction and reset `mapFocusState` to `.centerOnMe` in `OperatorMapView`.

**3b: Android — Add show-all-bases state**

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorMapScreen.kt`

**Changes:**

1. Add state for the location button focus mode:
```kotlin
var locationFocusState by remember { mutableStateOf(LocationFocusState.CENTER_ON_ME) }
```

With enum:
```kotlin
private enum class LocationFocusState { CENTER_ON_ME, SHOW_ALL_BASES }
```

2. Replace the bottom-left SmallFloatingActionButton (current "center on me" only) with a cycling button:
```kotlin
SmallFloatingActionButton(
    onClick = {
        when (locationFocusState) {
            LocationFocusState.CENTER_ON_ME -> {
                getLastKnownLocation(context)?.let { location ->
                    map?.animateCamera(
                        CameraUpdateFactory.newLatLngZoom(
                            LatLng(location.latitude, location.longitude), 15.0,
                        ),
                    )
                    locationFocusState = LocationFocusState.SHOW_ALL_BASES
                }
            }
            LocationFocusState.SHOW_ALL_BASES -> {
                if (bases.isNotEmpty()) {
                    val boundsBuilder = LatLngBounds.Builder()
                    bases.forEach { boundsBuilder.include(LatLng(it.lat, it.lng)) }
                    runCatching {
                        map?.easeCamera(CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), 80))
                    }
                    locationFocusState = LocationFocusState.CENTER_ON_ME
                }
            }
        }
    },
    ...
) {
    Icon(
        if (locationFocusState == LocationFocusState.CENTER_ON_ME) Icons.Default.MyLocation
        else Icons.Default.Map,
        contentDescription = ...
    )
}
```

3. Add a map move listener to reset `locationFocusState` to `CENTER_ON_ME` when user drags:
```kotlin
mapLibreMap.addOnMoveListener(object : MapLibreMap.OnMoveListener {
    override fun onMoveBegin(detector: MoveGestureDetector) {
        locationFocusState = LocationFocusState.CENTER_ON_ME
    }
    override fun onMove(detector: MoveGestureDetector) {}
    override fun onMoveEnd(detector: MoveGestureDetector) {}
})
```

4. Also remove the auto-fit in the markers LaunchedEffect (lines 265-272 current) — same reason as iOS, should only fit on initial load.

5. Add import for `Icons.Default.Map` (already available in material-icons-extended).

**Verify:** Both platforms — tap location button → centers on user → icon changes to map → tap again → shows all bases → icon changes to location → drag map → icon is location.

---

## Task 4: Android — Auto-redirect to edit after base/challenge creation

**Root cause:** After creating a base, Android navigates to `bases_list` (setup tab) or `null` (map tab) instead of opening the edit screen for the new base. Same for challenges.

**Files:**
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/navigation/AppNavigation.kt`

**Changes:**

1. Setup tab base create (line 1080-1082): Change callback to redirect to edit:
```kotlin
viewModel.createBase(request as CreateBaseRequest) { base ->
    setupSubScreen = "base_edit:${base.id}"
}
```

2. Map tab base create (line 952-954): Same — redirect to edit:
```kotlin
viewModel.createBase(request as CreateBaseRequest) { base ->
    mapSubScreen = "base_edit:${base.id}"
}
```

3. Setup tab challenge create (line 1143-1145): Redirect to edit:
```kotlin
viewModel.createChallenge(request as CreateChallengeRequest) { challenge ->
    setupSubScreen = "challenge_edit:${challenge.id}"
}
```

4. Map tab challenge create (line 1004-1006): Redirect to edit:
```kotlin
viewModel.createChallenge(request as CreateChallengeRequest) { challenge ->
    mapSubScreen = null  // map challenges go back to map for now
}
```
Note: Map tab challenges are created for a specific base, so returning to map is acceptable.

**Verify:** Create a base in setup tab → automatically opens base edit. Create a base on map → opens base edit.

---

## Task 5: Android — Wire up NFC write in BaseEditScreen

**Root cause:** `BaseEditScreen.kt` has a "Write NFC" menu item (line 158-164) but the `onClick` handler just closes the menu — there's no callback to the navigation layer.

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/BaseEditScreen.kt`
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/navigation/AppNavigation.kt`

**Changes in BaseEditScreen.kt:**

1. Add `onWriteNfc: (() -> Unit)?` parameter to `BaseEditScreen`:
```kotlin
fun BaseEditScreen(
    base: Base?,
    challenges: List<Challenge>,
    linkedChallenges: List<Challenge>,
    onSave: (Any) -> Unit,
    onDelete: (() -> Unit)?,
    onWriteNfc: (() -> Unit)?,  // NEW
    onNavigateToCreateChallenge: ((String) -> Unit)?,
    onBack: () -> Unit,
    ...
```

2. Wire up the menu item onClick (line 161-163):
```kotlin
onClick = {
    showOverflowMenu = false
    onWriteNfc?.invoke()
},
```

3. Only show the NFC menu item when `onWriteNfc` is not null (or when `isEditMode` and onWriteNfc is provided):
```kotlin
if (onWriteNfc != null) {
    DropdownMenuItem(
        text = { Text(stringResource(R.string.label_write_nfc)) },
        leadingIcon = { Icon(Icons.Default.Nfc, contentDescription = null) },
        onClick = {
            showOverflowMenu = false
            onWriteNfc.invoke()
        },
    )
}
```

**Changes in AppNavigation.kt:**

For every `BaseEditScreen(...)` call where `base != null` (edit mode), add:
```kotlin
onWriteNfc = {
    viewModel.selectBase(base)
    viewModel.beginWriteNfc()
},
```

For create mode (`base == null`), pass `onWriteNfc = null`.

There are 4 BaseEditScreen usages:
- Map tab base create (line ~947): `onWriteNfc = null` (new base, can't write NFC yet)
- Map tab base edit (line ~973): `onWriteNfc = { viewModel.selectBase(base); viewModel.beginWriteNfc() }`
- Setup tab base create (line ~1075): `onWriteNfc = null`
- Setup tab base edit (line ~1101): `onWriteNfc = { viewModel.selectBase(base); viewModel.beginWriteNfc() }`

**Verify:** Open a base in edit mode → tap overflow menu → "Write NFC" appears → tap → NFC write dialog shows.

---

## Task 6: iOS — Fix operators/invites endpoint mismatch

**Root cause:** iOS calls `GET /api/games/{gameId}/invites` which doesn't exist. The correct endpoint is `GET /api/invites/game/{gameId}`. Since `getGameOperators` and `getGameInvites` are awaited together with `async let` + `try await`, the 404 from invites causes the ENTIRE load to fail — so neither operators nor invites appear.

**Files:**
- Modify: `ios-app/dbv-nfc-games/Services/APIClient.swift`

**Changes:**

Fix the endpoint URL (line 347):
```swift
func getGameInvites(gameId: UUID, token: String) async throws -> [InviteResponse] {
    try await get("/api/invites/game/\(gameId)", token: token)
}
```

**Verify:** Build iOS, navigate to More → Operators → should see both current operators and pending invites.

---

## Task 7: Android — Filter accepted invites from pending section

**Root cause:** `OperatorsScreen.kt` displays ALL invites under a "Pending Invites" header, including accepted ones. Should either filter to pending only, or show status-appropriate coloring.

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorsScreen.kt`

**Changes:**

Option: Show invite status with color coding (matching iOS behavior). The InviteRow already shows `invite.status`, but the badge color is hardcoded to `StatusSubmitted` (orange). Fix to use status-dependent colors:

```kotlin
@Composable
private fun InviteRow(invite: InviteResponse) {
    val statusColor = when (invite.status.lowercase()) {
        "pending" -> StatusSubmitted  // orange
        "accepted" -> StatusCompleted  // green
        "declined" -> StatusRejected   // red
        else -> StatusSubmitted
    }
    // ... use statusColor instead of hardcoded StatusSubmitted
```

Also rename the section header from "Pending Invites" to just "Invites":
```kotlin
Text(
    stringResource(R.string.label_invites),  // Update or add this string
    ...
)
```

If `R.string.label_invites` doesn't exist, update the string resource or reuse an existing key. Check `values/strings.xml`.

**Verify:** Android operators screen shows invites with proper status coloring (orange=pending, green=accepted, red=declined).

---

## Task 8: Android — Debug setup tab not showing teams/challenges

**Root cause hypothesis:** `loadGameMeta()` might be failing silently (its `.onFailure` only handles auth errors). Or there's a race condition between `refreshSelectedGameData()` and `loadGameMeta()` where one overwrites the other's state updates.

**Files:**
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/session/OperatorViewModel.kt`

**Investigation steps:**

1. Add logging to `loadGameMeta()` to confirm it's being called and whether it succeeds:
```kotlin
private fun loadGameMeta(gameId: String) {
    viewModelScope.launch {
        runCatching {
            val teams = operatorRepository.gameTeams(gameId)
            val challenges = operatorRepository.gameChallenges(gameId)
            val assignments = operatorRepository.gameAssignments(gameId)
            val variables = runCatching { operatorRepository.getGameVariables(gameId).variables }
                .getOrDefault(emptyList())
            GameMeta(teams, challenges, assignments, variables)
        }.onSuccess { meta ->
            Log.d("OperatorVM", "loadGameMeta success: ${meta.teams.size} teams, ${meta.challenges.size} challenges, ${meta.assignments.size} assignments")
            _state.value = _state.value.copy(
                teams = meta.teams,
                challenges = meta.challenges,
                assignments = meta.assignments,
                variables = meta.variables,
                authExpired = false,
            )
        }.onFailure { err ->
            Log.e("OperatorVM", "loadGameMeta failed", err)
            if (markAuthExpiredIfNeeded(err)) return@onFailure
        }
    }
}
```

2. Check the `refreshSelectedGameData` method — it updates `bases` but NOT teams/challenges/assignments. If `refreshSelectedGameData` runs after `loadGameMeta`, it won't overwrite teams. This should be fine.

3. Check the API endpoints: `getTeams`, `getChallenges`, `getAssignments` — verify they require operator auth and the token is correct.

4. **Most likely cause**: The API calls may be failing due to a network issue or the interceptor not having the token ready when `loadGameMeta` is called immediately after `selectGame`. Check timing — `loadGameMeta` is called right after `selectGame` sets the selected game in state, but the token may not be stored yet.

Actually, looking at the flow: `selectGame` is called when the user picks a game from the list. The operator token should already be stored from login. So this shouldn't be a token issue.

**Alternative hypothesis**: Check if `getTeams`/`getChallenges`/`getAssignments` return empty arrays for some games. Maybe the issue is that the user's test game doesn't have teams/challenges from the Android perspective (different game selection?).

**Verify:** Add logging, reproduce the issue, check logcat output.

---

## Execution Order

1. **Task 6** (iOS invites endpoint fix) — quick 1-line fix, unblocks operators page
2. **Task 1** (iOS UUID case mismatch) — quick fix, unblocks variable saving
3. **Task 2** (iOS map auto-zoom) — fixes annoying UX, enables Task 3a
4. **Task 3** (Location button both platforms) — depends on Task 2
5. **Task 4** (Android auto-redirect) — independent
6. **Task 5** (Android NFC write) — independent
7. **Task 7** (Android invites status) — independent
8. **Task 8** (Android setup tab debug) — needs device testing with logging
