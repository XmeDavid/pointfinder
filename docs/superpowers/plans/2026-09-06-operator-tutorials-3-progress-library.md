# Operator tutorials — Phase 3: Per-account progress and tutorials library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every operator's tutorial progress server-side, per account, and give them a `/tutorials` library page that starts, resumes, or restarts any scenario — so a reload, a second device, or a new browser picks the tour up where it was left.

**Architecture:** A new `user_tutorial_progress` table keyed by `(user_id, scenario_id)` is served by two endpoints under `/api/users/me/tutorials`, mirroring the `OperatorNotificationSettings` entity/repository/service/controller shape. On the web side a thin `tutorialsApi` plus a TanStack query and mutation feed `features/tutorials/progressSync.ts`, which hydrates the phase‑1 `useTourStore.progress` map on mount and writes changes back debounced by 500 ms. The library page composes canonical `Card`/`Badge`/`Skeleton`/`EmptyState`/`Dialog` primitives and drives the same `useTourStore.start()` the welcome card already uses.

**Tech Stack:** Java 21, Spring Boot 3.4, Hibernate 6.6, Flyway, PostgreSQL 16, Lombok, JUnit 5, Testcontainers (`IntegrationTestBase`), Gradle; React 19, TypeScript, Tailwind v4 semantic tokens, TanStack Query v5, Zustand, react-i18next (`@pointfinder/i18n`), Vitest + Testing Library + MSW; Playwright for the full-stack smoke.

---

## Contract deviations

Every entry below is already merged into the "Contract deviations" section of
`docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md`. Confirm they are still there
as the first step of Task 1; **append** anything execution turns up, and never replace the
section or `git add` that file.

1. **`game_id` column.** The shared contract's table and DTOs carry no game reference, but a
   `setup-game` scenario cannot resume without knowing which game it was bound to.
   `user_tutorial_progress` gains `game_id UUID NULL REFERENCES games(id) ON DELETE SET NULL` and
   `UpdateTutorialProgressRequest` / `TutorialProgressResponse` gain `UUID gameId`. The client-side
   half of this is **not** phase 3's: `TutorialProgress.gameId` already exists in
   `web/src/features/tutorials/types.ts` from phase 1, because the store's `complete()` and
   `skip()` build that row. When the referenced game is gone, or is no longer in `setup`, resume
   falls back to the picker.
2. **No resume field is added to the store.** Phase 1's position is a step **id**
   (`currentStepId`) and `start(scenarioId, opts?: { gameId?; stepId?; gamesAtStart? })` already
   accepts a step to begin at, so Resume is one `start(id, { gameId, stepId })` call. The
   `resumeAt` / `pendingResumeStepId` pair an earlier draft of this plan proposed does not exist:
   nothing converts an id to an index any more, so nothing needs to be deferred to the host.
3. **`CreateGameDialog` gains `onCreated?: (game: Game) => void`.** When provided, the dialog calls
   it instead of navigating to `/game/:id`, so the setup-game picker can bind the new game to the
   scenario and navigate itself. The dashboard call site passes nothing and keeps navigating.
4. **`useProgressWriteThrough()` takes no argument.** The contract named the function without
   parameters and it stays that way: the live step id is `useTourStore`'s `currentStepId`, which
   the hook reads directly, so `TourHost` passes nothing down and `TourRunner` needs no
   `onStepIdChange` prop. `TourRunner` writes a real id into the store on its first render, so the
   server sees a step id rather than `null` within a debounce window of the run starting.
5. **New error codes `TUTORIAL_SCENARIO_UNKNOWN` and `TUTORIAL_STATUS_UNKNOWN`.** The contract said
   "`ErrorCode.VALIDATION_ERROR` (or the nearest existing validation code)". No such code exists in
   `backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java`; two specific codes are
   added under a new "Tutorials" group.
6. **`docs/api-reference.md` placement.** There is no REST "Operator/Web Client" area — that heading
   belongs to §12 WebSocket. The two endpoints are documented in §15 "Users & Invites", in the
   `Users` table and payload block.
7. **`docs/business-logic.md` section.** Phase 2 adds a `### Onboarding: the guided first game`
   subsection at the end of section 1. Phase 3 creates the proper top-level
   `## 9. Operator Onboarding and Tutorials` plus its Table-of-Contents entry, and **moves** phase
   2's subsection into it, so onboarding lives in exactly one place.
8. **Full-stack E2E entry point is the library, not the welcome card.** `e2e/shared/api-client.ts`
   cannot register a fresh operator (`InviteResponse` does not expose the invite token), and the
   shared E2E operator always owns games, so the zero-games welcome card is not reliably visible.
   The smoke seeds a `skipped` row through the API and enters through
   `tutorial-restart-first-game` on `/tutorials`. Welcome-card Start/Skip stays covered by Vitest.
9. **`hydrateProgress()` is the hook `useProgressHydration()`.** Same file, same responsibility;
   it needs React Query, so it is a hook rather than a plain function.

---

## Global Constraints

- Never rename an existing `data-testid`, route, API path, query key, DTO field, or accessibility
  id. New ids only.
- Backend package root is `com.prayer.pointfinder`. Migration file is exactly
  `backend/src/main/resources/db/migration/V61__user_tutorial_progress.sql`; the latest existing
  migration is `V60__check_in_methods.sql`.
- The enum is `com.prayer.pointfinder.entity.TutorialStatus { IN_PROGRESS, COMPLETED, SKIPPED }`,
  persisted as its **uppercase name** in `VARCHAR(16)` via `@Enumerated(EnumType.STRING)`. On the
  wire the status is **lowercase** (`in_progress|completed|skipped`); the mapping lives in
  `TutorialStatus.wireName()` / `TutorialStatus.fromWire(String)`.
- Allowlist: `TutorialProgressService.KNOWN_SCENARIOS = Set.of("first-game", "fixed-route", "exploration")`.
  Unknown id → `BadRequestException(..., ErrorCode.TUTORIAL_SCENARIO_UNKNOWN, Map.of("scenarioId", id))` → 400.
- Role is enforced by `SecurityConfig`: `/api/users/**` already requires `hasAnyRole("ADMIN","OPERATOR")`.
  Do **not** add a `@PreAuthorize` — `UserController` does not have one either.
- New test ids, exactly: `tutorials-page`, `tutorial-card-{scenarioId}`, `tutorial-start-{scenarioId}`,
  `tutorial-resume-{scenarioId}`, `tutorial-restart-{scenarioId}`, `tutorial-status-{scenarioId}`,
  `setup-game-picker`, `setup-game-option-{gameId}`, `setup-game-create`, `menu-tutorials`,
  `tutorials-error`, `tutorials-retry`, `tutorials-skeleton`.
- Every new i18n key lands in `packages/i18n/src/locales/en.json`, `pt.json` **and** `de.json` in the
  same change — `packages/i18n/src/locales.test.ts` enforces key parity and rejects empty strings.
- Compose canonical components only (`@/components/ui/*`, `@/components/feedback/*`). No new inline
  primitives, no raw Tailwind palette classes.
- Cover loading / error / empty / disabled / long-copy states, light and dark themes, and accessible
  labels on every control.
- `ScenarioCard` stays a **feature** component under `web/src/features/tutorials/`, so it gets **no**
  row in `docs/visual-system/component-inventory.md`.
- Focused backend test command (from repo root `/Users/xmedavid/dev/dbvnfc`):
  `docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests '<FQCN>'`
  Full backend suite: `make test-backend-docker`.
- Focused web test command: `bun run --cwd web test -- <path>`. Package tests:
  `bun run --cwd packages/i18n test`. Gates: `bun run --cwd web typecheck`, `bun run --cwd web lint`.
- Full-stack E2E: `cd e2e && ./run.sh smoke:web`.
- This whole phase is **ONE atomic commit**, made only in the final task, with message
  `feat(tutorials): per-account progress and tutorials library` and trailer
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do **NOT** commit anything under `docs/superpowers/` or `docs/specs/`. Stage by explicit path.
- Every task ends with a "Stage" step. Nothing is committed until Task 8.

---

### Task 1: Migration V61, `TutorialStatus`, entity, id and repository

**Files:**
- Modify: `docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md` (Contract deviations section — **not staged, not committed**)
- Create: `backend/src/main/resources/db/migration/V61__user_tutorial_progress.sql`
- Create: `backend/src/main/java/com/prayer/pointfinder/entity/TutorialStatus.java`
- Create: `backend/src/main/java/com/prayer/pointfinder/entity/UserTutorialProgressId.java`
- Create: `backend/src/main/java/com/prayer/pointfinder/entity/UserTutorialProgress.java`
- Create: `backend/src/main/java/com/prayer/pointfinder/repository/UserTutorialProgressRepository.java`
- Test: `backend/src/test/java/com/prayer/pointfinder/entity/TutorialStatusTest.java`
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/TutorialProgressSchemaTest.java`

**Interfaces:**
- Produces `enum TutorialStatus { IN_PROGRESS, COMPLETED, SKIPPED }` with
  `String wireName()` and `static TutorialStatus fromWire(String)` (returns `null` for unknown input).
- Produces `UserTutorialProgressId(UUID userId, String scenarioId)` (`@Embeddable`, `Serializable`).
- Produces `UserTutorialProgress` with `id`, `status`, `currentStep`, `gameId`, `startedAt`,
  `completedAt`, `updatedAt` and a Lombok builder.
- Produces `UserTutorialProgressRepository.findAllByIdUserId(UUID) : List<UserTutorialProgress>`.
- Produces the DB columns consumed by Task 2.

- [ ] **Step 1: Record the contract deviations in the index**

Append the nine numbered entries from the "Contract deviations" section at the top of **this** file
to the `## Contract deviations` section at the bottom of
`docs/superpowers/plans/2026-09-06-operator-tutorials-0-index.md`, replacing the line
`(none yet — append here during planning or execution)`. This file is untracked on purpose and is
never staged.

- [ ] **Step 2: Write the failing tests**

Create `backend/src/test/java/com/prayer/pointfinder/entity/TutorialStatusTest.java`:

```java
package com.prayer.pointfinder.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The wire contract: the database and the enum use uppercase names, every
 * client sees lowercase. Unknown input is rejected by the caller, not guessed.
 */
class TutorialStatusTest {

    @Test
    void wireNamesAreLowercase() {
        assertEquals("in_progress", TutorialStatus.IN_PROGRESS.wireName());
        assertEquals("completed", TutorialStatus.COMPLETED.wireName());
        assertEquals("skipped", TutorialStatus.SKIPPED.wireName());
    }

    @Test
    void fromWireAcceptsLowercaseAndTrimsAndIsCaseInsensitive() {
        assertEquals(TutorialStatus.IN_PROGRESS, TutorialStatus.fromWire("in_progress"));
        assertEquals(TutorialStatus.COMPLETED, TutorialStatus.fromWire("  COMPLETED "));
        assertEquals(TutorialStatus.SKIPPED, TutorialStatus.fromWire("Skipped"));
    }

    @Test
    void fromWireReturnsNullForUnknownInput() {
        assertNull(TutorialStatus.fromWire("paused"));
        assertNull(TutorialStatus.fromWire(""));
        assertNull(TutorialStatus.fromWire(null));
    }
}
```

Create `backend/src/test/java/com/prayer/pointfinder/integration/TutorialProgressSchemaTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V61 schema contract: the composite primary key, the nullability of every
 * column, and the cascade that removes a deleted operator's tutorial rows.
 */
class TutorialProgressSchemaTest extends IntegrationTestBase {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Map<String, Object> column(String name) {
        return jdbcTemplate.queryForMap(
                "SELECT data_type, is_nullable FROM information_schema.columns "
                        + "WHERE table_name = 'user_tutorial_progress' AND column_name = ?",
                name);
    }

    @Test
    void tableCarriesEveryColumnWithTheRightNullability() {
        assertEquals("NO", column("user_id").get("is_nullable"));
        assertEquals("uuid", column("user_id").get("data_type"));

        assertEquals("NO", column("scenario_id").get("is_nullable"));
        assertEquals("character varying", column("scenario_id").get("data_type"));

        assertEquals("NO", column("status").get("is_nullable"));
        assertEquals("character varying", column("status").get("data_type"));

        assertEquals("YES", column("current_step").get("is_nullable"));
        assertEquals("YES", column("game_id").get("is_nullable"));
        assertEquals("uuid", column("game_id").get("data_type"));

        assertEquals("NO", column("started_at").get("is_nullable"));
        assertEquals("YES", column("completed_at").get("is_nullable"));
        assertEquals("NO", column("updated_at").get("is_nullable"));
    }

    @Test
    void primaryKeyIsUserPlusScenario() {
        List<String> pkColumns = jdbcTemplate.queryForList(
                "SELECT a.attname FROM pg_index i "
                        + "JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) "
                        + "WHERE i.indrelid = 'user_tutorial_progress'::regclass AND i.indisprimary "
                        + "ORDER BY a.attname",
                String.class);

        assertEquals(List.of("scenario_id", "user_id"), pkColumns);
    }

    @Test
    void deletingTheUserRemovesTheirTutorialRows() {
        var user = createOperator("schema-cascade@test.com", "password");
        jdbcTemplate.update(
                "INSERT INTO user_tutorial_progress (user_id, scenario_id, status) VALUES (?, ?, ?)",
                user.getId(), "first-game", "IN_PROGRESS");

        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM user_tutorial_progress WHERE user_id = ?", Integer.class, user.getId()));

        userRepository.deleteById(user.getId());

        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM user_tutorial_progress WHERE user_id = ?", Integer.class, user.getId()));
    }

    @Test
    void startedAtAndUpdatedAtDefaultToNow() {
        var user = createOperator("schema-defaults@test.com", "password");
        jdbcTemplate.update(
                "INSERT INTO user_tutorial_progress (user_id, scenario_id, status) VALUES (?, ?, ?)",
                user.getId(), "fixed-route", "SKIPPED");

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT started_at, updated_at FROM user_tutorial_progress WHERE user_id = ?", user.getId());

        assertTrue(row.get("started_at") != null);
        assertTrue(row.get("updated_at") != null);
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.entity.TutorialStatusTest' --tests 'com.prayer.pointfinder.integration.TutorialProgressSchemaTest'
```

Expected: compilation failure — `cannot find symbol: class TutorialStatus`.

- [ ] **Step 4: Write the migration**

Create `backend/src/main/resources/db/migration/V61__user_tutorial_progress.sql`:

