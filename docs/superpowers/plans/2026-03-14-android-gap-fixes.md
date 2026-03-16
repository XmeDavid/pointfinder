# Android Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 verified gaps in the Android app covering go-live readiness, display name validation, silent offline failures, operator removal, and localization.

**Architecture:** Add missing go-live checks to SetupHubScreen. Add length validation to player name input. Change OfflineSyncWorker to keep failed submissions visible instead of deleting them. Add operator removal UI. Fix localization issues.

**Tech Stack:** Kotlin, Jetpack Compose, Hilt DI, Room, WorkManager, Retrofit

**Gaps addressed:** GAP-BL-1, GAP-BL-6, GAP-V-3, GAP-E-1, GAP-F-2, GAP-L-4, GAP-L-6, GAP-L-2/L-3

---

## Chunk 1: Business Logic & Validation

### Task 1: Add Team Variables Completeness to Go-Live Checks (GAP-BL-1 partial)

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/SetupHubScreen.kt`
- Possibly modify: `android-app/core/network/src/main/kotlin/com/prayer/pointfinder/core/network/CompanionApi.kt`

**Context:** `SetupHubScreen.buildWarnings()` (lines 246-303) shows 6 of the backend's 7 go-live checks. Missing: team variables completeness. The original gap analysis lists 3 missing checks, but verification found that "all bases have assignments" is implicitly covered by the existing challenge count check, and "location-bound base coordinate validation" is covered by the existing unassigned-location-bound check. Only team variables completeness is genuinely missing. Backend endpoint: `GET /api/games/{gameId}/team-variables/completeness`.

- [ ] **Step 1: Check if team-variables completeness API endpoint is defined**

Read `CompanionApi.kt` (or whatever the Retrofit interface is called) and search for `team-variables` or `completeness`. If the endpoint isn't defined, add it:
```kotlin
@GET("games/{gameId}/team-variables/completeness")
suspend fun getTeamVariablesCompleteness(@Path("gameId") gameId: UUID): TeamVariablesCompletenessResponse
```

- [ ] **Step 2: Add completeness check to buildWarnings()**

Read `SetupHubScreen.kt` and find the `buildWarnings()` function (around line 246). After the existing checks, add a team variables completeness warning. This requires fetching the completeness data — either add it to the existing data loading or as a separate call.

If the game uses team variables (check if `teamVariables` list is non-empty), add a warning when completeness check fails. The struct is `SetupWarning(text: String, onClick: () -> Unit)` — see line 240 of `SetupHubScreen.kt`. Add inside `buildWarnings()` (which uses a mutable list), before `return warnings`:
```kotlin
if (teamVariablesIncomplete) {
    warnings += SetupWarning(
        text = stringResource(R.string.warning_team_variables_incomplete),
        onClick = { /* navigate to team variables screen */ },
    )
}
```

- [ ] **Step 3: Add translation string**

Add to `android-app/core/i18n/src/main/res/values/strings.xml`:
```xml
<string name="warning_team_variables_incomplete">Some teams have incomplete variable values</string>
```

Add German translation to `values-de/strings.xml`:
```xml
<string name="warning_team_variables_incomplete">Einige Teams haben unvollständige Variablenwerte</string>
```

Add Portuguese translation to `values-pt/strings.xml`:
```xml
<string name="warning_team_variables_incomplete">Algumas equipas têm valores de variáveis incompletos</string>
```

- [ ] **Step 4: Build and verify**

Run: `cd android-app && ./gradlew :feature:operator:compileDebugKotlin`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add android-app/
git commit -m "fix(android): add team variables completeness check to go-live warnings

Fixes GAP-BL-1. SetupHubScreen now warns when team variables are
incomplete before allowing go-live."
```

### Task 2: Fix Template Variable Display in Challenge Content (GAP-BL-6)

**Files:**
- Modify: `android-app/feature/player/src/main/kotlin/com/prayer/pointfinder/feature/player/PlayerGameplayScreens.kt`

**Context:** Challenge content is displayed raw via `HtmlContentView(html = challenge.content)` (around line 175). If the backend sends pre-resolved content in a different field, use that. If the backend resolves templates inline in the `content` field, investigate why Android sees raw templates (could be a caching issue where content is cached before resolution).

- [ ] **Step 1: Investigate the challenge data model**

Read the Challenge model/DTO to check if there's a separate `resolvedContent` field or if `content` should already contain resolved values. Check how the challenge data is fetched — is it from a cached/offline copy or from the API response?

