# iOS Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 verified gaps in the iOS app covering submission blocking, input validation, silent sync failures, operator removal, and go-live readiness.

**Architecture:** Add game status guard to SolveView. Add length validation to join code and display name inputs. Change SyncEngine to keep failed actions visible with error UI. Add operator removal with swipe-to-delete. Add team variable completeness check to go-live flow.

**Tech Stack:** Swift, SwiftUI, async/await, Actors, Core NFC

**Gaps addressed:** GAP-BL-3, GAP-V-2, GAP-V-3, GAP-E-2, GAP-F-2, GAP-F-6

---

## Chunk 1: Submission Blocking & Input Validation

### Task 1: Block Submissions When Game Not Live (GAP-BL-3)

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Solve/SolveView.swift`

**Context:** `SolveView.swift` lets players construct and submit answers regardless of game status. Check-in IS properly blocked in `CheckInTabView.swift` (line 16: `status == "setup" || status == "ended"`). SolveView needs the same guard.

- [ ] **Step 1: Add game status check to canSubmit**

In `SolveView.swift`, modify the `canSubmit` computed property (line 362-368) to also check game status:

```swift
private var canSubmit: Bool {
    guard appState.currentGame?.status == "live" else { return false }
    if isPhotoType {
        return !selectedMedia.isEmpty
    } else {
        return !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
```

- [ ] **Step 2: Add "game not live" overlay or message**

Add a visual indicator when the game isn't live. Add this at the top of the `VStack` in `body`:

```swift
if appState.currentGame?.status != "live" {
    HStack(spacing: 8) {
        Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(.orange)
        Text(locale.t("solve.gameNotLive"))
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }
    .padding()
    .frame(maxWidth: .infinity)
    .background(Color.orange.opacity(0.1))
    .clipShape(RoundedRectangle(cornerRadius: 10))
}
```

- [ ] **Step 3: Add translation key**

In `ios-app/dbv-nfc-games/App/Translations.swift`, add to all three language dictionaries:

English: `"solve.gameNotLive": "This game is not currently active"`
Portuguese: `"solve.gameNotLive": "Este jogo não está ativo no momento"`
German: `"solve.gameNotLive": "Dieses Spiel ist derzeit nicht aktiv"`

- [ ] **Step 4: Build and verify**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: ** BUILD SUCCEEDED **

- [ ] **Step 5: Commit**

```bash
git add ios-app/
git commit -m "fix(ios): block submissions when game is not live

Fixes GAP-BL-3. SolveView now checks game status before allowing
submission, matching the guard already in CheckInTabView and GameMapView."
```

### Task 2: Add Join Code Length Validation (GAP-V-2)

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Auth/PlayerJoinView.swift`

**Context:** `PlayerJoinView.swift` line 100-101: `canProceed` only checks `!joinCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty`. Backend requires 6-20 chars. Need length validation.

- [ ] **Step 1: Update canProceed validation**

In `PlayerJoinView.swift`, change `canProceed` (line 100-102):

```swift
private var canProceed: Bool {
    let trimmed = joinCode.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.count >= 6 && trimmed.count <= 20
}
```

- [ ] **Step 2: Add helper text showing length requirement**

Below the TextField (after line 63), add:

```swift
if !joinCode.isEmpty && joinCode.trimmingCharacters(in: .whitespacesAndNewlines).count < 6 {
    Text(locale.t("join.codeTooShort"))
        .font(.caption)
        .foregroundStyle(.orange)
        .padding(.horizontal, 24)
}
```

- [ ] **Step 3: Add translation key**

In `Translations.swift`, add:

English: `"join.codeTooShort": "Join code must be at least 6 characters"`
Portuguese: `"join.codeTooShort": "O código deve ter pelo menos 6 caracteres"`
German: `"join.codeTooShort": "Der Code muss mindestens 6 Zeichen lang sein"`

- [ ] **Step 4: Build**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: ** BUILD SUCCEEDED **

- [ ] **Step 5: Commit**

```bash
git add ios-app/
git commit -m "fix(ios): validate join code length (6-20 characters)

Fixes GAP-V-2. Enforce length constraint matching backend @Size(min=6, max=20).
Shows helper text when code is too short."
```

### Task 3: Add Display Name Max Length Validation (GAP-V-3)

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Auth/PlayerNameView.swift`

**Context:** `PlayerNameView.swift` line 80-82: `canJoin` only checks non-empty. Backend enforces `@Size(max=100)`.

- [ ] **Step 1: Limit input length**

In `PlayerNameView.swift`, add `.onChange` modifier to the TextField (after line 38):

```swift
TextField(locale.t("join.yourName"), text: $displayName)
    .textFieldStyle(.roundedBorder)
    .textContentType(.none)
    .autocorrectionDisabled()
    .focused($isNameFocused)
    .accessibilityIdentifier("player-name-field")
    .padding(.horizontal, 24)
    .onChange(of: displayName) { _, newValue in
        if newValue.count > 100 {
            displayName = String(newValue.prefix(100))
        }
    }
```

- [ ] **Step 2: Add character counter**

Below the TextField, add:
```swift
Text("\(displayName.count)/100")
    .font(.caption)
    .foregroundStyle(displayName.count >= 90 ? .orange : .secondary)
    .padding(.horizontal, 24)
    .frame(maxWidth: .infinity, alignment: .trailing)
```

- [ ] **Step 3: Build**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: ** BUILD SUCCEEDED **

- [ ] **Step 4: Commit**

```bash
git add ios-app/
git commit -m "fix(ios): limit display name to 100 characters

Fixes GAP-V-3. Caps input at 100 chars to match backend @Size(max=100).
Shows character counter near limit."
```

## Chunk 2: Error Handling & Feature Parity

### Task 4: Keep Failed Sync Actions Visible (GAP-E-2)

**Files:**
- Modify: `ios-app/dbv-nfc-games/Services/SyncEngine.swift`
- Modify: `ios-app/dbv-nfc-games/Services/OfflineQueue.swift`
- Modify: `ios-app/dbv-nfc-games/Features/CheckIn/CheckInTabView.swift`

**Context:** `SyncEngine.swift` line 96-103: after `maxRetries` (5), actions are dequeued and deleted. `lastSyncError` is set briefly but not persisted per-action. Players lose submissions silently.

- [ ] **Step 1: Add failed status to PendingAction**

Read `OfflineQueue.swift` to understand the `PendingAction` model. It conforms to `Codable` (defined in `Models/Submission.swift` around line 103) and is persisted as JSON. Add fields with defaults:
```swift
var permanentlyFailed: Bool = false
var failureReason: String? = nil
```

**Critical:** Since `PendingAction` is `Codable` and existing JSON on user devices won't have these keys, you must add a custom decoder to handle backward compatibility:
```swift
init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    // ... decode all existing fields ...
    self.permanentlyFailed = try container.decodeIfPresent(Bool.self, forKey: .permanentlyFailed) ?? false
    self.failureReason = try container.decodeIfPresent(String.self, forKey: .failureReason)
}
```

- [ ] **Step 2: Add markFailed method to OfflineQueue**

`OfflineQueue` is an `actor`, so all methods are already isolated. Add:
```swift
func markFailed(_ id: UUID, reason: String) {
    if let index = queue.firstIndex(where: { $0.id == id }) {
        queue[index].permanentlyFailed = true
        queue[index].failureReason = reason
        persist()
    }
}

var failedActions: [PendingAction] {
    queue.filter { $0.permanentlyFailed }
}

var failedCount: Int {
    queue.filter { $0.permanentlyFailed }.count
}
```

- [ ] **Step 3: Update SyncEngine to mark failed instead of dequeue**

In `SyncEngine.swift` line 96-103, change:
```swift
if action.retryCount >= self.maxRetries {
    await OfflineQueue.shared.dequeue(action.id)
```
to:
```swift
if action.retryCount >= self.maxRetries {
    await OfflineQueue.shared.markFailed(action.id, reason: "Failed after \(self.maxRetries) retries")
```

Also skip permanently failed actions at the start of `processAction`:
```swift
guard !action.permanentlyFailed else { return }
```

- [ ] **Step 4: Add failed submissions indicator to CheckInTabView**

Since `OfflineQueue` is an `actor`, its properties cannot be accessed synchronously in SwiftUI `body`. Add a `@State` variable and fetch in `.task`:

```swift
@State private var failedSyncCount = 0

// In .task or .onAppear:
failedSyncCount = await OfflineQueue.shared.failedCount

// In body:
if failedSyncCount > 0 {
    HStack(spacing: 8) {
        Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(.red)
        Text(locale.t("offline.failedSubmissions", String(failedSyncCount)))
            .font(.caption)
            .foregroundStyle(.red)
    }
    .padding(.horizontal)
}
```

- [ ] **Step 5: Add translation key**

In `Translations.swift`:

English: `"offline.failedSubmissions": "%@ submission(s) failed to sync. Check your connection and try again."`
Portuguese: `"offline.failedSubmissions": "%@ submissão(ões) falharam ao sincronizar. Verifique a conexão e tente novamente."`
German: `"offline.failedSubmissions": "%@ Einreichung(en) konnten nicht synchronisiert werden. Überprüfen Sie Ihre Verbindung."`

- [ ] **Step 6: Build**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: ** BUILD SUCCEEDED **

- [ ] **Step 7: Commit**

```bash
git add ios-app/
git commit -m "fix(ios): keep failed sync actions visible instead of silently deleting

Fixes GAP-E-2. After 5 failed retries, actions are marked as permanently
failed (not deleted). Shows failed submission count in CheckInTabView."
```

### Task 5: Add Operator Remove UI (GAP-F-2)

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/OperatorsManagementView.swift`
- Possibly modify: `ios-app/dbv-nfc-games/Services/APIClient.swift`

**Context:** `OperatorsManagementView.swift` has invite (plus button, line 101-108) but no remove. Operators are displayed read-only (lines 35-53). Backend endpoint: `DELETE /api/games/{gameId}/operators/{userId}`.

- [ ] **Step 1: Verify API endpoint is defined**

Read `APIClient.swift` and search for `removeOperator` or the DELETE operators endpoint. If not defined, add it using the existing `deleteVoid` pattern (private method with `/api/` prefix):
```swift
func removeOperator(gameId: UUID, userId: UUID, token: String) async throws {
    try await deleteVoid("/api/games/\(gameId)/operators/\(userId)", token: token)
}
```

- [ ] **Step 2: Add swipe-to-delete on operator rows**

In `OperatorsManagementView.swift`, replace the simple `ForEach` (lines 35-53) with a version that supports swipe actions:

```swift
ForEach(operators) { op in
    HStack {
        // ... existing row content ...
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
        if op.role != "admin" {
            Button(role: .destructive) {
                operatorToRemove = op
            } label: {
                Label(locale.t("common.remove"), systemImage: "trash")
            }
        }
    }
}
```

Add state variable:
```swift
@State private var operatorToRemove: OperatorUserResponse?
```

- [ ] **Step 3: Add confirmation alert**

Add after the existing `.alert` modifier:
```swift
.alert(locale.t("operator.removeOperator"), isPresented: Binding(
    get: { operatorToRemove != nil },
    set: { if !$0 { operatorToRemove = nil } }
)) {
    Button(locale.t("common.remove"), role: .destructive) {
        if let op = operatorToRemove {
            Task { await removeOperator(op) }
        }
    }
    Button(locale.t("common.cancel"), role: .cancel) {}
} message: {
    Text(locale.t("operator.removeOperatorConfirm", operatorToRemove?.name ?? ""))
}
```

- [ ] **Step 4: Add removeOperator action**

```swift
private func removeOperator(_ op: OperatorUserResponse) async {
    guard let token else { return }
    do {
        try await appState.apiClient.removeOperator(gameId: game.id, userId: op.id, token: token)
        operators.removeAll { $0.id == op.id }
    } catch {
        errorMessage = error.localizedDescription
    }
}
```

- [ ] **Step 5: Add translation keys**

In `Translations.swift`:

English:
```
"operator.removeOperator": "Remove Operator"
"operator.removeOperatorConfirm": "Remove %@ as an operator from this game?"
"common.remove": "Remove"
```

Add Portuguese and German equivalents.

- [ ] **Step 6: Build**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: ** BUILD SUCCEEDED **

- [ ] **Step 7: Commit**

```bash
git add ios-app/
git commit -m "feat(ios): add operator removal with swipe-to-delete

Fixes GAP-F-2 (iOS). Adds swipe-to-delete on operator rows with
confirmation alert. Admin operators cannot be removed."
```

### Task 6: Add Team Variable Completeness Check Before Go-Live (GAP-F-6)

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/OperatorSetupHubView.swift`
- Possibly modify: `ios-app/dbv-nfc-games/Services/APIClient.swift`

**Context:** `OperatorSetupHubView.swift` checks bases, NFC tags, challenges, teams, and assignment coverage — but NOT team variable completeness. Backend enforces this at go-live, so operator gets a confusing 400 error.

- [ ] **Step 1: Verify API endpoint**

Check if `APIClient.swift` has a method for `GET /api/games/{gameId}/team-variables/completeness`. If not, add it using the existing GET pattern:
```swift
func getTeamVariablesCompleteness(gameId: UUID, token: String) async throws -> TeamVariablesCompletenessResponse {
    return try await get("/api/games/\(gameId)/team-variables/completeness", token: token)
}
```

Check what the backend response looks like and create a matching `TeamVariablesCompletenessResponse` struct if it doesn't exist.

- [ ] **Step 2: Add completeness check to warnings**

In `OperatorSetupHubView.swift`, `warnings` is a **computed property** (around line 26: `private var warnings: [SetupWarning] { ... }`) that builds a `result` array and returns it. The actual struct is `SetupWarning(text:, icon:)` — NOT `GoLiveWarning`.

Add state for the completeness data:
```swift
@State private var teamVariablesComplete: Bool = true
```

Fetch it in the existing `.task` or `loadData()` alongside the other parallel API calls.

Inside the `warnings` computed property body, before `return result`, add:
```swift
if !teamVariablesComplete {
    result.append(SetupWarning(
        text: locale.t("setup.teamVariablesIncomplete"),
        icon: "exclamationmark.triangle.fill"
    ))
}
```

- [ ] **Step 3: Add translation key**

In `Translations.swift`:

English: `"setup.teamVariablesIncomplete": "Some teams have incomplete variable values"`
Portuguese: `"setup.teamVariablesIncomplete": "Algumas equipas têm valores de variáveis incompletos"`
German: `"setup.teamVariablesIncomplete": "Einige Teams haben unvollständige Variablenwerte"`

- [ ] **Step 4: Build**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5`
Expected: ** BUILD SUCCEEDED **

- [ ] **Step 5: Commit**

```bash
git add ios-app/
git commit -m "fix(ios): add team variable completeness check to go-live warnings

Fixes GAP-F-6. OperatorSetupHubView now checks team variable
completeness before go-live and shows a warning if incomplete."
```