```sql
-- Wave: operator tutorials.
-- Spec: docs/specs/2026-09-06-operator-tutorials-design.md
--
-- Where an operator is inside a guided tutorial, per account rather than per
-- device, so a reload, a second browser, or the Tauri shell all pick up the
-- same run. One row per (operator, scenario); no row means "not started".
--
--   * status       — IN_PROGRESS | COMPLETED | SKIPPED. Stored as the Java
--                    enum name; the API speaks lowercase.
--   * current_step — the scenario step id the operator is on. NULL together
--                    with IN_PROGRESS means "restart this scenario from the
--                    top", which is how the library's Restart button is
--                    expressed without a DELETE endpoint.
--   * game_id      — the game a setup-game scenario was bound to, so Resume
--                    can return to it. A soft pointer: the client falls back
--                    to the game picker when the game is gone or has left
--                    setup, and the FK nulls the column if the game is
--                    deleted.
--
-- This is UI preference, not domain state: it is never audited and never
-- affects a game, a team, or a score.

CREATE TABLE user_tutorial_progress (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id  VARCHAR(64) NOT NULL,
  status       VARCHAR(16) NOT NULL,
  current_step VARCHAR(64),
  game_id      UUID        REFERENCES games(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scenario_id)
);
```

- [ ] **Step 5: Write the enum, the id, the entity and the repository**

Create `backend/src/main/java/com/prayer/pointfinder/entity/TutorialStatus.java`:

```java
package com.prayer.pointfinder.entity;

import java.util.Locale;

/**
 * Where an operator stands in one guided tutorial.
 *
 * <p>Persisted as the constant name ({@code IN_PROGRESS}) so the column reads
 * like every other enum column in the schema, but exposed on the wire in
 * lowercase ({@code in_progress}) because that is what the web client and the
 * design spec use. {@link #fromWire(String)} is deliberately lenient about case
 * and surrounding whitespace and deliberately strict about everything else: it
 * returns {@code null} rather than guessing, and the caller turns that into a
 * 400.
 */
public enum TutorialStatus {
    IN_PROGRESS,
    COMPLETED,
    SKIPPED;

    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static TutorialStatus fromWire(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        for (TutorialStatus status : values()) {
            if (status.name().equals(normalized)) {
                return status;
            }
        }
        return null;
    }
}
```

Create `backend/src/main/java/com/prayer/pointfinder/entity/UserTutorialProgressId.java`:

```java
package com.prayer.pointfinder.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.UUID;

/** Composite key of {@link UserTutorialProgress}: one row per operator and scenario. */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class UserTutorialProgressId implements Serializable {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "scenario_id", nullable = false, length = 64)
    private String scenarioId;
}
```

Create `backend/src/main/java/com/prayer/pointfinder/entity/UserTutorialProgress.java`:

```java
package com.prayer.pointfinder.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * One operator's progress through one guided tutorial scenario.
 *
 * <p>{@code gameId} is a soft pointer to the game a {@code setup-game} scenario
 * was bound to. It is a plain column rather than a {@code @ManyToOne} because
 * the client treats a missing or no-longer-in-setup game as "ask again", and
 * loading a whole game to render a library card would be wasteful.
 */
@Entity
@Table(name = "user_tutorial_progress")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserTutorialProgress {

    @EmbeddedId
    private UserTutorialProgressId id;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private TutorialStatus status;

    @Column(name = "current_step", length = 64)
    private String currentStep;

    @Column(name = "game_id")
    private UUID gameId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
```

Create `backend/src/main/java/com/prayer/pointfinder/repository/UserTutorialProgressRepository.java`:

```java
package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.UserTutorialProgress;
import com.prayer.pointfinder.entity.UserTutorialProgressId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserTutorialProgressRepository
        extends JpaRepository<UserTutorialProgress, UserTutorialProgressId> {

    List<UserTutorialProgress> findAllByIdUserId(UUID userId);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.entity.TutorialStatusTest' --tests 'com.prayer.pointfinder.integration.TutorialProgressSchemaTest'
```

Expected: `BUILD SUCCESSFUL`, 7 tests passing, none skipped.

- [ ] **Step 7: Stage**

```bash
git add backend/src/main/resources/db/migration/V61__user_tutorial_progress.sql \
        backend/src/main/java/com/prayer/pointfinder/entity/TutorialStatus.java \
        backend/src/main/java/com/prayer/pointfinder/entity/UserTutorialProgressId.java \
        backend/src/main/java/com/prayer/pointfinder/entity/UserTutorialProgress.java \
        backend/src/main/java/com/prayer/pointfinder/repository/UserTutorialProgressRepository.java \
        backend/src/test/java/com/prayer/pointfinder/entity/TutorialStatusTest.java \
        backend/src/test/java/com/prayer/pointfinder/integration/TutorialProgressSchemaTest.java
```

---

### Task 2: DTOs, error codes and `TutorialProgressService`

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java` (append a "Tutorials" group before the closing `}`)
- Create: `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateTutorialProgressRequest.java`
- Create: `backend/src/main/java/com/prayer/pointfinder/dto/response/TutorialProgressResponse.java`
- Create: `backend/src/main/java/com/prayer/pointfinder/service/TutorialProgressService.java`
- Test: `backend/src/test/java/com/prayer/pointfinder/service/TutorialProgressServiceTest.java`

**Interfaces:**
- Consumes `TutorialStatus`, `UserTutorialProgress`, `UserTutorialProgressId`,
  `UserTutorialProgressRepository` (Task 1).
- Produces `ErrorCode.TUTORIAL_SCENARIO_UNKNOWN`, `ErrorCode.TUTORIAL_STATUS_UNKNOWN`.
- Produces `UpdateTutorialProgressRequest { String status; String currentStep; UUID gameId }`
  (Lombok `@Data`, `@NotNull` on `status`).
- Produces `record TutorialProgressResponse(String scenarioId, String status, String currentStep, UUID gameId, Instant startedAt, Instant completedAt)`.
- Produces `TutorialProgressService.KNOWN_SCENARIOS : Set<String>`,
  `listForCurrentUser() : List<TutorialProgressResponse>`,
  `upsertForCurrentUser(String scenarioId, UpdateTutorialProgressRequest) : TutorialProgressResponse`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/TutorialProgressServiceTest.java`:

```java
package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.UpdateTutorialProgressRequest;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tutorial progress is per account, upsert-only, and isolated between
 * operators. Restart is expressed as "in_progress with no current step".
 */
class TutorialProgressServiceTest extends IntegrationTestBase {

    @Autowired
    private TutorialProgressService tutorialProgressService;

    @Autowired
    private UserTutorialProgressRepository progressRepository;

    @BeforeEach
    void clearProgress() {
        progressRepository.deleteAll();
    }

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private User authenticate(String email) {
        User operator = createOperator(email, "password");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        return operator;
    }

    private UpdateTutorialProgressRequest body(String status, String currentStep, UUID gameId) {
        UpdateTutorialProgressRequest request = new UpdateTutorialProgressRequest();
        request.setStatus(status);
        request.setCurrentStep(currentStep);
        request.setGameId(gameId);
        return request;
    }

    @Test
    void listIsEmptyForAnOperatorWhoNeverStartedATutorial() {
        authenticate("tut-empty@test.com");

        assertEquals(List.of(), tutorialProgressService.listForCurrentUser());
    }

    @Test
    void upsertCreatesTheRowAndListReturnsIt() {
        authenticate("tut-create@test.com");

        TutorialProgressResponse created = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "place-base", null));

        assertEquals("first-game", created.scenarioId());
        assertEquals("in_progress", created.status());
        assertEquals("place-base", created.currentStep());
        assertNull(created.completedAt());
        assertNotNull(created.startedAt());

        List<TutorialProgressResponse> rows = tutorialProgressService.listForCurrentUser();
        assertEquals(1, rows.size());
        assertEquals("first-game", rows.get(0).scenarioId());
        assertEquals("place-base", rows.get(0).currentStep());
    }

    @Test
    void upsertUpdatesTheSameRowRatherThanAddingAnother() {
        authenticate("tut-update@test.com");
        tutorialProgressService.upsertForCurrentUser("first-game", body("in_progress", "place-base", null));

        tutorialProgressService.upsertForCurrentUser("first-game", body("in_progress", "go-live", null));

        List<TutorialProgressResponse> rows = tutorialProgressService.listForCurrentUser();
        assertEquals(1, rows.size());
        assertEquals("go-live", rows.get(0).currentStep());
    }

    @Test
    void completedStampsCompletedAt() {
        authenticate("tut-complete@test.com");
        tutorialProgressService.upsertForCurrentUser("first-game", body("in_progress", "finish", null));

        TutorialProgressResponse done = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("completed", "finish", null));

        assertEquals("completed", done.status());
        assertNotNull(done.completedAt());
    }

    @Test
    void restartResetsStartedAtAndClearsCompletedAt() throws Exception {
        authenticate("tut-restart@test.com");
        TutorialProgressResponse first = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "orient", null));
        tutorialProgressService.upsertForCurrentUser("first-game", body("completed", "finish", null));

        Thread.sleep(5);
        TutorialProgressResponse restarted = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", null, null));

        assertEquals("in_progress", restarted.status());
        assertNull(restarted.currentStep());
        assertNull(restarted.completedAt());
        assertTrue(restarted.startedAt().isAfter(first.startedAt()),
                "restart must reset startedAt, was " + restarted.startedAt() + " vs " + first.startedAt());
    }

    @Test
    void advancingAnExistingRunKeepsTheOriginalStartedAt() {
        authenticate("tut-keep-start@test.com");
        TutorialProgressResponse first = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "orient", null));

        TutorialProgressResponse later = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "go-live", null));

        assertEquals(first.startedAt(), later.startedAt());
    }

    @Test
    void skippedIsStoredAndCarriesNoCompletionTime() {
        authenticate("tut-skip@test.com");

        TutorialProgressResponse skipped = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("skipped", null, null));

        assertEquals("skipped", skipped.status());
        assertNull(skipped.completedAt());
    }

    @Test
    void gameIdIsRoundTripped() {
        User operator = authenticate("tut-game@test.com");
        UUID gameId = createGame(operator, "Tutorial Game", com.prayer.pointfinder.entity.GameStatus.setup).getId();

        TutorialProgressResponse row = tutorialProgressService.upsertForCurrentUser(
                "fixed-route", body("in_progress", "arrange", gameId));

        assertEquals(gameId, row.gameId());
        assertEquals(gameId, tutorialProgressService.listForCurrentUser().get(0).gameId());
    }

    @Test
    void unknownScenarioIsRejected() {
        authenticate("tut-unknown-scenario@test.com");

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> tutorialProgressService.upsertForCurrentUser("not-a-tutorial", body("in_progress", null, null)));

        assertEquals(ErrorCode.TUTORIAL_SCENARIO_UNKNOWN, ex.getErrorCode());
    }

    @Test
    void unknownStatusIsRejected() {
        authenticate("tut-unknown-status@test.com");

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> tutorialProgressService.upsertForCurrentUser("first-game", body("paused", null, null)));

        assertEquals(ErrorCode.TUTORIAL_STATUS_UNKNOWN, ex.getErrorCode());
    }

    @Test
    void everyKnownScenarioIsAccepted() {
        authenticate("tut-allowlist@test.com");

        for (String scenarioId : TutorialProgressService.KNOWN_SCENARIOS) {
            assertEquals(scenarioId,
                    tutorialProgressService.upsertForCurrentUser(scenarioId, body("in_progress", null, null))
                            .scenarioId());
        }
        assertEquals(3, tutorialProgressService.listForCurrentUser().size());
    }

    @Test
    void oneOperatorNeverSeesAnother() {
        authenticate("tut-isolation-a@test.com");
        tutorialProgressService.upsertForCurrentUser("first-game", body("completed", "finish", null));
        SecurityContextHolder.clearContext();

        authenticate("tut-isolation-b@test.com");

        assertEquals(List.of(), tutorialProgressService.listForCurrentUser());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.TutorialProgressServiceTest'
```

Expected: compilation failure — `cannot find symbol: class TutorialProgressService`.

- [ ] **Step 3: Add the error codes**

In `backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java`, replace the trailing

```java
    VARIABLE_REFERENCE_UNDEFINED,
}
```

with

```java
    VARIABLE_REFERENCE_UNDEFINED,

    // ── Tutorials ─────────────────────────────────────────────────────────
    /** The tutorial scenario id is not on the server-side allowlist. Details carry {@code scenarioId}. */
    TUTORIAL_SCENARIO_UNKNOWN,
    /** The tutorial status is not one of {@code in_progress|completed|skipped}. Details carry {@code status}. */
    TUTORIAL_STATUS_UNKNOWN,
}
```

- [ ] **Step 4: Write the DTOs**

Create `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateTutorialProgressRequest.java`:

```java
package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/**
 * Upsert body for {@code PUT /api/users/me/tutorials/{scenarioId}}.
 *
 * <p>{@code status} is lowercase on the wire: {@code in_progress|completed|skipped}.
 * {@code currentStep} may be null; {@code in_progress} with a null step means
 * "restart this scenario". {@code gameId} binds a {@code setup-game} scenario to
 * the game it runs on so Resume can return to it.
 */
@Data
public class UpdateTutorialProgressRequest {

    @NotNull
    private String status;

    private String currentStep;

    private UUID gameId;
}
```

Create `backend/src/main/java/com/prayer/pointfinder/dto/response/TutorialProgressResponse.java`:

```java
package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record TutorialProgressResponse(
    String scenarioId,
    String status,
    String currentStep,
    UUID gameId,
    Instant startedAt,
    Instant completedAt
) {}
```

- [ ] **Step 5: Write the service**

Create `backend/src/main/java/com/prayer/pointfinder/service/TutorialProgressService.java`:

```java
package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateTutorialProgressRequest;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.entity.TutorialStatus;
import com.prayer.pointfinder.entity.UserTutorialProgress;
import com.prayer.pointfinder.entity.UserTutorialProgressId;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Per-account tutorial progress.
 *
 * <p>Deliberately unaudited: this is UI preference, not domain state. It never
 * touches a game, a team, or a score, so it carries no activity event.
 *
 * <p>Scenario ids are validated against a server-side allowlist rather than a
 * free-text column so a stale client can never fill the table with junk rows
 * that the library page would then have to filter out.
 */
@Service
@RequiredArgsConstructor
public class TutorialProgressService {

    /** Scenario ids the client may report progress for. Grows with each new scenario file. */
    public static final Set<String> KNOWN_SCENARIOS = Set.of("first-game", "fixed-route", "exploration");

    private final UserTutorialProgressRepository progressRepository;

    @Transactional(readOnly = true)
    public List<TutorialProgressResponse> listForCurrentUser() {
        UUID userId = SecurityUtils.getCurrentUser().getId();
        return progressRepository.findAllByIdUserId(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public TutorialProgressResponse upsertForCurrentUser(
            String scenarioId,
            UpdateTutorialProgressRequest request
    ) {
        if (scenarioId == null || !KNOWN_SCENARIOS.contains(scenarioId)) {
            throw new BadRequestException(
                    "Unknown tutorial scenario: " + scenarioId,
                    ErrorCode.TUTORIAL_SCENARIO_UNKNOWN,
                    Map.of("scenarioId", String.valueOf(scenarioId)));
        }

        TutorialStatus status = TutorialStatus.fromWire(request.getStatus());
        if (status == null) {
            throw new BadRequestException(
                    "Unknown tutorial status: " + request.getStatus(),
                    ErrorCode.TUTORIAL_STATUS_UNKNOWN,
                    Map.of("status", String.valueOf(request.getStatus())));
        }

        UUID userId = SecurityUtils.getCurrentUser().getId();
        UserTutorialProgressId id = new UserTutorialProgressId(userId, scenarioId);
        Instant now = Instant.now();

        UserTutorialProgress row = progressRepository.findById(id).orElse(null);
        if (row == null) {
            row = UserTutorialProgress.builder().id(id).startedAt(now).build();
        } else if (status == TutorialStatus.IN_PROGRESS && request.getCurrentStep() == null) {
            // Restart: the library's Restart button, expressed without a DELETE endpoint.
            row.setStartedAt(now);
        }

        row.setStatus(status);
        row.setCurrentStep(request.getCurrentStep());
        row.setGameId(request.getGameId());
        row.setCompletedAt(status == TutorialStatus.COMPLETED ? now : null);
        row.setUpdatedAt(now);

        return toResponse(progressRepository.save(row));
    }

    private TutorialProgressResponse toResponse(UserTutorialProgress row) {
        return new TutorialProgressResponse(
                row.getId().getScenarioId(),
                row.getStatus().wireName(),
                row.getCurrentStep(),
                row.getGameId(),
                row.getStartedAt(),
                row.getCompletedAt());
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.TutorialProgressServiceTest'
```

Expected: `BUILD SUCCESSFUL`, 12 tests passing.

- [ ] **Step 7: Stage**

```bash
git add backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java \
        backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateTutorialProgressRequest.java \
        backend/src/main/java/com/prayer/pointfinder/dto/response/TutorialProgressResponse.java \
        backend/src/main/java/com/prayer/pointfinder/service/TutorialProgressService.java \
        backend/src/test/java/com/prayer/pointfinder/service/TutorialProgressServiceTest.java
```

---

### Task 3: `TutorialProgressController`, endpoint tests and backend docs

**Files:**
- Create: `backend/src/main/java/com/prayer/pointfinder/controller/TutorialProgressController.java`
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/TutorialProgressEndpointTest.java`
- Modify: `docs/api-reference.md` (§15 "Users & Invites" — `Users` table and payload block)
- Modify: `docs/business-logic.md` (Table of Contents plus a new `## 9. Operator Onboarding and Tutorials` before `## Appendix: Platform Implementation Matrix`)

**Interfaces:**
- Consumes `TutorialProgressService` (Task 2).
- Produces `GET /api/users/me/tutorials` → `200 List<TutorialProgressResponse>`.
- Produces `PUT /api/users/me/tutorials/{scenarioId}` → `200 TutorialProgressResponse`,
  `400` for an unknown scenario or status, `401` unauthenticated.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/integration/TutorialProgressEndpointTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The two tutorial-progress endpoints end to end: create, read back, complete,
 * restart, reject unknown ids, isolate operators, and refuse anonymous callers.
 */
class TutorialProgressEndpointTest extends IntegrationTestBase {

    private static final String PATH = "/api/users/me/tutorials";

    @Autowired
    private UserTutorialProgressRepository progressRepository;

    @BeforeEach
    void clearProgress() {
        progressRepository.deleteAll();
    }

    private static final ParameterizedTypeReference<List<TutorialProgressResponse>> LIST_TYPE =
            new ParameterizedTypeReference<>() {};