Read: `android-app/core/model/src/main/kotlin/.../model/Challenge.kt` (or equivalent)
Read: The API endpoint response for fetching challenges assigned to a player

- [ ] **Step 2: Use resolved content**

If the backend resolves templates in the `content` field itself, the issue is likely that Android caches challenge content before the player's team variables are set. Fix by ensuring challenge content is re-fetched (not cached) when displaying to a player.

If there's a separate resolved field, update the display:
```kotlin
HtmlContentView(html = challenge.resolvedContent ?: challenge.content)
```

- [ ] **Step 3: Build and verify**

Run: `cd android-app && ./gradlew :feature:player:compileDebugKotlin`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add android-app/
git commit -m "fix(android): display resolved template variables in challenge content

Fixes GAP-BL-6. Use resolved content from backend response instead
of raw template strings with {{variable}} placeholders."
```

### Task 3: Add Display Name Max Length Validation (GAP-V-3)

**Files:**
- Modify: `android-app/feature/auth/src/main/kotlin/com/prayer/pointfinder/feature/auth/AuthScreens.kt`

**Context:** `PlayerNameScreen` accepts any non-blank display name with no length limit. Backend enforces `@Size(max=100)`. Need to add a counter/limit to the text field.

- [ ] **Step 1: Read the PlayerNameScreen code**

Read `AuthScreens.kt` and find the `PlayerNameScreen` composable. Find the `OutlinedTextField` for the name input.

- [ ] **Step 2: Add max length constraint**

Add a character counter and limit the input length:
```kotlin
OutlinedTextField(
    value = name,
    onValueChange = { if (it.length <= 100) name = it },
    // ... existing params ...
    supportingText = {
        Text("${name.length}/100")
    }
)
```

- [ ] **Step 3: Build and verify**

Run: `cd android-app && ./gradlew :feature:auth:compileDebugKotlin`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add android-app/feature/auth/
git commit -m "fix(android): add display name max length validation (100 chars)

Fixes GAP-V-3. Limits player display name input to 100 characters
to match backend @Size(max=100) constraint. Shows character counter."
```

## Chunk 2: Error Handling & Feature Parity

### Task 4: Keep Failed Offline Submissions Visible (GAP-E-1)

**Files:**
- Modify: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/repo/OfflineSyncWorker.kt`
- Modify: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/local/CompanionDatabase.kt` (contains `PendingActionEntity` at line 17 and `PendingActionDao` at line 70)
- Modify: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/repo/PlayerRepository.kt`

**Context:** `OfflineSyncWorker.kt` calls `playerRepository.markSynced(action.id)` after 5 retries (lines 49-50, 82-84), which deletes the action. Player never knows their submission was lost. Database is currently at version 3 (line 168 of `CompanionDatabase.kt`). Existing entity fields use camelCase without `@ColumnInfo` annotations.

- [ ] **Step 1: Add failed status to PendingActionEntity**

In `CompanionDatabase.kt`, find `PendingActionEntity` (around line 17). Add two fields matching existing camelCase convention (no `@ColumnInfo` needed):

```kotlin
val permanentlyFailed: Boolean = false,
val failureReason: String? = null,
```

- [ ] **Step 2: Add Room migration v3 → v4**

In `CompanionDatabase.kt`, bump `@Database(version = 4, ...)` and add migration:

```kotlin
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE pending_actions ADD COLUMN permanentlyFailed INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE pending_actions ADD COLUMN failureReason TEXT")
    }
}
```

Register the migration in the database builder (find where `Room.databaseBuilder` is called and add `.addMigrations(MIGRATION_3_4)`).

- [ ] **Step 3: Add markPermanentlyFailed to PlayerRepository**

```kotlin
fun markPermanentlyFailed(id: UUID, reason: String) {
    // Update the entity to set permanentlyFailed=true and failureReason
}
```

- [ ] **Step 4: Update OfflineSyncWorker to use markPermanentlyFailed**

In `OfflineSyncWorker.kt`, replace `playerRepository.markSynced(action.id)` in the max-retry branches (lines 49-50, 82-84) with:

```kotlin
if (action.retryCount >= 5) {
    playerRepository.markPermanentlyFailed(
        action.id,
        "Submission failed after 5 retries"
    )
}
```

Also update `pendingActions()` to exclude permanently failed actions from sync:
```kotlin
fun pendingActions() = dao.getPendingActions().filter { !it.permanentlyFailed }
```

- [ ] **Step 5: Add a query method for failed actions**

In `PendingActionDao` (in `CompanionDatabase.kt`, around line 70), add:
```kotlin
@Query("SELECT * FROM pending_actions WHERE permanentlyFailed = 1")
fun getFailedActions(): List<PendingActionEntity>
```

In `PlayerRepository`, add:
```kotlin
fun failedActions(): List<PendingActionEntity> = dao.getFailedActions()
```

- [ ] **Step 6: Build and run module tests**

Run: `cd android-app && ./gradlew :core:data:compileDebugKotlin`
Expected: Compiles successfully

- [ ] **Step 7: Commit**

```bash
git add android-app/core/data/
git commit -m "fix(android): keep failed offline submissions instead of silently deleting

