# Move requirePresenceToSubmit from Base to Challenge

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `requirePresenceToSubmit` from the Base entity to the Challenge entity across all platforms, with data migration and mutual exclusion with `answerType="none"`.

**Architecture:** Backend DB migration adds column to challenges, copies values from bases via assignments, then drops from bases. API contract changes: field moves from Base responses to Challenge responses. All clients adapt. Backend enforces: `answerType="none"` → `requirePresenceToSubmit` always false. UI enforces mutual exclusion.

**Tech Stack:** Spring Boot/Java, React/TypeScript, Swift/SwiftUI, Kotlin/Compose

**Execution order:** Backend FIRST (API contract change), then web-admin + iOS + Android in parallel.

---

## Phase 1: Backend (must complete before other phases)

### Task 1: Database Migration

**Files:**
- Create: `backend/src/main/resources/db/migration/V19__move_require_presence_to_challenge.sql` (check current migration count — use next number)

- [ ] **Step 1: Check current migration count**

Run: `ls backend/src/main/resources/db/migration/ | tail -3`
Use the next version number.

- [ ] **Step 2: Write the migration**

```sql
-- Add requirePresenceToSubmit to challenges table (default false)
ALTER TABLE challenges ADD COLUMN require_presence_to_submit BOOLEAN NOT NULL DEFAULT false;

-- Migrate: for each assignment, copy the base's requirePresenceToSubmit to the challenge
UPDATE challenges c
SET require_presence_to_submit = true
WHERE c.id IN (
    SELECT DISTINCT a.challenge_id
    FROM assignments a
    JOIN bases b ON a.base_id = b.id
    WHERE b.require_presence_to_submit = true
);

-- Drop from bases
ALTER TABLE bases DROP COLUMN require_presence_to_submit;
```

- [ ] **Step 3: Commit migration**

### Task 2: Update Challenge Entity & DTOs

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/entity/Challenge.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/ChallengeResponse.java` (or equivalent)
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/CreateChallengeRequest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateChallengeRequest.java`

- [ ] **Step 1: Add field to Challenge entity**

```java
@Column(name = "require_presence_to_submit", nullable = false)
private Boolean requirePresenceToSubmit = false;
```

- [ ] **Step 2: Add to ChallengeResponse DTO**

```java
private Boolean requirePresenceToSubmit;
```

- [ ] **Step 3: Add to Create/Update Challenge request DTOs**

```java
private Boolean requirePresenceToSubmit = false;
```

- [ ] **Step 4: Add validation in ChallengeService**

When creating/updating a challenge: if `answerType == "none"`, force `requirePresenceToSubmit = false`. In the service layer:
```java
if ("none".equals(request.getAnswerType())) {
    challenge.setRequirePresenceToSubmit(false);
}
```

### Task 3: Remove from Base Entity & DTOs

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/entity/Base.java` — remove field
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/CreateBaseRequest.java` — remove field
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateBaseRequest.java` — remove field
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/BaseResponse.java` — remove field
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/BaseProgressResponse.java` — remove field
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/export/BaseExportDto.java` — remove field

- [ ] **Step 1: Remove from Base.java entity**
- [ ] **Step 2: Remove from CreateBaseRequest.java and UpdateBaseRequest.java**
- [ ] **Step 3: Remove from BaseResponse.java and BaseProgressResponse.java**
- [ ] **Step 4: Remove from BaseExportDto.java**

### Task 4: Update Services

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/BaseService.java` — remove mapping (lines ~59, ~234)
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java` — update BaseProgressResponse building (lines ~258, ~283). The field is removed from the response, so delete those mappings. The challenge info in CheckInResponse should now include requirePresenceToSubmit.
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/ChallengeService.java` — add requirePresenceToSubmit to response mapping and enforce none-type constraint
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/GameImportExportService.java` — move field in import/export (lines ~77, ~191)

- [ ] **Step 1: Update BaseService** — remove requirePresenceToSubmit from base create/update logic
- [ ] **Step 2: Update ChallengeService** — add requirePresenceToSubmit to challenge create/update/response logic, enforce none constraint
- [ ] **Step 3: Update PlayerService** — remove from BaseProgressResponse building. Ensure CheckInResponse challenge info includes requirePresenceToSubmit
- [ ] **Step 4: Update GameImportExportService** — move field from base export/import to challenge export/import