    private ResponseEntity<List<TutorialProgressResponse>> list(User user) {
        return restTemplate.exchange(
                PATH,
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(user))),
                LIST_TYPE);
    }

    private ResponseEntity<TutorialProgressResponse> put(User user, String scenarioId, Map<String, Object> body) {
        return restTemplate.exchange(
                PATH + "/" + scenarioId,
                HttpMethod.PUT,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))),
                TutorialProgressResponse.class);
    }

    @Test
    void listStartsEmptyThenReflectsAnUpsert() {
        User operator = createOperator("endpoint-list@test.com", "password");

        ResponseEntity<List<TutorialProgressResponse>> empty = list(operator);
        assertEquals(HttpStatus.OK, empty.getStatusCode());
        assertNotNull(empty.getBody());
        assertTrue(empty.getBody().isEmpty());

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("status", "in_progress");
        body.put("currentStep", "place-base");
        body.put("gameId", null);

        ResponseEntity<TutorialProgressResponse> created = put(operator, "first-game", body);
        assertEquals(HttpStatus.OK, created.getStatusCode());
        assertNotNull(created.getBody());
        assertEquals("first-game", created.getBody().scenarioId());
        assertEquals("in_progress", created.getBody().status());

        ResponseEntity<List<TutorialProgressResponse>> after = list(operator);
        assertEquals(1, after.getBody().size());
        assertEquals("place-base", after.getBody().get(0).currentStep());
    }

    @Test
    void completedSetsCompletedAtAndRestartClearsIt() {
        User operator = createOperator("endpoint-cycle@test.com", "password");

        Map<String, Object> done = new java.util.HashMap<>();
        done.put("status", "completed");
        done.put("currentStep", "finish");
        done.put("gameId", null);
        ResponseEntity<TutorialProgressResponse> completed = put(operator, "first-game", done);
        assertEquals(HttpStatus.OK, completed.getStatusCode());
        assertNotNull(completed.getBody().completedAt());

        Map<String, Object> restart = new java.util.HashMap<>();
        restart.put("status", "in_progress");
        restart.put("currentStep", null);
        restart.put("gameId", null);
        ResponseEntity<TutorialProgressResponse> restarted = put(operator, "first-game", restart);
        assertEquals(HttpStatus.OK, restarted.getStatusCode());
        assertNull(restarted.getBody().completedAt());
        assertNull(restarted.getBody().currentStep());
        assertEquals("in_progress", restarted.getBody().status());
    }

    @Test
    void unknownScenarioIsRejectedWith400() {
        User operator = createOperator("endpoint-unknown@test.com", "password");

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("status", "in_progress");
        body.put("currentStep", null);

        ResponseEntity<String> response = restTemplate.exchange(
                PATH + "/not-a-tutorial",
                HttpMethod.PUT,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(operator))),
                String.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(response.getBody().contains("TUTORIAL_SCENARIO_UNKNOWN"), response.getBody());
    }

    @Test
    void unknownStatusIsRejectedWith400() {
        User operator = createOperator("endpoint-bad-status@test.com", "password");

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("status", "paused");
        body.put("currentStep", null);

        ResponseEntity<String> response = restTemplate.exchange(
                PATH + "/first-game",
                HttpMethod.PUT,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(operator))),
                String.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(response.getBody().contains("TUTORIAL_STATUS_UNKNOWN"), response.getBody());
    }

    @Test
    void oneOperatorCannotSeeAnothersRows() {
        User a = createOperator("endpoint-iso-a@test.com", "password");
        User b = createOperator("endpoint-iso-b@test.com", "password");

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("status", "completed");
        body.put("currentStep", "finish");
        put(a, "first-game", body);

        assertEquals(1, list(a).getBody().size());
        assertTrue(list(b).getBody().isEmpty());
    }

    @Test
    void anonymousCallersAreRefused() {
        ResponseEntity<String> response = restTemplate.exchange(
                PATH, HttpMethod.GET, new HttpEntity<>(null, null), String.class);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.TutorialProgressEndpointTest'
```

Expected: `listStartsEmptyThenReflectsAnUpsert` fails — `GET /api/users/me/tutorials` returns 404
because no controller maps that path.

- [ ] **Step 3: Write the controller**

Create `backend/src/main/java/com/prayer/pointfinder/controller/TutorialProgressController.java`:

```java
package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.UpdateTutorialProgressRequest;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.service.TutorialProgressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Guided-tutorial progress for the calling operator.
 *
 * <p>Role is enforced by {@code SecurityConfig}: {@code /api/users/**} already
 * requires {@code ROLE_ADMIN} or {@code ROLE_OPERATOR}, exactly like
 * {@link UserController}. There is no DELETE — restarting a tutorial is a PUT
 * with {@code status: in_progress} and {@code currentStep: null}.
 */
@RestController
@RequestMapping("/api/users/me/tutorials")
@RequiredArgsConstructor
public class TutorialProgressController {

    private final TutorialProgressService tutorialProgressService;

    @GetMapping
    public ResponseEntity<List<TutorialProgressResponse>> listCurrentUserProgress() {
        return ResponseEntity.ok(tutorialProgressService.listForCurrentUser());
    }

    @PutMapping("/{scenarioId}")
    public ResponseEntity<TutorialProgressResponse> updateCurrentUserProgress(
            @PathVariable String scenarioId,
            @Valid @RequestBody UpdateTutorialProgressRequest request
    ) {
        return ResponseEntity.ok(tutorialProgressService.upsertForCurrentUser(scenarioId, request));
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.TutorialProgressEndpointTest'
```

Expected: `BUILD SUCCESSFUL`, 6 tests passing.

- [ ] **Step 5: Document the endpoints in `docs/api-reference.md`**

In `docs/api-reference.md` §15 "Users & Invites", replace the `Users` table

```markdown
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | Admin only | List all users |
| GET | `/users/me` | Operator | Get current authenticated user |
| PUT | `/users/me/push-token` | Operator | Register operator push token |
```

with

```markdown
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | Admin only | List all users |
| GET | `/users/me` | Operator | Get current authenticated user |
| PUT | `/users/me/push-token` | Operator | Register operator push token |
| GET | `/users/me/tutorials` | Operator | List the caller's guided-tutorial progress |
| PUT | `/users/me/tutorials/:scenarioId` | Operator | Upsert progress for one tutorial scenario |
```

and, immediately after the existing `**PUT /users/me/push-token**` block, insert:

````markdown
**GET /users/me/tutorials**

Returns one row per tutorial the operator has started, skipped, or completed.
A scenario with no row has never been started. Progress is per account, so it
follows the operator across the browser and the Tauri shell.

```json
[
  {
    "scenarioId": "first-game",
    "status": "in_progress",
    "currentStep": "go-live",
    "gameId": "8b0f1a2c-...",
    "startedAt": "2026-09-06T09:12:00Z",
    "completedAt": null
  }
]
```

**PUT /users/me/tutorials/:scenarioId** (UpdateTutorialProgressRequest)

```json
{ "status": "in_progress", "currentStep": "go-live", "gameId": "8b0f1a2c-..." }
```

| Field | Description |
|-------|-------------|
| `status` | `in_progress`, `completed`, or `skipped`. Required. |
| `currentStep` | The scenario step id the operator is on. Optional; `null` with `in_progress` **restarts** the scenario (resets `startedAt`, clears `completedAt`). |
| `gameId` | The game a `setup-game` scenario is bound to, so Resume returns to it. Optional. Nulled if that game is deleted. |

`scenarioId` must be one of `first-game`, `fixed-route`, `exploration`; anything
else returns `400 TUTORIAL_SCENARIO_UNKNOWN`. An unrecognised `status` returns
`400 TUTORIAL_STATUS_UNKNOWN`. Returns the stored row. Not audited — this is UI
preference, not domain state.
````

Then, in the "Error Codes (Machine-Readable)" section at the bottom of the file, append a new
subsection after the last existing one (`### Variable Error Codes`):

```markdown
### Tutorial Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `TUTORIAL_SCENARIO_UNKNOWN` | 400 | The scenario id is not on the server allowlist. Details carry `scenarioId`. |
| `TUTORIAL_STATUS_UNKNOWN` | 400 | The status is not `in_progress`, `completed`, or `skipped`. Details carry `status`. |
```

- [ ] **Step 6: Document the rule in `docs/business-logic.md`**

Phase 2 left a `### Onboarding: the guided first game` subsection at the end of section 1. Confirm
it, and confirm there is no top-level onboarding section yet:

```bash
grep -n "Onboarding" docs/business-logic.md
```

Expected: exactly one hit, `### Onboarding: the guided first game`, inside section 1.

**Cut** that whole subsection (heading and its four paragraphs) out of section 1 — including the
blank line that separated it from the `---` before `## 2. Check-In Methods` — and paste it as the
first subsection under the new `## 9.` heading below, renamed to `### The guided first game`. Then
add the Table-of-Contents line by replacing

```markdown
8. [Broadcast Mode](#8-broadcast-mode)
```

with

```markdown
8. [Broadcast Mode](#8-broadcast-mode)
9. [Operator Onboarding and Tutorials](#9-operator-onboarding-and-tutorials)
```

and insert this section immediately before the `## Appendix: Platform Implementation Matrix`
heading (with phase 2's moved subsection pasted in where marked):

```markdown
## 9. Operator Onboarding and Tutorials

Guided tutorials teach an operator by doing, on their own real game. The engine
never creates or changes anything: it spotlights the next control, explains what
it does, and waits for the operator's own action.

### The guided first game

<!-- the four paragraphs cut from section 1, verbatim -->

### Progress is per account, not per device

Progress lives in `user_tutorial_progress`, one row per `(operator, scenario)`.
No row means the operator has never started that scenario. A row carries the
status (`in_progress`, `completed`, `skipped`), the step id the operator is on,
and — for `setup-game` scenarios — the game the run is bound to.

Because progress is server-side, a reload, a second browser, or the Tauri shell
all resume the same run, and a completed tutorial stays completed everywhere.
The web client hydrates the map once on mount and writes every change back
debounced by 500 ms, flushing the last write on unmount and on logout.

### First-run rule

The dashboard shows the tutorial welcome card only when the personal workspace
has zero games **and** there is no progress row for `first-game`. "Skip for now"
writes a `skipped` row and hides the card permanently; the scenario stays
available from the tutorials library at `/tutorials`. The card is never shown in
an organization workspace.

### Restart, not delete

There is no delete endpoint. Restarting a tutorial is a PUT with
`status: in_progress` and `currentStep: null`, which resets `started_at` and
clears `completed_at`. Scenario ids are validated against a server-side
allowlist (`first-game`, `fixed-route`, `exploration`).

### Not audited

Tutorial progress is UI preference. It touches no game, team, submission, or
score, so it writes no activity event and never appears in the audit export.
```

Re-run `grep -n "Onboarding" docs/business-logic.md` afterwards: it must print the new
`## 9. Operator Onboarding and Tutorials` heading and its Table-of-Contents entry, and **no**
remaining onboarding heading inside section 1.

- [ ] **Step 7: Stage**

```bash
git add backend/src/main/java/com/prayer/pointfinder/controller/TutorialProgressController.java \
        backend/src/test/java/com/prayer/pointfinder/integration/TutorialProgressEndpointTest.java \
        docs/api-reference.md docs/business-logic.md
```

---

### Task 4: Web API client, query and mutation hooks, MSW handlers

**Files:**
- Create: `web/src/lib/api/tutorials.ts`
- Create: `web/src/lib/api/tutorials.test.ts`
- Create: `web/src/hooks/queries/useTutorialProgress.ts`
- Create: `web/src/hooks/mutations/useTutorialMutations.ts`
- Create: `web/src/hooks/queries/useTutorialProgress.test.tsx`
- Create: `web/src/test/msw/handlers/tutorials.ts`
- Modify: `web/src/test/msw/server.ts` (register `tutorialsHandlers`)

**Interfaces:**
- Consumes the endpoints from Task 3 and `TutorialProgress` (including its `gameId`, which phase 1
  already ships) from `web/src/features/tutorials/types.ts`.
- Produces `UpdateTutorialProgressDto { status: TutorialStatus; currentStep: string | null; gameId?: string | null }`.
- Produces `tutorialsApi.list() : Promise<TutorialProgress[]>` and
  `tutorialsApi.update(scenarioId, body) : Promise<TutorialProgress>`.
- Produces `useTutorialProgress(options?: { enabled?: boolean })` with query key `['tutorials','me']`.
- Produces `useUpdateTutorialProgress()` with mutation key `['tutorials','update']`, taking
  `{ scenarioId, status, currentStep, gameId? }`, invalidating `['tutorials','me']`.
- Produces `tutorialsHandlers` and the in-memory `tutorialProgressStore` test double
  (`reset()`, `rows()`, `puts()`).

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/api/tutorials.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { tutorialsApi } from './tutorials'

describe('tutorialsApi', () => {
  beforeEach(() => {
    tutorialProgressStore.reset()
  })

  it('lists an empty progress set for a fresh operator', async () => {
    await expect(tutorialsApi.list()).resolves.toEqual([])
  })

  it('upserts a row and returns it, then lists it back', async () => {
    const row = await tutorialsApi.update('first-game', {
      status: 'in_progress',
      currentStep: 'place-base',
    })

    expect(row.scenarioId).toBe('first-game')
    expect(row.status).toBe('in_progress')
    expect(row.currentStep).toBe('place-base')
    expect(row.completedAt).toBeNull()

    await expect(tutorialsApi.list()).resolves.toEqual([row])
  })

  it('sends currentStep and gameId explicitly, defaulting gameId to null', async () => {
    await tutorialsApi.update('first-game', { status: 'in_progress', currentStep: null })

    expect(tutorialProgressStore.puts()).toEqual([
      {
        scenarioId: 'first-game',
        body: { status: 'in_progress', currentStep: null, gameId: null },
      },
    ])
  })

  it('carries a gameId through for setup-game scenarios', async () => {
    const row = await tutorialsApi.update('fixed-route', {
      status: 'in_progress',
      currentStep: 'arrange',
      gameId: 'game-7',
    })

    expect(row.gameId).toBe('game-7')
  })

  it('stamps completedAt when the status is completed', async () => {
    const row = await tutorialsApi.update('first-game', { status: 'completed', currentStep: 'finish' })

    expect(row.status).toBe('completed')
    expect(row.completedAt).not.toBeNull()
  })

  it('rejects an unknown scenario id with the server error code', async () => {
    await expect(
      // @ts-expect-error deliberately outside ScenarioId to mimic a stale client
      tutorialsApi.update('not-a-tutorial', { status: 'in_progress', currentStep: null }),
    ).rejects.toMatchObject({ response: { status: 400 } })
  })
})
```

Create `web/src/hooks/queries/useTutorialProgress.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { useUpdateTutorialProgress } from '@/hooks/mutations/useTutorialMutations'
import { useTutorialProgress } from './useTutorialProgress'

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useTutorialProgress', () => {
  beforeEach(() => {
    tutorialProgressStore.reset()
  })

  it('loads the caller progress under the ["tutorials","me"] key', async () => {
    tutorialProgressStore.seed([
      {
        scenarioId: 'first-game',
        status: 'completed',
        currentStep: 'finish',
        gameId: null,
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: '2026-09-06T09:30:00.000Z',
      },
    ])
    const client = makeClient()

    const { result } = renderHook(() => useTutorialProgress(), { wrapper: wrapper(client) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(client.getQueryData(['tutorials', 'me'])).toHaveLength(1)
  })

  it('does not fetch when disabled', async () => {
    const client = makeClient()

    const { result } = renderHook(() => useTutorialProgress({ enabled: false }), {
      wrapper: wrapper(client),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(tutorialProgressStore.puts()).toEqual([])
  })
})

describe('useUpdateTutorialProgress', () => {
  beforeEach(() => {
    tutorialProgressStore.reset()
  })

  it('writes the row and invalidates the progress query', async () => {
    const client = makeClient()
    const list = renderHook(() => useTutorialProgress(), { wrapper: wrapper(client) })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    expect(list.result.current.data).toEqual([])

    const mutation = renderHook(() => useUpdateTutorialProgress(), { wrapper: wrapper(client) })
    await mutation.result.current.mutateAsync({
      scenarioId: 'first-game',
      status: 'skipped',
      currentStep: null,
    })

    await waitFor(() => expect(list.result.current.data).toHaveLength(1))
    expect(list.result.current.data?.[0].status).toBe('skipped')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```
bun run --cwd web test -- src/lib/api/tutorials.test.ts src/hooks/queries/useTutorialProgress.test.tsx
```

Expected: FAIL — `Failed to resolve import "@/test/msw/handlers/tutorials"`.

- [ ] **Step 3: Confirm the client type already carries `gameId`**

Nothing to write. `TutorialProgress.gameId: string | null` is phase 1's, because the store's
`complete()` and `skip()` build that row and cannot omit a required field. Confirm it:

```
grep -n "gameId" web/src/features/tutorials/types.ts
```

Expected: the field is present on `TutorialProgress` (and on `TourState`). If it is missing,
phase 1 was not merged as planned — add it there rather than patching it in here, so `complete()`
and `skip()` keep type-checking.

```
bun run --cwd web typecheck
```

Expected: clean before Step 4.

- [ ] **Step 4: Write the API client**

Create `web/src/lib/api/tutorials.ts`:

```ts
import type { ScenarioId, TutorialProgress, TutorialStatus } from '@/features/tutorials/types'
import apiClient from './client'

export interface UpdateTutorialProgressDto {
  status: TutorialStatus
  /** Scenario step id. `null` together with `in_progress` restarts the scenario. */
  currentStep: string | null
  /** Game a `setup-game` scenario is bound to. Omitted means "clear it". */
  gameId?: string | null
}

export const tutorialsApi = {
  list: async (): Promise<TutorialProgress[]> => {
    const { data } = await apiClient.get('/users/me/tutorials')
    return data
  },

  /**
   * Upsert one scenario's progress. The body is always sent whole — the server
   * replaces the row rather than merging — so an omitted `gameId` clears the
   * binding instead of silently keeping a stale one.
   */
  update: async (
    scenarioId: ScenarioId,
    body: UpdateTutorialProgressDto,
  ): Promise<TutorialProgress> => {
    const { data } = await apiClient.put(`/users/me/tutorials/${scenarioId}`, {
      status: body.status,
      currentStep: body.currentStep,
      gameId: body.gameId ?? null,
    })
    return data
  },
}
```

- [ ] **Step 5: Write the hooks**

Create `web/src/hooks/queries/useTutorialProgress.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import type { TutorialProgress } from '@/features/tutorials/types'

/**
 * The caller's guided-tutorial progress.
 *
 * `enabled` exists so `TourHost` can hold the request back until the operator
 * session is known; players and anonymous visitors must never call it.
 */
export function useTutorialProgress(options?: { enabled?: boolean }) {
  return useQuery<TutorialProgress[]>({
    queryKey: ['tutorials', 'me'],
    queryFn: () => tutorialsApi.list(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  })
}
```

Create `web/src/hooks/mutations/useTutorialMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import type { UpdateTutorialProgressDto } from '@/lib/api/tutorials'
import type { ScenarioId } from '@/features/tutorials/types'

export type UpdateTutorialProgressVariables = UpdateTutorialProgressDto & {
  scenarioId: ScenarioId
}

/**
 * Explicit progress writes (the library's Restart button). The debounced
 * write-through in `features/tutorials/progressSync.ts` calls `tutorialsApi`
 * directly instead, because it must be able to flush outside React's lifecycle.
 */
export function useUpdateTutorialProgress() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['tutorials', 'update'],
    mutationFn: ({ scenarioId, ...body }: UpdateTutorialProgressVariables) =>
      tutorialsApi.update(scenarioId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tutorials', 'me'] })
    },
  })
}
```

- [ ] **Step 6: Write the MSW handlers and register them**

Create `web/src/test/msw/handlers/tutorials.ts`:

```ts
import { http, HttpResponse } from 'msw'
import type { TutorialProgress, TutorialStatus } from '@/features/tutorials/types'

const KNOWN_SCENARIOS = ['first-game', 'fixed-route', 'exploration']
const KNOWN_STATUSES: TutorialStatus[] = ['in_progress', 'completed', 'skipped']

interface RecordedPut {
  scenarioId: string
  body: { status: string; currentStep: string | null; gameId: string | null }
}

let rows: TutorialProgress[] = []
let puts: RecordedPut[] = []

/**
 * In-memory stand-in for `user_tutorial_progress`, shaped so tests can both
 * seed a starting state and assert exactly which writes went out.
 */
export const tutorialProgressStore = {
  reset(): void {
    rows = []
    puts = []
  },
  seed(next: TutorialProgress[]): void {
    rows = next.map((row) => ({ ...row }))
  },
  rows(): TutorialProgress[] {
    return rows.map((row) => ({ ...row }))
  },
  puts(): RecordedPut[] {
    return puts.map((entry) => ({ ...entry, body: { ...entry.body } }))
  },
}

export const tutorialsHandlers = [
  http.get('/api/users/me/tutorials', () => HttpResponse.json(tutorialProgressStore.rows())),

  http.put('/api/users/me/tutorials/:scenarioId', async ({ params, request }) => {
    const scenarioId = params.scenarioId as string
    const body = (await request.json()) as {
      status?: string
      currentStep?: string | null
      gameId?: string | null
    }

    puts.push({
      scenarioId,
      body: {
        status: body.status ?? '',
        currentStep: body.currentStep ?? null,
        gameId: body.gameId ?? null,
      },
    })

    if (!KNOWN_SCENARIOS.includes(scenarioId)) {
      return HttpResponse.json(
        { message: 'Unknown tutorial scenario', code: 'TUTORIAL_SCENARIO_UNKNOWN' },
        { status: 400 },
      )
    }
    if (!KNOWN_STATUSES.includes(body.status as TutorialStatus)) {
      return HttpResponse.json(
        { message: 'Unknown tutorial status', code: 'TUTORIAL_STATUS_UNKNOWN' },
        { status: 400 },
      )
    }

    const status = body.status as TutorialStatus
    const now = new Date().toISOString()
    const existing = rows.find((row) => row.scenarioId === scenarioId)
    const restarting = status === 'in_progress' && (body.currentStep ?? null) === null

    const next: TutorialProgress = {
      scenarioId: scenarioId as TutorialProgress['scenarioId'],
      status,
      currentStep: body.currentStep ?? null,
      gameId: body.gameId ?? null,
      startedAt: existing && !restarting ? existing.startedAt : now,
      completedAt: status === 'completed' ? now : null,
    }

    rows = existing
      ? rows.map((row) => (row.scenarioId === scenarioId ? next : row))
      : [...rows, next]

    return HttpResponse.json(next)
  }),
]
```

In `web/src/test/msw/server.ts`, add the import after the `notificationsHandlers` import:

```ts
import { tutorialsHandlers } from './handlers/tutorials'
```

and add `...tutorialsHandlers,` as the last spread inside `setupServer(...)`.

- [ ] **Step 7: Run the tests to verify they pass**

```
bun run --cwd web test -- src/lib/api/tutorials.test.ts src/hooks/queries/useTutorialProgress.test.tsx
```

Expected: PASS — 8 tests across 2 files.

- [ ] **Step 8: Stage**

```bash
git add web/src/lib/api/tutorials.ts web/src/lib/api/tutorials.test.ts \
        web/src/hooks/queries/useTutorialProgress.ts web/src/hooks/queries/useTutorialProgress.test.tsx \
        web/src/hooks/mutations/useTutorialMutations.ts \
        web/src/test/msw/handlers/tutorials.ts web/src/test/msw/server.ts
```

---

### Task 5: `progressSync.ts` and the `TourHost` wiring

**Files:**
- Create: `web/src/features/tutorials/progressSync.ts`
- Create: `web/src/features/tutorials/progressSync.test.tsx`
- Modify: `web/src/features/tutorials/TourHost.tsx` (mount hydration and write-through)

The store is **not** touched in this task. Phase 1 already gives it everything this needs:
`currentStepId` as the run's position, `start(id, { gameId, stepId })` for Resume, and
`complete()` / `skip()` as the only two places a `TutorialProgress` row is built. There is no
`resumeAt`, no `pendingResumeStepId`, and no hand-written "finish" effect anywhere — the
write-through simply observes `progress` and sends what it finds.

**Interfaces:**
- Consumes `tutorialsApi`, `useTutorialProgress` (Task 4), `useTourStore` (phase 1).
- Produces `useProgressHydration() : { isLoading: boolean; isError: boolean; refetch: () => void }`.
- Produces `useProgressWriteThrough() : void` — no argument: the live step id is
  `useTourStore`'s own `currentStepId`.
- Produces `markProgressSynced(rows: TutorialProgress[]) : void` and
  `resetProgressSync() : void` (module-level sync bookkeeping; `resetProgressSync` is also the
  test hook).
- Produces `PROGRESS_WRITE_DEBOUNCE_MS = 500`.

**Write-through rules (implemented exactly):**

1. The hook watches `useTourStore`. Every change produces a desired server row per scenario:
   every entry of `progress`, plus — for the active scenario — an override of
   `{ status: 'in_progress', currentStep: state.currentStepId, gameId: state.gameId }`.
   The store cannot compute the effective step list, so `currentStepId` is written as it stands.
   It is `null` only in the instant between `start()` and `TourRunner`'s first render, which
   resolves the position and writes a real id; the 500 ms debounce means the server virtually
   never sees the null, and `{ in_progress, currentStep: null }` is in any case exactly the
   "start from the beginning" shape the server already understands.
2. A desired row is written only when its `status|currentStep|gameId` differs from the last value
   this module knows the **server** has. Rows arriving from hydration are recorded as
   already-synced (`markProgressSynced`), so hydration never echoes back.
3. Writes are coalesced per scenario and flushed 500 ms after the last change.
4. A row is recorded as synced **only when its PUT resolves**. Recording it at scheduling time
   would mean one dropped request silently loses the operator's position for the rest of the
   session: the module would believe the server already agreed and never send that value again.
   On failure the scenario's entry is dropped, so the next change retries.
5. `flush()` runs on unmount and on the authenticated → unauthenticated transition. The logout
   flush is forced (it does not re-check authentication) and is best effort: the session may
   already be gone, and the operator has no other copy of the progress, so trying and losing is
   strictly better than not trying. After the logout flush the module's bookkeeping is cleared and
   `useTourStore.reset()` runs, so the next operator never inherits a run.
6. Nothing is written while the auth store says the visitor is not authenticated.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/tutorials/progressSync.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { useAuthStore } from '@/lib/auth/store'
import { useTourStore } from './store'
import {
  PROGRESS_WRITE_DEBOUNCE_MS,
  resetProgressSync,
  useProgressHydration,
  useProgressWriteThrough,
} from './progressSync'
import type { TutorialProgress } from './types'

const OPERATOR = {
  id: 'user-1',
  email: 'op@test.com',
  name: 'Op',
  role: 'operator' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function row(overrides: Partial<TutorialProgress> = {}): TutorialProgress {
  return {
    scenarioId: 'first-game',
    status: 'in_progress',
    currentStep: 'orient',
    gameId: null,
    startedAt: '2026-09-06T09:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

/** The write-through reads the live step id off the store, so the harness takes no props. */
function Harness() {
  useProgressHydration()
  useProgressWriteThrough()
  return null
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
}

describe('tutorial progress sync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    tutorialProgressStore.reset()
    resetProgressSync()
    useTourStore.getState().reset()
    useAuthStore.setState({ user: OPERATOR, isAuthenticated: true, accessToken: 'token' })
  })

  afterEach(() => {
    vi.useRealTimers()
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null })
  })

  it('hydrates the store progress map from the server', async () => {
    tutorialProgressStore.seed([row({ status: 'completed', completedAt: '2026-09-06T10:00:00.000Z' })])

    renderHarness()

    await waitFor(() => {
      expect(useTourStore.getState().progress['first-game']?.status).toBe('completed')
    })
  })

  it('never echoes a hydrated row back to the server', async () => {
    tutorialProgressStore.seed([row()])

    renderHarness()

    await waitFor(() => expect(useTourStore.getState().progress['first-game']).toBeDefined())
    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS * 2)

    expect(tutorialProgressStore.puts()).toEqual([])
  })

  it('debounces a run of step changes into a single write', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game')
    useTourStore.getState().setCurrentStep('orient')
    useTourStore.getState().setCurrentStep('place-base')
    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS - 50)
    expect(tutorialProgressStore.puts()).toEqual([])

    await vi.advanceTimersByTimeAsync(100)
    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0]).toEqual({
      scenarioId: 'first-game',
      body: { status: 'in_progress', currentStep: 'place-base', gameId: null },
    })

    view.unmount()
  })

  it('flushes the pending write on unmount', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game')
    useTourStore.getState().setCurrentStep('go-live')
    view.unmount()

    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0].body.currentStep).toBe('go-live')
  })

  it('writes completed when the run finishes', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    // Exactly what `TourRunner` does when `advance` returns null: no hand-built row.
    useTourStore.getState().start('first-game', { gameId: 'game-3' })
    useTourStore.getState().setCurrentStep('finish')
    useTourStore.getState().markStepCompleted('finish', Date.now())
    useTourStore.getState().complete()

    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS + 50)
    await waitFor(() => expect(tutorialProgressStore.rows()).toHaveLength(1))
    expect(tutorialProgressStore.rows()[0].status).toBe('completed')
    expect(tutorialProgressStore.rows()[0].currentStep).toBe('finish')
    expect(tutorialProgressStore.rows()[0].gameId).toBe('game-3')

    view.unmount()
  })

  it('writes skipped when the welcome card skips the scenario', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().skip('first-game')

    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS + 50)
    await waitFor(() => expect(tutorialProgressStore.rows()).toHaveLength(1))
    expect(tutorialProgressStore.rows()[0].status).toBe('skipped')

    view.unmount()
  })

  it('carries the bound game id and the resume step for a setup-game run', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('fixed-route', { gameId: 'game-9', stepId: 'arrange' })

    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS + 50)
    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0].body).toEqual({
      status: 'in_progress',
      currentStep: 'arrange',
      gameId: 'game-9',
    })

    view.unmount()
  })

  it('retries after a failed write instead of assuming the server agreed', async () => {
    let attempts = 0
    server.use(
      http.put('/api/users/me/tutorials/:scenarioId', () => {
        attempts += 1
        return attempts === 1
          ? HttpResponse.json({ message: 'boom' }, { status: 500 })
          : HttpResponse.json(row({ currentStep: 'place-base' }))
      }),
    )
    const view = renderHarness()

    useTourStore.getState().start('first-game')
    useTourStore.getState().setCurrentStep('orient')
    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS + 50)
    await waitFor(() => expect(attempts).toBe(1))

    // A module that recorded the row as synced when it *sent* it would now believe
    // the server holds `place-base` and never send it again.
    useTourStore.getState().setCurrentStep('place-base')
    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS + 50)
    await waitFor(() => expect(attempts).toBe(2))

    view.unmount()
  })

  it('writes nothing while the visitor is not authenticated', async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null })
    const view = renderHarness()

    useTourStore.getState().start('first-game')
    useTourStore.getState().setCurrentStep('orient')
    await vi.advanceTimersByTimeAsync(PROGRESS_WRITE_DEBOUNCE_MS + 50)

    expect(tutorialProgressStore.puts()).toEqual([])
    view.unmount()
  })

  it('flushes on logout and resets the tour store', async () => {
    const view = renderHarness()
    await waitFor(() => expect(tutorialProgressStore.rows()).toEqual([]))

    useTourStore.getState().start('first-game')
    useTourStore.getState().setCurrentStep('go-live')
    useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null })

    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(useTourStore.getState().activeScenario).toBeNull()

    view.unmount()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```
bun run --cwd web test -- src/features/tutorials/progressSync.test.tsx
```