Fixes GAP-E-1. After 5 failed retries, submissions are marked as
permanently failed (not deleted). Adds failed status and failure reason
to PendingActionEntity. Failed actions can be shown to users."
```

### Task 5: Add Operator Remove UI (GAP-F-2)

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorsScreen.kt`
- Possibly modify: `android-app/core/network/src/main/kotlin/com/prayer/pointfinder/core/network/CompanionApi.kt`

**Context:** Android has invite/add operator UI (PersonAdd icon, InviteOperatorDialog). Missing: remove operator button. Backend endpoint exists: `DELETE /api/games/{gameId}/operators/{userId}`.

- [ ] **Step 1: Verify API endpoint exists**

The DELETE endpoint already exists in `CompanionApi.kt` (line 317):
```kotlin
@DELETE("games/{gameId}/operators/{userId}")
suspend fun removeOperator(...)
```
Confirm this by reading the file. No changes needed to the API layer.

- [ ] **Step 2: Add remove callback to OperatorsScreen**

Read `OperatorsScreen.kt`. The composable (around line 45-53) likely takes callback parameters. Add an `onRemove: (UUID) -> Unit` parameter if not present. Find the parent composable or ViewModel that creates `OperatorsScreen` and implement the callback using `CompanionApi.removeOperator()`.

In the ViewModel or parent:
```kotlin
fun removeOperator(userId: UUID) {
    viewModelScope.launch {
        runCatching { api.removeOperator(gameId, userId) }
            .onSuccess { loadOperators() }
            .onFailure { /* show error */ }
    }
}
```

- [ ] **Step 3: Add remove button to operator row**

In `OperatorsScreen.kt`, find the operator list item composable (around line 152-191). Add a delete icon button:

```kotlin
// Don't show remove for the current user or admin
if (op.id != currentUserId && op.role != "admin") {
    IconButton(onClick = { operatorToRemove = op }) {
        Icon(
            Icons.Default.PersonRemove,
            contentDescription = stringResource(R.string.action_remove_operator),
            tint = MaterialTheme.colorScheme.error
        )
    }
}
```

- [ ] **Step 4: Add confirmation dialog**

Add a confirmation dialog before removing:
```kotlin
if (operatorToRemove != null) {
    AlertDialog(
        onDismissRequest = { operatorToRemove = null },
        title = { Text(stringResource(R.string.confirm_remove_operator)) },
        text = { Text(stringResource(R.string.confirm_remove_operator_message, operatorToRemove!!.name)) },
        confirmButton = {
            TextButton(onClick = {
                operatorToRemove?.let { onRemove(it.id) }
                operatorToRemove = null
            }) {
                Text(stringResource(R.string.action_remove))
            }
        },
        dismissButton = {
            TextButton(onClick = { operatorToRemove = null }) {
                Text(stringResource(R.string.action_cancel))
            }
        }
    )
}
```

- [ ] **Step 4: Add translation strings**

Add to `core/i18n/src/main/res/values/strings.xml`:
```xml
<string name="action_remove_operator">Remove operator</string>
<string name="confirm_remove_operator">Remove Operator</string>
<string name="confirm_remove_operator_message">Remove %1$s as an operator?</string>
```

Add German and Portuguese equivalents.

- [ ] **Step 5: Build and verify**

Run: `cd android-app && ./gradlew :feature:operator:compileDebugKotlin`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add android-app/
git commit -m "feat(android): add operator removal UI with confirmation

Fixes GAP-F-2 (Android). Adds remove button to operator list items
with confirmation dialog. Uses DELETE /games/{gameId}/operators/{userId}."
```

## Chunk 3: Localization Fixes

### Task 6: Fix Hardcoded H1/H2 in RichTextEditor (GAP-L-4)

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/RichTextEditorScreen.kt`
- Modify: `android-app/core/i18n/src/main/res/values/strings.xml`
- Modify: `android-app/core/i18n/src/main/res/values-de/strings.xml`
- Modify: `android-app/core/i18n/src/main/res/values-pt/strings.xml`