### Task 5: Update Tests

**Files:** All test files with base builder calls that set requirePresenceToSubmit (~18 instances across BaseServiceTest, GameServiceTest, PlayerServiceTest, OperatorPushNotificationServiceTest)

- [ ] **Step 1: Find all test references**

Search for `requirePresenceToSubmit` in `backend/src/test/` and update: remove from base builders, add to challenge builders where needed.

- [ ] **Step 2: Run full test suite**

Run: `cd backend && ./gradlew test`
Expected: All pass

- [ ] **Step 3: Commit all backend changes**

---

## Phase 2: Web-admin (after Phase 1)

### Task 6: Move Toggle from BasesPage to ChallengesPage

**Files:**
- Modify: `web-admin/src/types/index.ts` — remove from Base type, add to Challenge type
- Modify: `web-admin/src/lib/api/bases.ts` — remove from CreateBaseDto
- Modify: `web-admin/src/lib/api/challenges.ts` — add to challenge DTOs (if separate)
- Modify: `web-admin/src/features/game-detail/BasesPage.tsx` — remove toggle (lines ~102, ~108, ~269-270)
- Modify: `web-admin/src/features/game-detail/ChallengesPage.tsx` — add toggle with mutual exclusion
- Modify: `web-admin/src/lib/api/games.ts` — update if needed

- [ ] **Step 1: Update TypeScript types**

In `types/index.ts`, remove `requirePresenceToSubmit` from `Base` interface, add to `Challenge` interface.

- [ ] **Step 2: Remove toggle from BasesPage.tsx**

Remove the `requirePresenceToSubmit` state, toggle UI, and form submission field.

- [ ] **Step 3: Add toggle to ChallengesPage.tsx**

Add toggle in the challenge form. Mutual exclusion logic:
- When `answerType === "none"`: hide the toggle (or show disabled, forced off)
- When `requirePresenceToSubmit` is toggled on: disable "none" in answer type picker

```tsx
{answerType !== "none" && (
  <div className="flex items-center space-x-2">
    <Switch checked={requirePresenceToSubmit} onCheckedChange={setRequirePresenceToSubmit} />
    <label>{t("challenges.requirePresence")}</label>
  </div>
)}
```

- [ ] **Step 4: Update API DTOs** — remove from base create/update, add to challenge create/update
- [ ] **Step 5: Run lint and tests**

Run: `cd web-admin && npm run lint && npm run test`

- [ ] **Step 6: Commit**

---

## Phase 3: iOS (after Phase 1)

### Task 7: Update iOS Models

**Files:**
- Modify: `ios-app/dbv-nfc-games/Models/Game.swift` — remove from Base struct (lines ~74, ~86, ~97, ~111), add to Challenge/ChallengeInfo
- Modify: `ios-app/dbv-nfc-games/Models/OperatorRequests.swift` — remove from CreateBaseRequest/UpdateBaseRequest, add to challenge requests
- Modify: `ios-app/dbv-nfc-games/Models/BaseStatus.swift` — remove from BaseProgress (line ~54)
- Modify: `ios-app/dbv-nfc-games/Services/CacheManager.swift` — update mapping (line ~135)

- [ ] **Step 1: Remove from Base struct**, add backward-compatible decoder (decodeIfPresent, ignore if missing)
- [ ] **Step 2: Add to Challenge/ChallengeInfo struct**
- [ ] **Step 3: Remove from base request DTOs, add to challenge request DTOs**
- [ ] **Step 4: Remove from BaseProgress**