Expected: FAIL — `Failed to resolve import "./progressSync"`.

- [ ] **Step 3: Write `progressSync.ts`**

Create `web/src/features/tutorials/progressSync.ts`:

```ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tutorialsApi } from '@/lib/api/tutorials'
import { useTutorialProgress } from '@/hooks/queries/useTutorialProgress'
import { useAuthStore } from '@/lib/auth/store'
import { useTourStore } from './store'
import type { ScenarioId, TutorialProgress, TutorialStatus } from './types'

/** Step churn is noisy; one write per half-second is plenty for a UI preference. */
export const PROGRESS_WRITE_DEBOUNCE_MS = 500

interface PendingWrite {
  scenarioId: ScenarioId
  status: TutorialStatus
  currentStep: string | null
  gameId: string | null
}

/**
 * What this module believes the **server** already holds, keyed by scenario id.
 * Only a successful PUT or a hydration response writes here. Module-level rather
 * than per-hook because hydration and write-through are two hooks that must agree,
 * and exactly one `TourHost` is ever mounted.
 */
const syncedRows = new Map<string, string>()

function rowKey(write: PendingWrite): string {
  return `${write.status}|${write.currentStep ?? ''}|${write.gameId ?? ''}`
}

/** Record rows that came from the server so they are never written back. */
export function markProgressSynced(rows: TutorialProgress[]): void {
  for (const row of rows) {
    syncedRows.set(
      row.scenarioId,
      rowKey({
        scenarioId: row.scenarioId,
        status: row.status,
        currentStep: row.currentStep,
        gameId: row.gameId ?? null,
      }),
    )
  }
}

/** Forget everything this module knows. Used on logout and by tests. */
export function resetProgressSync(): void {
  syncedRows.clear()
}

type TourStoreSnapshot = ReturnType<typeof useTourStore.getState>

function desiredWrites(state: TourStoreSnapshot): PendingWrite[] {
  const byScenario = new Map<string, PendingWrite>()

  for (const [scenarioId, row] of Object.entries(state.progress)) {
    if (!row) continue
    byScenario.set(scenarioId, {
      scenarioId: scenarioId as ScenarioId,
      status: row.status,
      currentStep: row.currentStep,
      gameId: row.gameId ?? null,
    })
  }

  // A live run always describes the truth better than the hydrated row does.
  // `currentStepId` is null only until `TourRunner`'s first render resolves the
  // position, and `{ in_progress, null }` is the server's "start from the top" row.
  const active = state.activeScenario
  if (active) {
    byScenario.set(active, {
      scenarioId: active,
      status: 'in_progress',
      currentStep: state.currentStepId,
      gameId: state.gameId,
    })
  }

  return Array.from(byScenario.values())
}

/**
 * Fill `useTourStore.progress` from the server once the operator is known.
 * Mounted by `TourHost`; players and anonymous visitors never reach it.
 */
export function useProgressHydration(): {
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const role = useAuthStore((s) => s.user?.role)
  const setProgress = useTourStore((s) => s.setProgress)

  const enabled = isAuthenticated && (role === 'operator' || role === 'admin')
  const query = useTutorialProgress({ enabled })

  useEffect(() => {
    if (!query.data) return
    // Order matters: mark first so the write-through subscription that fires
    // from setProgress already sees these rows as server-known.
    markProgressSynced(query.data)
    setProgress(query.data)
  }, [query.data, setProgress])

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

/**
 * Write every meaningful tour-store change back to the server, debounced.
 *
 * The live step id comes straight off the store (`currentStepId`), so this hook
 * takes no arguments and `TourHost` passes nothing down.
 */
export function useProgressWriteThrough(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const pending = new Map<string, PendingWrite>()
    let timer: ReturnType<typeof setTimeout> | null = null

    const flush = (force = false) => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (pending.size === 0) return
      const writes = Array.from(pending.values())
      pending.clear()
      // Best effort on logout: the session may already be gone, but the
      // operator holds no other copy of this progress.
      if (!force && !useAuthStore.getState().isAuthenticated) return
      for (const write of writes) {
        const key = rowKey(write)
        void tutorialsApi
          .update(write.scenarioId, {
            status: write.status,
            currentStep: write.currentStep,
            gameId: write.gameId,
          })
          .then(() => {
            // Only now does the server actually hold this value.
            syncedRows.set(write.scenarioId, key)
            void queryClient.invalidateQueries({ queryKey: ['tutorials', 'me'] })
          })
          .catch(() => {
            // A dropped preference write is not worth a toast, but it must not be
            // remembered as synced: forget the scenario so the next change resends.
            // Writes for one scenario are serialised by the debounce, so this cannot
            // discard a newer success — at worst it costs one redundant PUT.
            syncedRows.delete(write.scenarioId)
          })
      }
    }

    const evaluate = (state: TourStoreSnapshot) => {
      if (!useAuthStore.getState().isAuthenticated) return
      let changed = false
      for (const write of desiredWrites(state)) {
        if (syncedRows.get(write.scenarioId) === rowKey(write)) continue
        pending.set(write.scenarioId, write)
        changed = true
      }
      if (!changed) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => flush(), PROGRESS_WRITE_DEBOUNCE_MS)
    }

    const unsubscribeTour = useTourStore.subscribe(evaluate)

    const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
      if (previous.isAuthenticated && !state.isAuthenticated) {
        flush(true)
        resetProgressSync()
        useTourStore.getState().reset()
      }
    })

    return () => {
      flush()
      unsubscribeTour()
      unsubscribeAuth()
    }
  }, [queryClient])
}
```

- [ ] **Step 4: Run the test to verify it passes**

```
bun run --cwd web test -- src/features/tutorials/progressSync.test.tsx
```

Expected: PASS — 10 tests.

- [ ] **Step 5: Wire `TourHost`**

`web/src/features/tutorials/TourHost.tsx` is split by phase 1 into `TourHost` (always mounted,
renders `null` when no scenario is running) and `TourRunner` (mounted only while a scenario runs).
Both sync hooks live in `TourHost`: the welcome card's Skip and the `completed` row `complete()`
leaves behind are written while no run is active, so a write-through that unmounted with the
runner would drop them.

`TourRunner` is **not** modified in this task. It already writes a real `currentStepId` on its
first render and already calls `complete()` when `advance` returns null, so nothing has to be
plumbed up from it and no bespoke finish effect is added anywhere.

1. Add the import next to the other feature imports:

```ts
import { useProgressHydration, useProgressWriteThrough } from './progressSync'
```