**Context:** `RichTextEditorScreen.kt` has hardcoded `Text("H1")` on line 283 and `Text("H2")` on line 293. The string resources `label_heading1` and `label_heading2` already exist (lines 259-260 of `values/strings.xml`), and the `contentDescription` parameters on lines 281 and 291 already use `stringResource(R.string.label_heading1/heading2)`. Only the visible Text() labels are hardcoded.

- [ ] **Step 1: Replace hardcoded Text labels**

In `RichTextEditorScreen.kt` line 283, replace:
```kotlin
Text("H1", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
```
with:
```kotlin
Text(stringResource(R.string.label_heading1), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
```

On line 293, do the same for H2:
```kotlin
Text(stringResource(R.string.label_heading2), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
```

No new string resources needed — they already exist.

- [ ] **Step 3: Build**

Run: `cd android-app && ./gradlew :feature:operator:compileDebugKotlin`
Expected: Compiles successfully

- [ ] **Step 4: Commit**

```bash
git add android-app/
git commit -m "fix(android): extract hardcoded H1/H2 to string resources

Fixes GAP-L-4. Replace hardcoded text in RichTextEditorScreen with
localized string resources."
```

### Task 7: Fix German Umlaut Inconsistencies (GAP-L-6)

**Files:**
- Modify: `android-app/core/i18n/src/main/res/values-de/strings.xml`

**Context:** German strings mix ASCII approximations ("moechtest", "gueltigen") with proper Unicode ("ö", "ü"). Standardize to raw Unicode characters.

- [ ] **Step 1: Find and fix ASCII umlaut approximations**

Search `values-de/strings.xml` for ASCII approximations:
- `moechtest` → `möchtest`
- `gueltigen` → `gültigen`
- Any other `oe` → `ö`, `ue` → `ü`, `ae` → `ä` patterns that are clearly German umlaut approximations

**Important:** Only fix cases where the ASCII form is clearly an umlaut approximation, not legitimate letter combinations (e.g., "Abenteuer" contains "ue" but it's not an umlaut approximation).

- [ ] **Step 2: Build**

Run: `cd android-app && ./gradlew :core:i18n:compileDebugKotlin`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add android-app/core/i18n/
git commit -m "fix(android): standardize German umlauts to raw Unicode

Fixes GAP-L-6. Replace ASCII approximations (moechtest→möchtest,
gueltigen→gültigen) with proper Unicode characters in German strings."
```

### Task 8: Complete Missing Translation Keys (GAP-L-2, GAP-L-3)

**Files:**
- Modify: `android-app/core/i18n/src/main/res/values-de/strings.xml`
- Modify: `android-app/app/src/main/res/values-pt/strings.xml`

**Context:** ~7 German keys missing from core/i18n (toast_base_created, toast_base_saved, toast_challenge_created, toast_challenge_saved, toast_game_created, toast_game_saved, toast_team_saved). ~7 Portuguese keys missing from app module. These are minor — the percentages in the original gap report (69%, 72%) were incorrect.

- [ ] **Step 1: Find missing German keys in core/i18n**

Compare `values/strings.xml` and `values-de/strings.xml` in `core/i18n/src/main/res/`. Find keys present in English but not in German. Add the missing translations:

```xml
<string name="toast_base_created">Station erstellt</string>
<string name="toast_base_saved">Station gespeichert</string>
<string name="toast_challenge_created">Aufgabe erstellt</string>
<string name="toast_challenge_saved">Aufgabe gespeichert</string>
<string name="toast_game_created">Spiel erstellt</string>
<string name="toast_game_saved">Spiel gespeichert</string>
<string name="toast_team_saved">Team gespeichert</string>
```

- [ ] **Step 2: Find missing Portuguese keys in app module**

Compare `values/strings.xml` and `values-pt/strings.xml` in `app/src/main/res/`. Add any missing Portuguese translations.

- [ ] **Step 3: Build**

Run: `cd android-app && ./gradlew assembleDebug`
Expected: Builds successfully

- [ ] **Step 4: Commit**

```bash
git add android-app/
git commit -m "fix(android): complete missing German and Portuguese translations

Fixes GAP-L-2, GAP-L-3. Adds ~7 missing German translation keys
(toast messages) and ~7 missing Portuguese translation keys."
```