### Task 8: Update iOS Operator UI

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Operator/BaseEditView.swift` — remove toggle (lines ~21, ~68, ~130, ~260, ~277)
- Modify: `ios-app/dbv-nfc-games/Features/Operator/ChallengeEditView.swift` — add toggle with mutual exclusion

- [ ] **Step 1: Remove toggle from BaseEditView**
- [ ] **Step 2: Add toggle to ChallengeEditView**

Show toggle only when `answerType != "none"`. When toggling presence on, disable "none" option.

### Task 9: Update iOS Player Flow

**Files:**
- Modify: `ios-app/dbv-nfc-games/Features/Solve/SolveView.swift` — keep `requirePresenceToSubmit` parameter but source changes
- Modify: `ios-app/dbv-nfc-games/Features/Map/BaseDetailSheet.swift` — read from challenge instead of base
- Modify: `ios-app/dbv-nfc-games/Features/CheckIn/BaseCheckInDetailView.swift` — read from challenge
- Modify: `ios-app/dbv-nfc-games/Features/Operator/NFCWriteView.swift` — update display logic

- [ ] **Step 1: Update BaseDetailSheet.swift**

Change line ~169 from:
```swift
requirePresenceToSubmit: base?.requirePresenceToSubmit ?? false,
```
to:
```swift
requirePresenceToSubmit: challenge?.requirePresenceToSubmit ?? false,
```

- [ ] **Step 2: Update BaseCheckInDetailView.swift** — same pattern
- [ ] **Step 3: Update NFCWriteView.swift** — read from challenge context
- [ ] **Step 4: Build and verify**

Run: `cd ios-app && xcodebuild -scheme dbv-nfc-games -destination 'platform=iOS Simulator,name=iPhone 16e' build`

- [ ] **Step 5: Commit**

---

## Phase 4: Android (after Phase 1)

### Task 10: Update Android Models

**Files:**
- Modify: `android-app/core/model/src/main/kotlin/com/prayer/pointfinder/core/model/Models.kt` — remove from Base/BaseProgress, add to Challenge (lines ~111, ~202, ~441, ~452, ~627)
- Modify: `android-app/core/data/src/main/kotlin/com/prayer/pointfinder/core/data/local/CompanionDatabase.kt` — update mappings (lines ~48, ~52, ~183, ~200, ~215)

- [ ] **Step 1: Remove from Base and BaseProgress data classes, add to Challenge**
- [ ] **Step 2: Update CompanionDatabase mappings**

### Task 11: Update Android Operator UI

**Files:**
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/BaseEditScreen.kt` — remove toggle (lines ~101, ~473, ~485)
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/ChallengeEditScreen.kt` — add toggle with mutual exclusion
- Modify: `android-app/feature/operator/src/main/kotlin/com/prayer/pointfinder/feature/operator/OperatorBasesScreen.kt` — remove badge (line ~239)

- [ ] **Step 1: Remove toggle from BaseEditScreen**
- [ ] **Step 2: Add toggle to ChallengeEditScreen** with mutual exclusion (hide when answerType="none")
- [ ] **Step 3: Remove presence badge from OperatorBasesScreen**

### Task 12: Update Android Player Flow

**Files:**
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/session/PlayerViewModel.kt` — read from challenge (lines ~49, ~240)
- Modify: `android-app/app/src/main/java/com/prayer/pointfinder/navigation/AppNavigation.kt` — update source (lines ~686, ~705, ~744, ~836)
- Modify: `android-app/feature/player/src/main/kotlin/com/prayer/pointfinder/feature/player/PlayerGameplayScreens.kt` — update (lines ~195, ~324)

- [ ] **Step 1: Update AppNavigation.kt** — read `requirePresenceToSubmit` from challenge instead of base progress:

Change:
```kotlin
viewModel.setPresenceRequired(
    state.progress.firstOrNull { it.baseId == baseId }?.requirePresenceToSubmit == true,
)
```
to:
```kotlin
viewModel.setPresenceRequired(
    checkInChallenge?.requirePresenceToSubmit == true,
)
```

- [ ] **Step 2: Update PlayerViewModel and Models**
- [ ] **Step 3: Update tests** (BaseProgressTest, DropdownFilteringTest)
- [ ] **Step 4: Build**

Run: `cd android-app && ./gradlew assembleDebug`

- [ ] **Step 5: Commit**

---

## Phase 5: Final Review

- [ ] Dispatch code reviewer to verify:
  1. No remaining references to `requirePresenceToSubmit` on Base anywhere
  2. All platforms read from Challenge
  3. Mutual exclusion enforced (answerType="none" ↔ requirePresenceToSubmit)
  4. Migration handles existing data correctly
  5. No regressions in player flow