2. Rewrite `TourHost` (phase 1's version is three selector lines plus two early returns) as:

```tsx
export function TourHost() {
  const activeScenario = useTourStore((s) => s.activeScenario)
  const role = useAuthStore((s) => s.user?.role)
  const scenario = activeScenario ? getScenario(activeScenario) : undefined

  // Both hooks must run on every render, including the ones that return null:
  // progress is written when no run is active — the welcome card's Skip, and the
  // completed row `complete()` leaves behind after the last step.
  useProgressHydration()
  useProgressWriteThrough()

  if (!scenario) return null
  if (role !== 'operator' && role !== 'admin') return null
  return <TourRunner scenario={scenario} />
}
```

- [ ] **Step 6: Verify nothing regressed in the tour suite**

```
bun run --cwd web test -- src/features/tutorials src/components/tour
```

Expected: PASS — every phase 1 and phase 2 tour test still green, plus the 10 new ones.

- [ ] **Step 7: Stage**

```bash
git add web/src/features/tutorials/progressSync.ts \
        web/src/features/tutorials/progressSync.test.tsx \
        web/src/features/tutorials/TourHost.tsx
```

---

### Task 6: Tutorials library page, setup-game picker, avatar menu entry, route and i18n

**Files:**
- Create: `web/src/features/tutorials/ScenarioCard.tsx`
- Create: `web/src/features/tutorials/SetupGamePicker.tsx`
- Create: `web/src/features/tutorials/SetupGamePicker.test.tsx`
- Create: `web/src/features/tutorials/TutorialsPage.tsx`
- Create: `web/src/features/tutorials/TutorialsPage.test.tsx`
- Modify: `web/src/features/dashboard/CreateGameDialog.tsx` (add `onCreated`)
- Modify: `web/src/components/layout/UserAvatarMenu.tsx` (add `menu-tutorials`)
- Create: `web/src/components/layout/UserAvatarMenu.test.tsx`
- Modify: `web/src/App.tsx` (lazy `TutorialsPage` + `/tutorials` route)
- Modify: `packages/i18n/src/locales/en.json`, `pt.json`, `de.json` (`tutorials.library.*`)

**Interfaces:**
- Consumes `useTutorialProgress` (Task 4), `useTourStore.start` (phase 1),
  `useUpdateTutorialProgress` (Task 4), `scenarioList()` and `SCENARIOS` (phase 1),
  `useGames` (existing).
- Produces `ScenarioCard({ scenario, progress, onStart, onResume, onRestart })`.
- Produces `SetupGamePicker({ open, onClose, onPick })` where `onPick(gameId: string)`.
- Produces `TutorialsPage` (named export) mounted at `/tutorials`.
- Produces `CreateGameDialog`'s optional `onCreated?: (game: Game) => void`.

**Launch rules (implemented exactly):**
- `new-game` scenario → `start(id, { stepId, gamesAtStart })`, then `navigate('/dashboard')`.
- `setup-game` scenario with a usable game (a `gameId` that is in `useGames()` with
  `status === 'setup'`) → `start(id, { gameId, stepId })`, then `navigate('/game/' + gameId)`.
- `setup-game` scenario without a usable game → open `SetupGamePicker`; its `onPick` supplies the
  game id and the launch continues as above.
- Resume is the same call with `stepId` set to the stored `currentStep`. There is no separate
  resume action: phase 1's `start` takes the step to begin at, and phase 1's `advance` resolves it
  against the effective list on the runner's first render — including the case where the stored
  step's `when` guard is now false.
- Restart first `PUT`s `{ status: 'in_progress', currentStep: null, gameId: null }` through
  `useUpdateTutorialProgress`, then launches with `stepId` unset, so the run begins at the top.

- [ ] **Step 1: Write the failing tests**

Create `web/src/features/tutorials/TutorialsPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { tutorialProgressStore } from '@/test/msw/handlers/tutorials'
import { createMockGame } from '@/test/factories/game'
import { useTourStore } from './store'
import { TutorialsPage } from './TutorialsPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TutorialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TutorialsPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    tutorialProgressStore.reset()
    useTourStore.getState().reset()
  })

  it('shows a skeleton while progress loads', () => {
    renderPage()
    expect(screen.getByTestId('tutorials-skeleton')).toBeInTheDocument()
  })

  it('shows an error with retry when progress cannot be loaded', async () => {
    server.use(
      http.get('/api/users/me/tutorials', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    )

    renderPage()

    await waitFor(() => expect(screen.getByTestId('tutorials-error')).toBeInTheDocument())
    expect(screen.getByTestId('tutorials-retry')).toBeInTheDocument()
  })

  it('renders one card per scenario with a Not started badge', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByTestId('tutorial-card-first-game')).toBeInTheDocument())
    expect(screen.getByTestId('tutorial-card-fixed-route')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-card-exploration')).toBeInTheDocument()
    expect(screen.getByTestId('tutorial-status-first-game')).toHaveTextContent('Not started')
    expect(screen.getByTestId('tutorial-start-first-game')).toBeInTheDocument()
  })

  it('reflects each stored status on the badge', async () => {
    tutorialProgressStore.seed([
      {
        scenarioId: 'first-game',
        status: 'completed',
        currentStep: 'finish',
        gameId: null,
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: '2026-09-06T09:40:00.000Z',
      },
      {
        scenarioId: 'exploration',
        status: 'skipped',
        currentStep: null,
        gameId: null,
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: null,
      },
    ])

    renderPage()

    await waitFor(() =>
      expect(screen.getByTestId('tutorial-status-first-game')).toHaveTextContent('Completed'),
    )
    expect(screen.getByTestId('tutorial-status-exploration')).toHaveTextContent('Skipped')
    expect(screen.getByTestId('tutorial-restart-first-game')).toBeInTheDocument()
  })

  it('Start on a new-game scenario starts the run and goes to the dashboard', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-first-game')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-first-game'))

    expect(useTourStore.getState().activeScenario).toBe('first-game')
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('Resume jumps back to the stored step', async () => {
    tutorialProgressStore.seed([
      {
        scenarioId: 'first-game',
        status: 'in_progress',
        currentStep: 'go-live',
        gameId: null,
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: null,
      },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-first-game')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-first-game'))

    expect(useTourStore.getState().activeScenario).toBe('first-game')
    expect(useTourStore.getState().currentStepId).toBe('go-live')
  })

  it('Restart writes in_progress with a null step before starting', async () => {
    tutorialProgressStore.seed([
      {
        scenarioId: 'first-game',
        status: 'completed',
        currentStep: 'finish',
        gameId: null,
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: '2026-09-06T09:40:00.000Z',
      },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-restart-first-game')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-restart-first-game'))

    await waitFor(() => expect(tutorialProgressStore.puts()).toHaveLength(1))
    expect(tutorialProgressStore.puts()[0]).toEqual({
      scenarioId: 'first-game',
      body: { status: 'in_progress', currentStep: null, gameId: null },
    })
    expect(useTourStore.getState().activeScenario).toBe('first-game')
    // Restart begins at the top: no `stepId` is passed, so the runner resolves the
    // first effective step itself.
    expect(useTourStore.getState().currentStepId).toBeNull()
  })

  it('a setup-game scenario opens the picker when no game is bound', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-start-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-start-fixed-route'))

    await waitFor(() => expect(screen.getByTestId('setup-game-picker')).toBeInTheDocument())
    expect(useTourStore.getState().activeScenario).toBeNull()
  })

  it('a setup-game scenario resumes straight into its bound game when it is still in setup', async () => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json([createMockGame({ id: 'game-setup', status: 'setup' })]),
      ),
    )
    tutorialProgressStore.seed([
      {
        scenarioId: 'fixed-route',
        status: 'in_progress',
        currentStep: 'arrange',
        gameId: 'game-setup',
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: null,
      },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-fixed-route'))

    expect(useTourStore.getState().gameId).toBe('game-setup')
    expect(mockNavigate).toHaveBeenCalledWith('/game/game-setup')
  })

  it('falls back to the picker when the bound game is no longer in setup', async () => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json([createMockGame({ id: 'game-setup', status: 'live' })]),
      ),
    )
    tutorialProgressStore.seed([
      {
        scenarioId: 'fixed-route',
        status: 'in_progress',
        currentStep: 'arrange',
        gameId: 'game-setup',
        startedAt: '2026-09-06T09:00:00.000Z',
        completedAt: null,
      },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('tutorial-resume-fixed-route')).toBeInTheDocument())

    await user.click(screen.getByTestId('tutorial-resume-fixed-route'))

    await waitFor(() => expect(screen.getByTestId('setup-game-picker')).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
```

Create `web/src/features/tutorials/SetupGamePicker.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { createMockGame } from '@/test/factories/game'
import { SetupGamePicker } from './SetupGamePicker'

function renderPicker(onPick = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SetupGamePicker open onClose={onClose} onPick={onPick} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onPick, onClose }
}

describe('SetupGamePicker', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json([
          createMockGame({ id: 'game-setup-1', name: 'Setup One', status: 'setup' }),
          createMockGame({ id: 'game-setup-2', name: 'Setup Two', status: 'setup' }),
          createMockGame({ id: 'game-live', name: 'Live One', status: 'live' }),
          createMockGame({ id: 'game-ended', name: 'Ended One', status: 'ended' }),
        ]),
      ),
    )
  })

  it('lists only games in setup', async () => {
    renderPicker()

    await waitFor(() => expect(screen.getByTestId('setup-game-option-game-setup-1')).toBeInTheDocument())
    expect(screen.getByTestId('setup-game-option-game-setup-2')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-game-option-game-live')).not.toBeInTheDocument()
    expect(screen.queryByTestId('setup-game-option-game-ended')).not.toBeInTheDocument()
  })

  it('hands the chosen game id back', async () => {
    const user = userEvent.setup()
    const { onPick } = renderPicker()
    await waitFor(() => expect(screen.getByTestId('setup-game-option-game-setup-2')).toBeInTheDocument())

    await user.click(screen.getByTestId('setup-game-option-game-setup-2'))

    expect(onPick).toHaveBeenCalledWith('game-setup-2')
  })

  it('shows an empty state when nothing is in setup', async () => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json([createMockGame({ id: 'game-live', status: 'live' })]),
      ),
    )
    renderPicker()

    await waitFor(() =>
      expect(screen.getByText(/no games in setup/i)).toBeInTheDocument(),
    )
    expect(screen.getByTestId('setup-game-create')).toBeInTheDocument()
  })

  it('creating a game picks it without navigating away', async () => {
    server.use(
      http.post('/api/games', () =>
        HttpResponse.json(createMockGame({ id: 'game-brand-new', status: 'setup' }), { status: 201 }),
      ),
    )
    const user = userEvent.setup()
    const { onPick } = renderPicker()
    await waitFor(() => expect(screen.getByTestId('setup-game-create')).toBeInTheDocument())

    await user.click(screen.getByTestId('setup-game-create'))
    await user.type(screen.getByTestId('game-name-input'), 'Route Rehearsal')
    await user.click(screen.getByTestId('game-save-btn'))

    await waitFor(() => expect(onPick).toHaveBeenCalledWith('game-brand-new'))
  })
})
```

Create `web/src/components/layout/UserAvatarMenu.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { UserAvatarMenu } from './UserAvatarMenu'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('UserAvatarMenu', () => {
  it('offers a Tutorials entry that routes to /tutorials', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserAvatarMenu />
      </MemoryRouter>,
    )

    await user.click(screen.getByTestId('user-avatar-btn'))
    const item = screen.getByTestId('menu-tutorials')
    expect(item).toHaveTextContent('Tutorials')

    await user.click(item)
    expect(mockNavigate).toHaveBeenCalledWith('/tutorials')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```
bun run --cwd web test -- src/features/tutorials/TutorialsPage.test.tsx src/features/tutorials/SetupGamePicker.test.tsx src/components/layout/UserAvatarMenu.test.tsx
```

Expected: FAIL — `Failed to resolve import "./TutorialsPage"` and, for the avatar test,
`Unable to find an element by: [data-testid="menu-tutorials"]`.

- [ ] **Step 3: Add the i18n keys**

In `packages/i18n/src/locales/en.json`, inside the existing top-level `"tutorials"` object (created
by phase 2), add a `"library"` block:

```json
    "library": {
      "title": "Tutorials",
      "subtitle": "Guided walkthroughs you run on your own game. Nothing is created or changed for you.",
      "stepCount": "{{count}} steps",
      "start": "Start",
      "resume": "Resume",
      "restart": "Restart",
      "loadFailed": "We could not load your tutorial progress.",
      "retry": "Try again",
      "status": {
        "notStarted": "Not started",
        "inProgress": "In progress",
        "completed": "Completed",
        "skipped": "Skipped"
      },
      "pickGame": {
        "title": "Pick a game in setup",
        "create": "Create a new game",
        "empty": "No games in setup. Create one to run this tutorial."
      }
    }
```

In `packages/i18n/src/locales/pt.json`, same position:

```json
    "library": {
      "title": "Tutoriais",
      "subtitle": "Percursos guiados que corres no teu próprio jogo. Nada é criado nem alterado automaticamente.",
      "stepCount": "{{count}} passos",
      "start": "Começar",
      "resume": "Retomar",
      "restart": "Recomeçar",
      "loadFailed": "Não foi possível carregar o teu progresso nos tutoriais.",
      "retry": "Tentar de novo",
      "status": {
        "notStarted": "Por começar",
        "inProgress": "Em curso",
        "completed": "Concluído",
        "skipped": "Ignorado"
      },
      "pickGame": {
        "title": "Escolhe um jogo em configuração",
        "create": "Criar um novo jogo",
        "empty": "Não há jogos em configuração. Cria um para correr este tutorial."
      }
    }
```

In `packages/i18n/src/locales/de.json`, same position:

```json
    "library": {
      "title": "Tutorials",
      "subtitle": "Geführte Rundgänge in deinem eigenen Spiel. Es wird nichts automatisch angelegt oder geändert.",
      "stepCount": "{{count}} Schritte",
      "start": "Starten",
      "resume": "Fortsetzen",
      "restart": "Neu starten",
      "loadFailed": "Dein Tutorial-Fortschritt konnte nicht geladen werden.",
      "retry": "Erneut versuchen",
      "status": {
        "notStarted": "Nicht begonnen",
        "inProgress": "Läuft",
        "completed": "Abgeschlossen",
        "skipped": "Übersprungen"
      },
      "pickGame": {
        "title": "Spiel in Einrichtung wählen",
        "create": "Neues Spiel erstellen",
        "empty": "Keine Spiele in Einrichtung. Erstelle eines, um dieses Tutorial zu starten."
      }
    }
```

Then verify parity:

```
bun run --cwd packages/i18n test
```

Expected: PASS.

- [ ] **Step 4: Write `ScenarioCard`**

Create `web/src/features/tutorials/ScenarioCard.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Scenario, TutorialProgress } from './types'

const STATUS_LABEL = {
  notStarted: 'tutorials.library.status.notStarted',
  in_progress: 'tutorials.library.status.inProgress',
  completed: 'tutorials.library.status.completed',
  skipped: 'tutorials.library.status.skipped',
} as const

const STATUS_VARIANT = {
  notStarted: 'outline',
  in_progress: 'info',
  completed: 'success',
  skipped: 'secondary',
} as const

const actionClass =
  'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring'

export function ScenarioCard({
  scenario,
  progress,
  onStart,
  onResume,
  onRestart,
}: {
  scenario: Scenario
  progress?: TutorialProgress
  onStart: () => void
  onResume: () => void
  onRestart: () => void
}) {
  const { t } = useTranslation()
  const key = progress?.status ?? 'notStarted'

  return (
    <Card data-testid={`tutorial-card-${scenario.id}`}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{t(scenario.title)}</h2>
            <Badge variant={STATUS_VARIANT[key]} data-testid={`tutorial-status-${scenario.id}`}>
              {t(STATUS_LABEL[key])}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t(scenario.blurb)}</p>
          <p className="text-xs text-muted-foreground">
            {t('tutorials.library.stepCount', { count: scenario.steps.length })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {progress?.status === 'in_progress' && (
            <button
              type="button"
              onClick={onResume}
              data-testid={`tutorial-resume-${scenario.id}`}
              className={`${actionClass} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {t('tutorials.library.resume')}
            </button>
          )}
          {progress ? (
            <button
              type="button"
              onClick={onRestart}
              data-testid={`tutorial-restart-${scenario.id}`}
              className={`${actionClass} border border-border text-foreground hover:bg-muted`}
            >
              {t('tutorials.library.restart')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              data-testid={`tutorial-start-${scenario.id}`}
              className={`${actionClass} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {t('tutorials.library.start')}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Add `onCreated` to `CreateGameDialog`**

In `web/src/features/dashboard/CreateGameDialog.tsx`, replace the signature and the submit handler:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateGame } from '@/hooks/mutations/useGameMutations'
import type { Game } from '@/types'

export function CreateGameDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  /**
   * Called instead of navigating to the new game. The tutorials library needs
   * the game to bind a scenario to before it decides where to go.
   */
  onCreated?: (game: Game) => void
}) {
  const navigate = useNavigate()
  const createGame = useCreateGame()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const game = await createGame.mutateAsync({
      name: name.trim(),
      description: description.trim(),
    })
    onClose()
    if (onCreated) {
      onCreated(game)
      return
    }
    navigate(`/game/${game.id}`)
  }
```

Leave the rest of the file unchanged.

- [ ] **Step 6: Write `SetupGamePicker`**

Create `web/src/features/tutorials/SetupGamePicker.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateGameDialog } from '@/features/dashboard/CreateGameDialog'
import { useGames } from '@/hooks/queries/useGames'

/**
 * Which game a `setup-game` scenario should run on.
 *
 * Only games in `setup` qualify: the scenarios teach setup-time controls, and a
 * live game would refuse most of them. Creating a game from here binds the new
 * game to the scenario instead of navigating, so the tour starts on the game
 * the operator just made.
 */
export function SetupGamePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (gameId: string) => void
}) {
  const { t } = useTranslation()
  const { data: games, isLoading } = useGames()
  const [createOpen, setCreateOpen] = useState(false)

  const setupGames = (games ?? []).filter((game) => game.status === 'setup')

  return (
    <>
      <Dialog
        open={open && !createOpen}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent className="max-w-md" data-testid="setup-game-picker" onClose={onClose}>
          <DialogHeader>
            <DialogTitle>{t('tutorials.library.pickGame.title')}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : setupGames.length === 0 ? (
            <EmptyState density="compact" title={t('tutorials.library.pickGame.empty')} />
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {setupGames.map((game) => (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => onPick(game.id)}
                    data-testid={`setup-game-option-${game.id}`}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <span className="block truncate font-medium">{game.name}</span>
                    {game.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {game.description}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              data-testid="setup-game-create"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {t('tutorials.library.pickGame.create')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateGameDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(game) => {
          setCreateOpen(false)
          onPick(game.id)
        }}
      />
    </>
  )
}
```

- [ ] **Step 7: Write `TutorialsPage`**

Create `web/src/features/tutorials/TutorialsPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/feedback/EmptyState'
import { useGames } from '@/hooks/queries/useGames'
import { useTutorialProgress } from '@/hooks/queries/useTutorialProgress'
import { useUpdateTutorialProgress } from '@/hooks/mutations/useTutorialMutations'
import { useTourStore } from './store'
import { scenarioList } from './scenarios'
import { ScenarioCard } from './ScenarioCard'
import { SetupGamePicker } from './SetupGamePicker'
import type { Scenario, ScenarioId, TutorialProgress } from './types'

export function TutorialsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const progressQuery = useTutorialProgress()
  const { data: games } = useGames()
  const updateProgress = useUpdateTutorialProgress()
  const start = useTourStore((s) => s.start)

  const [pickerFor, setPickerFor] = useState<{ scenario: Scenario; resumeStepId: string | null } | null>(
    null,
  )

  const scenarios = scenarioList()
  const byId = new Map<ScenarioId, TutorialProgress>(
    (progressQuery.data ?? []).map((row) => [row.scenarioId, row]),
  )

  /** A bound game is usable only while it is still in setup and still exists. */
  function usableGameId(gameId: string | null | undefined): string | null {
    if (!gameId) return null
    const game = (games ?? []).find((candidate) => candidate.id === gameId)
    return game && game.status === 'setup' ? game.id : null
  }

  function launch(scenario: Scenario, gameId: string | null, resumeStepId: string | null) {
    if (scenario.entry === 'new-game') {
      // Same `start()` the welcome card uses: step 1 of `first-game` recognises
      // "the game the operator just created" against this snapshot. `stepId` is
      // all Resume needs — the engine resolves it against the effective list.
      start(scenario.id, {
        stepId: resumeStepId ?? undefined,
        gamesAtStart: (games ?? []).map((candidate) => candidate.id),
      })
      navigate('/dashboard')
      return
    }
    if (!gameId) {
      setPickerFor({ scenario, resumeStepId })
      return
    }
    start(scenario.id, { gameId, stepId: resumeStepId ?? undefined })
    navigate(`/game/${gameId}`)
  }

  function handleStart(scenario: Scenario) {
    launch(scenario, null, null)
  }

  function handleResume(scenario: Scenario) {
    const row = byId.get(scenario.id)
    launch(scenario, usableGameId(row?.gameId), row?.currentStep ?? null)
  }

  function handleRestart(scenario: Scenario) {
    updateProgress.mutate({ scenarioId: scenario.id, status: 'in_progress', currentStep: null })
    launch(scenario, null, null)
  }

  return (
    <div className="safe-page h-full overflow-y-auto" data-testid="tutorials-page">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{t('tutorials.library.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('tutorials.library.subtitle')}</p>
        </header>

        {progressQuery.isLoading ? (
          <div className="space-y-3" data-testid="tutorials-skeleton" aria-hidden="true">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : progressQuery.isError ? (
          <div data-testid="tutorials-error">
            <EmptyState
              title={t('tutorials.library.loadFailed')}
              action={
                <button
                  type="button"
                  onClick={() => void progressQuery.refetch()}
                  data-testid="tutorials-retry"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {t('tutorials.library.retry')}
                </button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                progress={byId.get(scenario.id)}
                onStart={() => handleStart(scenario)}
                onResume={() => handleResume(scenario)}
                onRestart={() => handleRestart(scenario)}
              />
            ))}
          </div>
        )}
      </div>

      <SetupGamePicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onPick={(gameId) => {
          const target = pickerFor
          setPickerFor(null)
          if (target) launch(target.scenario, gameId, target.resumeStepId)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 8: Add the avatar menu entry**

In `web/src/components/layout/UserAvatarMenu.tsx`:

- extend the lucide import to `import { User, LogOut, Check, Globe, LayoutDashboard, GraduationCap } from 'lucide-react'`;
- insert this item immediately after the existing `menu-profile` item and before the
  `<div className="h-px bg-border my-1" />` that follows it:

```tsx
        <DropdownMenuItem
          onClick={() => navigate('/tutorials')}
          className="flex items-center gap-2"
          data-testid="menu-tutorials"
        >
          <GraduationCap size={14} />
          {t('tutorials.menu', 'Tutorials')}
        </DropdownMenuItem>
```

- [ ] **Step 9: Add the route**

In `web/src/App.tsx`, add the lazy import next to the other feature pages (after `ProfilePage`):

```tsx
const TutorialsPage = lazy(() =>
  import("@/features/tutorials/TutorialsPage").then((m) => ({
    default: m.TutorialsPage,
  })),
);
```

and add the route immediately after the `/profile` route object:

```tsx
  {
    path: "/tutorials",
    element: (
      <AuthGuard>
        <AppLayout>
          <Suspense fallback={<PageSpinner />}>
            <TutorialsPage />
          </Suspense>
        </AppLayout>
      </AuthGuard>
    ),
  },
```

- [ ] **Step 10: Run the tests to verify they pass**

```
bun run --cwd web test -- src/features/tutorials src/components/layout/UserAvatarMenu.test.tsx src/features/dashboard
bun run --cwd packages/i18n test
```

Expected: PASS — the 12 `TutorialsPage` tests, the 4 `SetupGamePicker` tests, the avatar test, the
existing dashboard tests (`CreateGameDialog` still navigates when `onCreated` is absent) and every
earlier tutorial test.

- [ ] **Step 11: Stage**

```bash
git add web/src/features/tutorials/ScenarioCard.tsx \
        web/src/features/tutorials/SetupGamePicker.tsx \
        web/src/features/tutorials/SetupGamePicker.test.tsx \
        web/src/features/tutorials/TutorialsPage.tsx \
        web/src/features/tutorials/TutorialsPage.test.tsx \
        web/src/features/dashboard/CreateGameDialog.tsx \
        web/src/components/layout/UserAvatarMenu.tsx \
        web/src/components/layout/UserAvatarMenu.test.tsx \
        web/src/App.tsx \
        packages/i18n/src/locales/en.json packages/i18n/src/locales/pt.json packages/i18n/src/locales/de.json
```

---

### Task 7: Full-stack Playwright smoke — the whole `first-game` scenario

**Files:**
- Modify: `e2e/tsconfig.json` (add `"resolveJsonModule": true`)
- Modify: `e2e/shared/api-client.ts` (add the two tutorial helpers)
- Create: `e2e/web/positive/tutorial-first-game.spec.ts`

**Interfaces:**
- Consumes `GET/PUT /api/users/me/tutorials` (Task 3) and every test id the tour anchors to.
- Produces `getTutorialProgress(token)` and
  `putTutorialProgress(token, scenarioId, body)` in `e2e/shared/api-client.ts`.

**Why this entry point:** see contract deviation 8. The shared E2E operator always owns games, so
the zero-games welcome card is not reliably visible, and the API cannot mint a fresh operator. The
spec seeds a `skipped` row and enters from the library's Restart button, which starts the same run.

**Copy assertions:** the spec never hard-codes English tutorial copy. It imports
`packages/i18n/src/locales/en.json` and reads `tutorials.firstGame.<stepId>.title`, so it stays
correct if phase 2 rewords a bubble.

- [ ] **Step 1: Write the failing test**

Add `"resolveJsonModule": true` to `compilerOptions` in `e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "esModuleInterop": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

Append to `e2e/shared/api-client.ts` (after the `getMe` helper):

```ts
// --- Tutorials ---

export async function getTutorialProgress(token: string) {
  const res = await request('GET', '/api/users/me/tutorials', { token });
  return { status: res.status, data: await json(res) };
}

export async function putTutorialProgress(
  token: string,
  scenarioId: string,
  body: { status: string; currentStep?: string | null; gameId?: string | null },
) {
  const res = await request('PUT', `/api/users/me/tutorials/${scenarioId}`, {
    body: {
      status: body.status,
      currentStep: body.currentStep ?? null,
      gameId: body.gameId ?? null,
    },
    token,
  });
  return { status: res.status, data: await json(res) };
}
```

Create `e2e/web/positive/tutorial-first-game.spec.ts`:

```ts
// @scenarios T1
import { test, expect, type Page } from '@playwright/test';
import { loginAsOperator, openDrawerTab } from '../../shared/web-helpers';
import {
  deleteGame,
  getTutorialProgress,
  putTutorialProgress,
  updateGameStatus,
} from '../../shared/api-client';
import { config } from '../../shared/config';
import { throwawayGameFixture } from '../../shared/fixtures';
import { appendCreatedGameId } from '../../shared/run-context';
import { getOperatorToken } from '../../shared/auth';
import en from '../../../packages/i18n/src/locales/en.json';

const firstGameCopy = (en as unknown as {
  tutorials: { firstGame: Record<string, { title: string }> };
}).tutorials.firstGame;

/** The English title the bubble shows for one scenario step. */
function stepTitle(stepId: string): string {
  const copy = firstGameCopy[stepId];
  if (!copy) throw new Error(`No English copy for first-game step "${stepId}"`);
  return copy.title;
}

/** Wait until the coach bubble is showing the given step. */
async function expectStep(page: Page, stepId: string) {
  await expect(page.getByTestId('tour-bubble-title')).toHaveText(stepTitle(stepId), {
    timeout: 20_000,
  });
}

/** Acknowledge an `ack` step and confirm the tour moved on. */
async function ackStep(page: Page, stepId: string, nextStepId: string) {
  await expectStep(page, stepId);
  await page.getByTestId('tour-next').click();
  await expectStep(page, nextStepId);
}

/**
 * Going live has no confirmation step: `go-live-btn` only renders once every check
 * passes, and its handler calls the status mutation straight away
 * (`web/src/features/build/ReadinessIndicator.tsx`). `confirm-state-change-btn`
 * belongs to the settings panel's revert flow, and clicking for it here would hang.
 */
async function expandReadinessAndGoLive(page: Page) {
  const readiness = page.getByTestId('readiness-indicator');
  await expect(readiness).toBeVisible({ timeout: 10_000 });
  await readiness.click();
  const goLive = page.getByTestId('go-live-btn');
  await expect(goLive).toBeVisible({ timeout: 10_000 });
  await goLive.click();
}

test.describe('Guided first-game tutorial', { tag: '@smoke' }, () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let gameId = '';

  test.beforeAll(async () => {
    token = getOperatorToken();
    // Deterministic entry: a skipped row makes the library show Restart.
    const seeded = await putTutorialProgress(token, 'first-game', { status: 'skipped' });
    expect(seeded.status).toBe(200);
  });

  test.afterAll(async () => {
    if (gameId) {
      await updateGameStatus(token, gameId, 'ended').catch(() => {});
      await deleteGame(token, gameId).catch(() => {});
    }
  });

  test('T1: walks the whole first-game scenario with QR bases', async ({ page }) => {
    test.setTimeout(300_000);

    await loginAsOperator(page);

    // ── Enter from the library ────────────────────────────────────────
    await page.goto('/tutorials');
    await expect(page.getByTestId('tutorials-page')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('tutorial-restart-first-game').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // ── 1. create-game ────────────────────────────────────────────────
    await expectStep(page, 'create-game');
    const gameName = throwawayGameFixture(config.runId, 'tutorial-first-game').name;
    await page.getByTestId('create-game-btn').click();
    await page.getByTestId('game-name-input').fill(gameName);
    await page.getByTestId('game-save-btn').click();
    await page.waitForURL(/\/game\/[0-9a-f-]{36}/, { timeout: 20_000 });
    gameId = page.url().match(/\/game\/([0-9a-f-]{36})/)![1];
    appendCreatedGameId(gameId);
    await expect(page.getByTestId('map-wrapper')).toBeVisible({ timeout: 20_000 });

    // ── 2. orient (ack) → 3. place-base ───────────────────────────────
    await ackStep(page, 'orient', 'place-base');

    // ── 3–4. first base, walked field by field, QR method ─────────────
    await openDrawerTab(page, 'bases');
    await page.getByTestId('new-entity-btn').click();
    await expect(page.getByTestId('base-name-input')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('base-name-input').fill('Tutorial Base One');
    await page.getByTestId('base-lat-input').fill('38.7223');
    await page.getByTestId('base-lng-input').fill('-9.1393');

    await ackStep(page, 'base-description', 'base-coords');
    await expectStep(page, 'base-coords');
    await page.getByTestId('tour-next').click();

    await expectStep(page, 'base-method');
    await page.getByTestId('base-checkin-method-qr').click();

    await ackStep(page, 'base-visibility', 'base-link');
    await expectStep(page, 'base-link');
    await page.getByTestId('tour-next').click();

    await expectStep(page, 'base-save');
    await page.getByTestId('save-base-btn').click();

    // QR branch: the printable code, then close the print sheet.
    await expectStep(page, 'base-qr');
    await page.getByTestId('base-qr-print').click();
    await expect(page.getByTestId('codes-print-sheet')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('codes-print-close').click();

    // ── 5. second-base (no field walkthrough) ─────────────────────────
    await expectStep(page, 'second-base');
    await openDrawerTab(page, 'bases');
    await page.getByTestId('new-entity-btn').click();
    await expect(page.getByTestId('base-name-input')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('base-name-input').fill('Tutorial Base Two');
    await page.getByTestId('base-lat-input').fill('38.7250');
    await page.getByTestId('base-lng-input').fill('-9.1500');
    await page.getByTestId('base-checkin-method-qr').click();
    await page.getByTestId('save-base-btn').click();

    // ── 6. first challenge, walked field by field ─────────────────────
    await expectStep(page, 'new-challenge');
    await openDrawerTab(page, 'challenges');
    await page.getByTestId('new-entity-btn').click();
    await expect(page.getByTestId('challenge-title-input')).toBeVisible({ timeout: 20_000 });

    await expectStep(page, 'challenge-title');
    await page.getByTestId('challenge-title-input').fill('Tutorial Challenge One');

    // `challenge-type` is an `ack` step (Text is preselected, so a "type chosen"
    // predicate would complete on arrival), and it spotlights `answer-type-group`.
    await expectStep(page, 'challenge-type');
    await page.getByTestId('answer-type-text').click();
    await page.getByTestId('tour-next').click();

    await expectStep(page, 'challenge-content');
    await page.getByTestId('challenge-content').click();
    await page.keyboard.type('Find the mill and describe the wheel.');

    await ackStep(page, 'challenge-description', 'challenge-autovalidate');
    await expectStep(page, 'challenge-autovalidate');
    await page.getByTestId('tour-next').click();

    // auto-validate stays off, so challenge-answer is filtered out by its `when`.
    await ackStep(page, 'challenge-points', 'challenge-completion');
    await expectStep(page, 'challenge-completion');
    await page.getByTestId('tour-next').click();

    await ackStep(page, 'challenge-location-bound', 'challenge-notes');
    await expectStep(page, 'challenge-notes');
    await page.getByTestId('tour-next').click();

    await expectStep(page, 'challenge-save');
    await page.getByTestId('save-challenge').click();

    // ── 7. more-challenges ────────────────────────────────────────────
    await expectStep(page, 'more-challenges');
    await openDrawerTab(page, 'challenges');
    await page.getByTestId('new-entity-btn').click();
    await expect(page.getByTestId('challenge-title-input')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('challenge-title-input').fill('Tutorial Challenge Two');
    await page.getByTestId('answer-type-text').click();
    await page.getByTestId('challenge-content').click();
    await page.keyboard.type('Count the benches in the square.');
    await page.getByTestId('save-challenge').click();

    // ── 8. assign ─────────────────────────────────────────────────────
    await expectStep(page, 'assign');
    await openDrawerTab(page, 'bases');
    await page.getByTestId('auto-assign-btn').click();

    // ── 9. new-team → 10. team-code ───────────────────────────────────
    await expectStep(page, 'new-team');
    await openDrawerTab(page, 'teams');
    await page.getByTestId('new-entity-btn').click();
    await expect(page.getByTestId('team-name-input')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('team-name-input').fill('Tutorial Team');
    await page.getByTestId('save-team').click();

    await ackStep(page, 'team-code', 'go-live');

    // ── 11. go-live → 12. modes ───────────────────────────────────────
    await expandReadinessAndGoLive(page);
    await ackStep(page, 'modes', 'revert');

    // ── 13. revert, keeping progress ──────────────────────────────────
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('game-settings-panel')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('revert-to-setup-btn').click();
    await page.getByTestId('progress-keep-btn').click();
    await page.getByTestId('confirm-state-change-btn').click();

    // ── 14. edit a challenge ──────────────────────────────────────────
    await expectStep(page, 'edit');
    await openDrawerTab(page, 'challenges');
    await page.getByText('Tutorial Challenge One').first().click();
    await expect(page.getByTestId('points-input')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('points-input').fill('25');
    await page.getByTestId('save-challenge').click();

    // ── 15. go live again → 16. finish ────────────────────────────────
    await expectStep(page, 'go-live-again');
    await expandReadinessAndGoLive(page);

    await expectStep(page, 'finish');
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-bubble')).toHaveCount(0, { timeout: 15_000 });

    // ── The server row ends completed ─────────────────────────────────
    await expect
      .poll(
        async () => {
          const res = await getTutorialProgress(token);
          const rows = res.data as Array<{ scenarioId: string; status: string }>;
          return rows.find((row) => row.scenarioId === 'first-game')?.status ?? 'missing';
        },
        { timeout: 20_000, message: 'first-game must end completed on the server' },
      )
      .toBe('completed');
  });
});
```

- [ ] **Step 2: Run the smoke to verify it fails before the app is wired**

If Tasks 1–6 are already done this will pass; run it now anyway to see it exercise the real stack:

```
cd e2e && ./run.sh smoke:web
```

Expected before Tasks 1–6: the seeding `PUT` in `beforeAll` fails with 404 and the spec errors out.
Expected after Tasks 1–6: PASS.

- [ ] **Step 3: Run the smoke to verify it passes**

```
cd e2e && ./run.sh smoke:web
```

Expected: every `@smoke` web spec passes, including
`T1: walks the whole first-game scenario with QR bases`.

If a step times out, read the Playwright trace in `e2e/artifacts/` before changing anything: a
timeout on `tour-bubble-title` means the engine did not advance, which is a scenario or engine
defect, not a test-flakiness problem — do **not** paper over it with `waitForTimeout`.

- [ ] **Step 4: Stage**

```bash
git add e2e/tsconfig.json e2e/shared/api-client.ts e2e/web/positive/tutorial-first-game.spec.ts
```

---

### Task 8: Verify and commit

**Files:** none created; this task runs the full gate and makes the phase's single commit.

- [ ] **Step 1: Run the backend suite**

```
make test-backend-docker
```

Expected: `BUILD SUCCESSFUL`. Read the summary line: zero failures, and `TutorialStatusTest`,
`TutorialProgressSchemaTest`, `TutorialProgressServiceTest` and `TutorialProgressEndpointTest` all
ran (they must not be reported as skipped — a skip means Docker was unavailable to Testcontainers
and the run proves nothing).

- [ ] **Step 2: Run the web gate**

```
bun run --cwd web typecheck
bun run --cwd web lint
bun run --cwd web test
bun run --cwd packages/i18n test
```

Expected: all four exit 0. If the local toolchain is unavailable, use
`make test-frontend-docker` (runs lint + typecheck + tests in one container) and run the i18n test
separately.

- [ ] **Step 3: Run the design-system checks**

```
make design-system-check
make design-system-audit
```

Expected: `design-system-check` exits 0. `design-system-audit` is advisory; read its output and
confirm it reports nothing new under `web/src/features/tutorials/` or
`web/src/components/layout/UserAvatarMenu.tsx`.

- [ ] **Step 4: Run the full-stack smoke**

```
cd e2e && ./run.sh smoke:web
```

Expected: all `@smoke` web specs pass.

- [ ] **Step 5: Confirm what is staged**

```
git status --short
```

Expected: only the paths staged by Tasks 1–7. Confirm **no** file under `docs/superpowers/` or
`docs/specs/` appears. If any does, unstage it:

```bash
git restore --staged docs/superpowers docs/specs
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(tutorials): per-account progress and tutorials library" \
           -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: one commit whose parent is the phase 2 commit. Verify:

```bash
git log --oneline -3
git show --stat HEAD
```

---

## Self-review

### 1. Spec coverage (phase 3 scope only)

| Spec requirement | Task |
|---|---|
| Migration `V61__user_tutorial_progress.sql` with the composite PK, cascade and columns | Task 1 |
| `TutorialStatus` enum, entity, `@Embeddable` id, repository | Task 1 |
| `TutorialProgressService` with `KNOWN_SCENARIOS`, completed stamping, restart semantics | Task 2 |
| DTOs `UpdateTutorialProgressRequest` / `TutorialProgressResponse`, lowercase wire status | Task 2 |
| Controller at `/api/users/me/tutorials` (GET, PUT `/{scenarioId}`), operator role via `SecurityConfig` | Task 3 |
| Gradle tests: list, upsert, restart, unknown scenario id, cross-user isolation, 401 | Tasks 1–3 |
| Flyway smoke (a test touches the table through the repository and through JDBC) | Tasks 1, 2 |
| `docs/api-reference.md` — the two endpoints and the new error codes | Task 3 |
| `docs/business-logic.md` — progress storage and the first-run rule | Task 3 |
| `web/src/lib/api/tutorials.ts`, `useTutorialProgress`, `useUpdateTutorialProgress`, MSW handlers | Task 4 |
| `progressSync.ts`: hydration, debounced write-through, flush on unmount and logout | Task 5 |
| Resume: `start(id, { gameId, stepId })` reusing phase 1's id-based position; `gameId` binding | Task 6 |
| Route `/tutorials` inside `AppLayout` behind `AuthGuard`, lazy-loaded | Task 6 |
| `TutorialsPage`: title/subtitle, loading skeleton, error with retry, one card per scenario | Task 6 |
| `ScenarioCard`: status badge and Start / Resume / Restart | Task 6 |
| `SetupGamePicker`: setup-only list, `setup-game-option-{id}`, `setup-game-create`, create path | Task 6 |
| Avatar menu `menu-tutorials` | Task 6 |
| `tutorials.library.*` in en / pt / de with real copy | Task 6 |
| Vitest: api client, hooks, progressSync, TutorialsPage, SetupGamePicker, avatar menu | Tasks 4–6 |
| Full-stack `@smoke` Playwright walking the whole scenario and asserting the server row | Task 7 |
| Welcome-card Skip and finish-step completion both reach the server | Task 5 (two dedicated tests) |
| Component inventory | Not needed — `ScenarioCard` is a feature component, stated in Global Constraints |

Out of phase-3 scope by design and covered elsewhere: the engine, `Spotlight`, `CoachBubble`,
`TourPill`, the `first-game` scenario file, the welcome card, `docs/visual-system/tokens.md`
(phases 1–2), and the `fixed-route` / `exploration` scenarios (phase 4).

### 2. Placeholder scan

No "TBD", "TODO", "implement later", "similar to Task N", "add error handling", or "write tests for
the above" appears. Every code step carries the complete file or the exact replacement text, every
command is runnable from the stated directory, and every expected result names what to look for.
The one conditional instruction (Task 3 Step 6, "does an onboarding section already exist?") ships
with the exact `grep` to run and both branches written out.

### 3. Name consistency with the index

- Files land exactly where the contract's layout says: `progressSync.ts`, `TutorialsPage.tsx`,
  `ScenarioCard.tsx`, `SetupGamePicker.tsx` under `web/src/features/tutorials/`;
  `web/src/lib/api/tutorials.ts`; `web/src/hooks/queries/useTutorialProgress.ts`;
  `web/src/hooks/mutations/useTutorialMutations.ts`.
- Query key `['tutorials','me']`, mutation key `['tutorials','update']` — as specified.
- `tutorialsApi.list` / `tutorialsApi.update(scenarioId, body)` — as specified.
- Test ids `tutorials-page`, `tutorial-card-{id}`, `tutorial-start-{id}`, `tutorial-resume-{id}`,
  `tutorial-restart-{id}`, `setup-game-picker`, `setup-game-option-{gameId}`, `setup-game-create`,
  `menu-tutorials` — as specified. `tutorial-status-{id}`, `tutorials-skeleton`, `tutorials-error`
  and `tutorials-retry` are new and additive; they are listed in Global Constraints.
- Backend names `TutorialStatus`, `UserTutorialProgress`, `UserTutorialProgressId`,
  `UserTutorialProgressRepository.findAllByIdUserId`, `TutorialProgressService.KNOWN_SCENARIOS`,
  `UpdateTutorialProgressRequest`, `TutorialProgressResponse`, `TutorialProgressController` — as
  specified.
- Store names used here (`start`, `stop`, `setProgress`, `reset`, `progress`,
  `gameId`, `activeScenario`, `currentStepId`, `setCurrentStep`, `complete`, `skip`) match the
  phase 1 contract; phase 3 adds no store field and no store action at all.
- `i18n` keys stay inside the contract's `tutorials.library.*` namespace; `stepCount` and `retry`
  are additions within that namespace.
- Type names `Scenario`, `ScenarioId`, `TutorialStatus`, `TutorialProgress` are the contract's;
  `TutorialProgress.gameId` is the declared addition.
