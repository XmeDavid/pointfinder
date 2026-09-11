# Check-in methods — Phase 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every base its own check-in method (NFC, QR, or location) and make the backend verify the matching typed proof — token compare, GPS geofence, or a dwell-gated presence claim — with audited results.

**Architecture:** A new `CheckInVerificationService` owns all proof rules (haversine distance, accuracy caps, staleness window, wide-ring dwell rule, teammate position snapshot) and returns an immutable `VerifiedProof` that `PlayerService.checkIn` writes onto the `check_ins` row. `Base` and `Game` carry the method plus a per-base radius that falls back to the game default; `GameReadinessValidator` gains per-method go-live rules; the activity event, audit export, and import/export carry the new fields through.

**Tech Stack:** Java 21, Spring Boot 3.4, Hibernate 6.6, Flyway, PostgreSQL 16, Lombok, JUnit 5 + Mockito, Testcontainers (`IntegrationTestBase`), Gradle (Kotlin DSL), Docker Compose for tests.

## Global Constraints

- Enum names are fixed: `CheckInMethod { NFC, QR, LOCATION }`, `CheckInVerification { VERIFIED, CLAIMED, OPERATOR }`, package `com.prayer.pointfinder.entity`, persisted `VARCHAR(16)` with `@Enumerated(EnumType.STRING)`.
- Migration file is exactly `backend/src/main/resources/db/migration/V60__check_in_methods.sql`. Latest existing is V59.
- New error codes, group "Check-in", in `exception/ErrorCode.java`: `CHECK_IN_METHOD_MISMATCH`, `CHECK_IN_TOKEN_INVALID`, `CHECK_IN_FIX_TOO_COARSE`, `CHECK_IN_FIX_STALE`, `CHECK_IN_OUT_OF_RANGE`, `CHECK_IN_CLAIM_NOT_DWELLED`. Keep `NFC_TOKEN_REQUIRED`.
- Error details use `new BadRequestException(msg, ErrorCode.X, Map.of(...))` (`Map<String,String>`), exactly like `PREVIOUS_BASE_REQUIRED` attaches `nextRequiredBaseNumber`.
- `CHECK_IN_OUT_OF_RANGE` details keys: `distanceM`, `allowedM`. `CHECK_IN_CLAIM_NOT_DWELLED` details key: `reason` ∈ `too_few_fixes|span_too_short|outside_ring|fix_too_coarse|buffer_stale`.
- Verification constants (in `service/CheckInVerificationService.java`): `MIN_RADIUS_M = 5`, `MAX_RADIUS_M = 200`, `AUTO_ACCURACY_CAP_M = 50.0`, `ACCURACY_CREDIT_CAP_M = 30.0`, `CLAIM_ACCURACY_CAP_M = 100.0`, `STALE_PAST = Duration.ofHours(24)`, `STALE_FUTURE = Duration.ofMinutes(10)`, `DWELL_MIN_FIXES = 4`, `DWELL_MIN_SPAN_MS = 60_000L`, `DWELL_MAX_GAP_TO_MAIN_MS = 120_000L`, `EARTH_RADIUS_M = 6_371_000.0`.
- Auto acceptance rule: `distance <= radius + min(accuracy, 30)`. Wide ring: `R = max(3 * radius, 50)`.
- Verification order in `PlayerService.checkIn`: guards (player in game, game live, base in game) → dedup (existing active row returned as-is) → base order → `CheckInVerificationService.verify(...)` → save row → activity event → broadcast → push.
- Legacy body `{"nfcToken":"..."}` stays accepted and is treated as `method: "nfc"`; it is accepted **only** at NFC bases.
- For `VERIFIED` geo rows `checked_in_at = capturedAt`. For `CLAIMED` rows `checked_in_at = now` (receipt time). Token rows keep `now`.
- Do NOT rename existing test IDs, routes, API paths, DTO field names, or accessibility ids.
- Docs to update in this phase: `docs/business-logic.md` § 2 (and its Table of Contents entry).
- Do NOT commit this plan file or anything under `docs/specs/`.
- Focused test command (from repo root `/Users/xmedavid/dev/dbvnfc`):
  `docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests '<FQCN>'`
- Full backend suite: `make test-backend-docker`.
- This whole phase is **ONE atomic commit**, made only in the final task, with message `feat(backend): per-base check-in methods with location verification` and trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---
### Task 1: Migration V60, check-in enums, Base/Game columns

**Files:**
- Create: `backend/src/main/resources/db/migration/V60__check_in_methods.sql`
- Create: `backend/src/main/java/com/prayer/pointfinder/entity/CheckInMethod.java`
- Create: `backend/src/main/java/com/prayer/pointfinder/entity/CheckInVerification.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/entity/Base.java` (add fields after line 48 `hidden`, add helper before `@PrePersist` at line 88)
- Modify: `backend/src/main/java/com/prayer/pointfinder/entity/Game.java` (add fields after line 88 `unlockTrigger`)
- Test: `backend/src/test/java/com/prayer/pointfinder/entity/BaseCheckInRadiusTest.java` (create)
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/CheckInMethodsSchemaTest.java` (create)

**Interfaces:**
- Produces: `enum CheckInMethod { NFC, QR, LOCATION }`, `enum CheckInVerification { VERIFIED, CLAIMED, OPERATOR }`
- Produces: `Base.getCheckInMethod() : CheckInMethod`, `Base.getCheckInRadiusM() : Integer`, `Base.resolvedCheckInRadiusM() : int`
- Produces: `Game.getDefaultCheckInMethod() : CheckInMethod`, `Game.getDefaultCheckInRadiusM() : Integer`
- Produces: DB columns listed in the migration below (also consumed by Task 2).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/entity/BaseCheckInRadiusTest.java`:

```java
package com.prayer.pointfinder.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Radius resolution contract: a base uses its own override when set,
 * otherwise the owning game's default, otherwise the product default of 15 m.
 */
class BaseCheckInRadiusTest {

    @Test
    void baseOverrideWinsOverGameDefault() {
        Game game = Game.builder().defaultCheckInRadiusM(40).build();
        Base base = Base.builder().game(game).checkInRadiusM(12).build();

        assertEquals(12, base.resolvedCheckInRadiusM());
    }

    @Test
    void gameDefaultUsedWhenBaseHasNoOverride() {
        Game game = Game.builder().defaultCheckInRadiusM(40).build();
        Base base = Base.builder().game(game).build();

        assertEquals(40, base.resolvedCheckInRadiusM());
    }

    @Test
    void productDefaultUsedWhenNeitherIsSet() {
        Base base = Base.builder().build();

        assertEquals(15, base.resolvedCheckInRadiusM());
    }

    @Test
    void newBasesAndGamesDefaultToNfc() {
        assertEquals(CheckInMethod.NFC, Base.builder().build().getCheckInMethod());
        assertEquals(CheckInMethod.NFC, Game.builder().build().getDefaultCheckInMethod());
        assertEquals(15, Game.builder().build().getDefaultCheckInRadiusM());
    }
}
```

Create `backend/src/test/java/com/prayer/pointfinder/integration/CheckInMethodsSchemaTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V60 schema contract. Asserts every column the check-in-methods wave adds,
 * its nullability and default, and the operator_rescue backfill statement.
 */
class CheckInMethodsSchemaTest extends IntegrationTestBase {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Map<String, Object> column(String table, String column) {
        return jdbcTemplate.queryForMap(
                "SELECT data_type, is_nullable, column_default FROM information_schema.columns "
                        + "WHERE table_name = ? AND column_name = ?",
                table, column);
    }

    @Test
    void basesCarryMethodAndRadius() {
        Map<String, Object> method = column("bases", "check_in_method");
        assertEquals("character varying", method.get("data_type"));
        assertEquals("NO", method.get("is_nullable"));
        assertTrue(String.valueOf(method.get("column_default")).contains("'NFC'"));

        Map<String, Object> radius = column("bases", "check_in_radius_m");
        assertEquals("integer", radius.get("data_type"));
        assertEquals("YES", radius.get("is_nullable"));
    }

    @Test
    void gamesCarryDefaultMethodAndRadius() {
        Map<String, Object> method = column("games", "default_check_in_method");
        assertEquals("NO", method.get("is_nullable"));
        assertTrue(String.valueOf(method.get("column_default")).contains("'NFC'"));

        Map<String, Object> radius = column("games", "default_check_in_radius_m");
        assertEquals("integer", radius.get("data_type"));
        assertEquals("NO", radius.get("is_nullable"));
        assertTrue(String.valueOf(radius.get("column_default")).contains("15"));
    }

    @Test
    void checkInsCarryMethodVerificationAndProof() {
        assertEquals("NO", column("check_ins", "method").get("is_nullable"));
        assertEquals("NO", column("check_ins", "verification").get("is_nullable"));
        assertEquals("double precision", column("check_ins", "proof_lat").get("data_type"));
        assertEquals("double precision", column("check_ins", "proof_lng").get("data_type"));
        assertEquals("double precision", column("check_ins", "proof_accuracy_m").get("data_type"));
        assertEquals("double precision", column("check_ins", "proof_distance_m").get("data_type"));
        assertEquals("timestamp with time zone", column("check_ins", "proof_captured_at").get("data_type"));
        assertEquals("jsonb", column("check_ins", "team_positions_snapshot").get("data_type"));
    }

    @Test
    void playerLocationsAndActivityEventsGainTheirColumns() {
        assertEquals("double precision", column("player_locations", "accuracy_m").get("data_type"));
        assertEquals("timestamp with time zone", column("player_locations", "captured_at").get("data_type"));
        assertEquals("jsonb", column("activity_events", "metadata").get("data_type"));
    }

    @Test
    void rescueRowsAreBackfilledToOperatorVerification() {
        String flywayVersion = jdbcTemplate.queryForObject(
                "SELECT version FROM flyway_schema_history WHERE version = '60'", String.class);
        assertNotNull(flywayVersion, "V60 must be applied");

        // The migration's backfill statement is re-runnable; applying it to a
        // freshly inserted rescue row must flip it to OPERATOR while leaving
        // player rows on VERIFIED.
        jdbcTemplate.execute("UPDATE check_ins SET verification = 'OPERATOR' WHERE source_surface = 'operator_rescue'");
        Integer stragglers = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM check_ins WHERE source_surface = 'operator_rescue' AND verification <> 'OPERATOR'",
                Integer.class);
        assertEquals(0, stragglers);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.entity.BaseCheckInRadiusTest'
```

Expected: compilation failure — `cannot find symbol: method defaultCheckInRadiusM(int)` on `Game.GameBuilder`, `cannot find symbol: class CheckInMethod`, `cannot find symbol: method resolvedCheckInRadiusM()`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/main/resources/db/migration/V60__check_in_methods.sql`:

```sql
-- Wave: check-in methods (NFC / QR / location).
-- Spec: docs/specs/2026-09-05-check-in-methods-design.md
--
-- Today every base is proved by tapping its NFC tag. This migration makes the
-- proof method a per-base choice with a game-level default:
--
--   * NFC       — tap the tag written for the base (today's behaviour).
--   * QR        — scan a printed code carrying the same token as the tag.
--   * LOCATION  — the base unlocks when the phone's GPS fix lands inside the
--                 base radius; if GPS never converges the player may claim
--                 presence after dwelling nearby, and the claim is recorded,
--                 marked, and reported to operators.
--
-- Everything here is additive with a default, so existing games keep working
-- unchanged: bases and check-ins backfill to NFC, games default to NFC with a
-- 15 m radius, and historical operator rescues are re-labelled OPERATOR so the
-- audit trail distinguishes them from player-verified rows.

-- ── Base: the per-base method and optional radius override ───────────────
ALTER TABLE bases ADD COLUMN check_in_method VARCHAR(16) NOT NULL DEFAULT 'NFC';
-- NULL means "inherit games.default_check_in_radius_m". Writes are clamped to
-- 5..200 in the service layer; the column stays unconstrained so an operator
-- lowering the game default never invalidates a stored row.
ALTER TABLE bases ADD COLUMN check_in_radius_m INTEGER;

-- ── Game: the default copied onto new bases at creation time ─────────────
ALTER TABLE games ADD COLUMN default_check_in_method VARCHAR(16) NOT NULL DEFAULT 'NFC';
ALTER TABLE games ADD COLUMN default_check_in_radius_m INTEGER NOT NULL DEFAULT 15;

-- ── CheckIn: which method proved this visit, and how strong the proof was ─
ALTER TABLE check_ins ADD COLUMN method VARCHAR(16) NOT NULL DEFAULT 'NFC';
ALTER TABLE check_ins ADD COLUMN verification VARCHAR(16) NOT NULL DEFAULT 'VERIFIED';

-- Historical operator rescues were never player-verified. Re-label them so the
-- command view and the audit export can tell a rescue from a real arrival.
UPDATE check_ins SET verification = 'OPERATOR' WHERE source_surface = 'operator_rescue';

-- Geo proof, stored verbatim so an operator reviewing an incident sees exactly
-- what the phone reported rather than a derived verdict.
ALTER TABLE check_ins ADD COLUMN proof_lat DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_lng DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_accuracy_m DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_distance_m DOUBLE PRECISION;
ALTER TABLE check_ins ADD COLUMN proof_captured_at TIMESTAMPTZ;

-- One entry per player on the team at claim time: playerId, displayName, lat,
-- lng, accuracyM, ageSeconds, distanceM. Only populated for CLAIMED rows.
ALTER TABLE check_ins ADD COLUMN team_positions_snapshot JSONB;

-- ── PlayerLocation: the phone already sends these; stop discarding them ───
ALTER TABLE player_locations ADD COLUMN accuracy_m DOUBLE PRECISION;
ALTER TABLE player_locations ADD COLUMN captured_at TIMESTAMPTZ;

-- ── ActivityEvent: structured payload beside the free-text message ────────
-- Check-in events carry {"method": ..., "verification": ...} and, for claims,
-- {"teammatesInRing": n, "teammatesTotal": n}. The message column stays the
-- human narration; consumers that do not know about metadata are unaffected.
ALTER TABLE activity_events ADD COLUMN metadata JSONB;
```

Create `backend/src/main/java/com/prayer/pointfinder/entity/CheckInMethod.java`:

```java
package com.prayer.pointfinder.entity;

/**
 * How a team proves it reached a base. Chosen per base, seeded from the
 * game's {@code defaultCheckInMethod} when the base is created; changing the
 * game default later does not rewrite existing bases.
 *
 * <p>Persisted as {@code VARCHAR(16)} rather than a Postgres enum so future
 * methods do not need an enum migration.
 */
public enum CheckInMethod {
    /** Tap the NFC tag written for the base. */
    NFC,
    /** Scan the printed QR code, which carries the same token as the tag. */
    QR,
    /** Be inside the base radius; verified server-side from a GPS fix. */
    LOCATION
}
```

Create `backend/src/main/java/com/prayer/pointfinder/entity/CheckInVerification.java`:

```java
package com.prayer.pointfinder.entity;

/**
 * How strong the proof behind a check-in row was.
 *
 * <p>Operators see this in the command view and the audit export, so the
 * distinction has to survive in the data rather than being re-derived.
 */
public enum CheckInVerification {
    /** Token matched, or a GPS fix landed inside the accepted distance. */
    VERIFIED,
    /** Player claimed presence after dwelling in the wider ring; flagged. */
    CLAIMED,
    /** Operator rescue; no player proof was involved. */
    OPERATOR
}
```

In `backend/src/main/java/com/prayer/pointfinder/entity/Base.java`, insert after the `hidden` field (line 48) and before the `fixedChallenge` association:

```java
    /**
     * How a team proves it reached this base. Copied from the game's
     * {@code defaultCheckInMethod} at creation; independent afterwards.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "check_in_method", nullable = false, length = 16)
    @Builder.Default
    private CheckInMethod checkInMethod = CheckInMethod.NFC;

    /**
     * Per-base radius override in metres for {@link CheckInMethod#LOCATION}.
     * Null means "use the game default". Writes are clamped to 5..200.
     */
    @Column(name = "check_in_radius_m")
    private Integer checkInRadiusM;
```

In the same file, insert immediately before `private static final SecureRandom SECURE_RANDOM` (line 86):

```java
    /**
     * Effective check-in radius in metres: the base override when set, else
     * the owning game's default, else the product default of 15 m. The final
     * fallback keeps detached or partially-built entities usable in tests and
     * in the import path, where the game association may not be loaded yet.
     */
    public int resolvedCheckInRadiusM() {
        if (checkInRadiusM != null) {
            return checkInRadiusM;
        }
        Integer gameDefault = game != null ? game.getDefaultCheckInRadiusM() : null;
        return gameDefault != null ? gameDefault : 15;
    }
```

In `backend/src/main/java/com/prayer/pointfinder/entity/Game.java`, insert after the `unlockTrigger` field (line 88) and before the `stateVersion` javadoc:

```java
    /**
     * Check-in method copied onto every base created in this game. Editable
     * during setup, read-only once the game is live.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "default_check_in_method", nullable = false, length = 16)
    @Builder.Default
    private CheckInMethod defaultCheckInMethod = CheckInMethod.NFC;

    /**
     * Default radius in metres for location bases that do not override it.
     * Clamped to 5..200 on write.
     */
    @Column(name = "default_check_in_radius_m", nullable = false)
    @Builder.Default
    private Integer defaultCheckInRadiusM = 15;
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.entity.BaseCheckInRadiusTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.CheckInMethodsSchemaTest'
```

- [ ] **Step 5: Verify green — do not commit yet.** This phase is one atomic commit made in Task 15.

---
### Task 2: CheckIn, PlayerLocation and ActivityEvent entity fields

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/entity/CheckIn.java` (add fields after `checkedInAt`, line 37)
- Modify: `backend/src/main/java/com/prayer/pointfinder/entity/PlayerLocation.java` (add fields after `lng`, line 29)
- Modify: `backend/src/main/java/com/prayer/pointfinder/entity/ActivityEvent.java` (add field after `timestamp`, line 44)
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/CheckInProofPersistenceTest.java` (create)

**Interfaces:**
- Consumes: V60 columns from Task 1.
- Produces: `CheckIn.method/verification/proofLat/proofLng/proofAccuracyM/proofDistanceM/proofCapturedAt/teamPositionsSnapshot`, `PlayerLocation.accuracyM/capturedAt`, `ActivityEvent.metadata : Map<String,Object>`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/integration/CheckInProofPersistenceTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Round-trips the new columns through Hibernate so the JSON mappings and the
 * enum-as-varchar mappings are exercised against real Postgres, not just the
 * schema assertions in {@link CheckInMethodsSchemaTest}.
 */
class CheckInProofPersistenceTest extends IntegrationTestBase {

    @Autowired
    private PlayerLocationRepository playerLocationRepository;

    @Autowired
    private ActivityEventRepository activityEventRepository;

    @Test
    void claimedCheckInRoundTripsProofAndSnapshot() {
        User operator = createOperator("proof@checkin.com", "password");
        Game game = createGame(operator, "Proof Game", GameStatus.live);
        Team team = createTeam(game, "Otters", "OTT001");
        Base base = createBase(game, "Proof Base");
        Player player = createPlayer(team, "Scout", "device-proof");

        Instant capturedAt = Instant.parse("2026-09-05T10:00:00Z");
        CheckIn saved = checkInRepository.save(CheckIn.builder()
                .game(game)
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(Instant.parse("2026-09-05T10:00:30Z"))
                .method(CheckInMethod.LOCATION)
                .verification(CheckInVerification.CLAIMED)
                .proofLat(41.1)
                .proofLng(-8.6)
                .proofAccuracyM(22.0)
                .proofDistanceM(38.5)
                .proofCapturedAt(capturedAt)
                .teamPositionsSnapshot("[{\"playerId\":\"p1\",\"distanceM\":12.5}]")
                .sourceSurface("player_app")
                .build());

        CheckIn reloaded = checkInRepository.findById(saved.getId()).orElseThrow();
        assertEquals(CheckInMethod.LOCATION, reloaded.getMethod());
        assertEquals(CheckInVerification.CLAIMED, reloaded.getVerification());
        assertEquals(41.1, reloaded.getProofLat());
        assertEquals(-8.6, reloaded.getProofLng());
        assertEquals(22.0, reloaded.getProofAccuracyM());
        assertEquals(38.5, reloaded.getProofDistanceM());
        assertEquals(capturedAt, reloaded.getProofCapturedAt());
        assertTrue(reloaded.getTeamPositionsSnapshot().contains("distanceM"));
    }

    @Test
    void playerLocationStoresAccuracyAndCaptureTime() {
        User operator = createOperator("loc@checkin.com", "password");
        Game game = createGame(operator, "Loc Game", GameStatus.live);
        Team team = createTeam(game, "Badgers", "BDG001");
        Player player = createPlayer(team, "Scout", "device-loc");

        Instant capturedAt = Instant.parse("2026-09-05T09:59:00Z");
        playerLocationRepository.save(PlayerLocation.builder()
                .player(player)
                .lat(41.0)
                .lng(-8.5)
                .accuracyM(9.5)
                .capturedAt(capturedAt)
                .build());

        PlayerLocation reloaded = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertEquals(9.5, reloaded.getAccuracyM());
        assertEquals(capturedAt, reloaded.getCapturedAt());
    }

    @Test
    void activityEventStoresStructuredMetadata() {
        User operator = createOperator("meta@checkin.com", "password");
        Game game = createGame(operator, "Meta Game", GameStatus.live);
        Team team = createTeam(game, "Foxes", "FOX001");
        Base base = createBase(game, "Meta Base");

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("method", "LOCATION");
        metadata.put("verification", "CLAIMED");
        metadata.put("teammatesInRing", 2);
        metadata.put("teammatesTotal", 4);

        ActivityEvent saved = activityEventRepository.save(ActivityEvent.builder()
                .game(game)
                .type(ActivityEventType.check_in)
                .team(team)
                .base(base)
                .message("Foxes checked in at Meta Base")
                .timestamp(Instant.now())
                .metadata(metadata)
                .build());

        ActivityEvent reloaded = activityEventRepository.findById(saved.getId()).orElseThrow();
        assertEquals("CLAIMED", reloaded.getMetadata().get("verification"));
        assertEquals(2, ((Number) reloaded.getMetadata().get("teammatesInRing")).intValue());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.CheckInProofPersistenceTest'
```

Expected: compilation failure — `cannot find symbol: method method(CheckInMethod)` on `CheckIn.CheckInBuilder`, `accuracyM(double)` on `PlayerLocation.PlayerLocationBuilder`, `metadata(Map)` on `ActivityEvent.ActivityEventBuilder`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/entity/CheckIn.java`, add the imports

```java
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
```

and insert immediately after the `checkedInAt` field (line 37):

```java
    /**
     * Which method proved this visit. Copied from the base at check-in time so
     * a later method change on the base does not rewrite history.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 16)
    @Builder.Default
    private CheckInMethod method = CheckInMethod.NFC;

    /**
     * Strength of the proof: token/geo verified, player-claimed after a dwell,
     * or an operator rescue with no player proof at all.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "verification", nullable = false, length = 16)
    @Builder.Default
    private CheckInVerification verification = CheckInVerification.VERIFIED;

    /** Latitude reported by the phone for a geo proof. Null for token proofs. */
    @Column(name = "proof_lat")
    private Double proofLat;

    /** Longitude reported by the phone for a geo proof. */
    @Column(name = "proof_lng")
    private Double proofLng;

    /** Reported horizontal accuracy of the fix, in metres. */
    @Column(name = "proof_accuracy_m")
    private Double proofAccuracyM;

    /** Server-computed haversine distance from the fix to the base, in metres. */
    @Column(name = "proof_distance_m")
    private Double proofDistanceM;

    /**
     * When the phone captured the fix. For VERIFIED geo rows this is also
     * {@link #checkedInAt}, so an offline queue replayed hours later still
     * records the moment the team actually arrived.
     */
    @Column(name = "proof_captured_at")
    private Instant proofCapturedAt;

    /**
     * JSON array snapshotting every teammate's latest known position at claim
     * time: {@code playerId}, {@code displayName}, {@code lat}, {@code lng},
     * {@code accuracyM}, {@code ageSeconds}, {@code distanceM}. Only populated
     * for {@link CheckInVerification#CLAIMED} rows — it is the evidence an
     * operator reviews when deciding whether a claim was honest.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "team_positions_snapshot", columnDefinition = "jsonb")
    private String teamPositionsSnapshot;
```

In `backend/src/main/java/com/prayer/pointfinder/entity/PlayerLocation.java`, insert after the `lng` field (line 29):

```java
    /** Reported horizontal accuracy of the fix, in metres. Null for legacy rows. */
    @Column(name = "accuracy_m")
    private Double accuracyM;

    /**
     * When the phone captured the fix, as opposed to {@link #updatedAt} which
     * is when the server stored it. The two diverge when a queued report syncs
     * after a reconnect.
     */
    @Column(name = "captured_at")
    private Instant capturedAt;
```

In `backend/src/main/java/com/prayer/pointfinder/entity/ActivityEvent.java`, add the imports

```java
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.Map;
```

and insert after the `timestamp` field (line 44):

```java
    /**
     * Structured payload beside the free-text {@link #message}. Check-in
     * events carry {@code method} and {@code verification}; claimed check-ins
     * additionally carry {@code teammatesInRing} and {@code teammatesTotal}.
     * Null for every event type that has nothing structured to add.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.CheckInProofPersistenceTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 3: Error codes and CheckInVerificationService — method match and token proofs

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java` (add group after `NFC_TOKEN_REQUIRED`, line 78)
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/CheckInRequest.java` (full rewrite)
- Create: `backend/src/main/java/com/prayer/pointfinder/service/CheckInVerificationService.java`
- Test: `backend/src/test/java/com/prayer/pointfinder/service/CheckInVerificationServiceTest.java` (create)

**Interfaces:**
- Produces: `CheckInVerificationService.verify(Base base, Team team, CheckInRequest request, Instant now) : VerifiedProof`
- Produces: `record VerifiedProof(CheckInMethod method, CheckInVerification verification, Double proofLat, Double proofLng, Double proofAccuracyM, Double proofDistanceM, Instant proofCapturedAt, String teamPositionsSnapshotJson, Instant checkedInAt, Integer teammatesInRing, Integer teammatesTotal)`
- Produces: `CheckInRequest { String method; String token; String nfcToken; Double lat; Double lng; Double accuracy; Instant capturedAt; Boolean claimed; List<FixDto> dwell; }` with `static class FixDto { Double lat; Double lng; Double accuracy; Instant capturedAt; }`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/CheckInVerificationServiceTest.java`:

```java
package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

/**
 * Rules for the typed check-in proof. Pure unit test: the repositories are
 * only consulted on the CLAIMED path, which has its own test class.
 */
class CheckInVerificationServiceTest {

    private final PlayerRepository playerRepository = mock(PlayerRepository.class);
    private final PlayerLocationRepository playerLocationRepository = mock(PlayerLocationRepository.class);
    private final CheckInVerificationService service =
            new CheckInVerificationService(playerRepository, playerLocationRepository, new ObjectMapper());

    private final Instant now = Instant.parse("2026-09-05T10:00:00Z");

    private Base base(CheckInMethod method) {
        Game game = Game.builder().id(UUID.randomUUID()).build();
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Base 1")
                .lat(41.1)
                .lng(-8.6)
                .nfcToken("ab12cd34")
                .checkInMethod(method)
                .build();
    }

    private Team team() {
        return Team.builder().id(UUID.randomUUID()).name("Wolves").build();
    }

    private CheckInRequest tokenRequest(String method, String token) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod(method);
        request.setToken(token);
        return request;
    }

    @Test
    void nfcTokenProofVerifiesAtNfcBase() {
        var proof = service.verify(base(CheckInMethod.NFC), team(), tokenRequest("nfc", "ab12cd34"), now);

        assertEquals(CheckInMethod.NFC, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
        assertEquals(now, proof.checkedInAt());
        assertNull(proof.proofLat());
        assertNull(proof.teamPositionsSnapshotJson());
    }

    @Test
    void qrTokenProofVerifiesAtQrBase() {
        var proof = service.verify(base(CheckInMethod.QR), team(), tokenRequest("qr", "ab12cd34"), now);

        assertEquals(CheckInMethod.QR, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
    }

    @Test
    void wrongTokenIsRejectedWithItsOwnCode() {
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(base(CheckInMethod.NFC), team(), tokenRequest("nfc", "zz99zz99"), now));

        assertEquals(ErrorCode.CHECK_IN_TOKEN_INVALID, error.getErrorCode());
    }

    @Test
    void qrProofAtNfcBaseIsAMethodMismatch() {
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(base(CheckInMethod.NFC), team(), tokenRequest("qr", "ab12cd34"), now));

        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH, error.getErrorCode());
    }

    @Test
    void legacyBodyIsAcceptedAtNfcBases() {
        CheckInRequest legacy = new CheckInRequest();
        legacy.setNfcToken("ab12cd34");

        var proof = service.verify(base(CheckInMethod.NFC), team(), legacy, now);

        assertEquals(CheckInMethod.NFC, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
    }

    @Test
    void legacyBodyIsRejectedAtNonNfcBases() {
        CheckInRequest legacy = new CheckInRequest();
        legacy.setNfcToken("ab12cd34");

        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.QR), team(), legacy, now)).getErrorCode());
        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.LOCATION), team(), legacy, now)).getErrorCode());
    }

    @Test
    void emptyBodyStillReportsTheLegacyMissingTokenCode() {
        assertEquals(ErrorCode.NFC_TOKEN_REQUIRED,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.NFC), team(), new CheckInRequest(), now)).getErrorCode());
    }

    @Test
    void unknownMethodStringIsAMethodMismatch() {
        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.NFC), team(), tokenRequest("beacon", "x"), now))
                        .getErrorCode());
    }

    @Test
    void haversineMatchesAKnownDistance() {
        // One degree of latitude at the equator is ~111.19 km.
        double metres = CheckInVerificationService.haversineMeters(0.0, 0.0, 1.0, 0.0);
        assertEquals(111195.0, metres, 50.0);
    }

    @Test
    void wideRingIsTheLargerOfThreeRadiiAndFiftyMetres() {
        assertEquals(50.0, CheckInVerificationService.wideRingM(10));
        assertEquals(90.0, CheckInVerificationService.wideRingM(30));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.CheckInVerificationServiceTest'
```

Expected: compilation failure — `cannot find symbol: class CheckInVerificationService`, `cannot find symbol: method setMethod(String)` on `CheckInRequest`, `cannot find symbol: variable CHECK_IN_TOKEN_INVALID`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/exception/ErrorCode.java`, insert immediately after `NFC_TOKEN_REQUIRED,` (line 78):

```java
    // ── Check-in ─────────────────────────────────────────────────────────
    /** The submitted proof type does not match the base's configured method. */
    CHECK_IN_METHOD_MISMATCH,
    /** The NFC or QR token does not match the base token. */
    CHECK_IN_TOKEN_INVALID,
    /** GPS accuracy is missing, non-finite, or worse than the cap for this proof. */
    CHECK_IN_FIX_TOO_COARSE,
    /** The fix's capturedAt is more than 10 min ahead or more than 24 h behind now. */
    CHECK_IN_FIX_STALE,
    /**
     * An automatic geo proof landed outside the accepted distance. Details
     * carry {@code distanceM} and {@code allowedM}, both rounded to metres.
     */
    CHECK_IN_OUT_OF_RANGE,
    /**
     * An "I'm here" claim failed the dwell rule. Details carry {@code reason}:
     * {@code too_few_fixes}, {@code span_too_short}, {@code outside_ring},
     * {@code fix_too_coarse}, or {@code buffer_stale}.
     */
    CHECK_IN_CLAIM_NOT_DWELLED,
```

Replace `backend/src/main/java/com/prayer/pointfinder/dto/request/CheckInRequest.java` entirely:

```java
package com.prayer.pointfinder.dto.request;

import lombok.Data;

import java.time.Instant;
import java.util.List;

/**
 * Discriminated check-in proof.
 *
 * <p>Three shapes travel through this one class because the endpoint is a
 * single POST per base and the valid shape depends on the base's configured
 * method, which the client does not get to choose:
 *
 * <pre>
 * { "method": "nfc", "token": "ab12cd34" }
 * { "method": "qr",  "token": "ab12cd34" }
 * { "method": "geo", "lat": 41.1, "lng": -8.6, "accuracy": 8.5,
 *   "capturedAt": "2026-09-05T10:00:00Z", "claimed": false }
 * { "method": "geo", ..., "claimed": true, "dwell": [ { ...fix... } x4+ ] }
 * </pre>
 *
 * <p>The legacy body {@code {"nfcToken": "ab12cd34"}} stays accepted and is
 * treated as {@code method: "nfc"}. It is only valid at NFC bases, so the
 * legacy iOS and Android apps keep working for the games they can complete.
 *
 * <p>Structural validation lives in
 * {@link com.prayer.pointfinder.service.CheckInVerificationService} rather
 * than in bean-validation annotations, because which fields are required
 * depends on the base's method — something the DTO cannot see.
 */
@Data
public class CheckInRequest {

    /** {@code nfc}, {@code qr}, or {@code geo}. Null means the legacy body. */
    private String method;

    /** Token for {@code nfc} and {@code qr} proofs. */
    private String token;

    /** Legacy field, equivalent to {@code method: "nfc"} with this token. */
    private String nfcToken;

    private Double lat;
    private Double lng;

    /** Reported horizontal accuracy in metres for a {@code geo} proof. */
    private Double accuracy;

    /** When the phone captured the fix. */
    private Instant capturedAt;

    /** True when the player pressed "I'm here" instead of GPS confirming. */
    private Boolean claimed;

    /** Dwell buffer backing a claim. Required only when {@code claimed}. */
    private List<FixDto> dwell;

    /** One sampled GPS fix from the dwell buffer. */
    @Data
    public static class FixDto {
        private Double lat;
        private Double lng;
        private Double accuracy;
        private Instant capturedAt;
    }
}
```

Create `backend/src/main/java/com/prayer/pointfinder/service/CheckInVerificationService.java` (the geo paths are filled in by Tasks 4 and 5; this task lands the class, the constants, the dispatch and the token path):

```java
package com.prayer.pointfinder.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

/**
 * Single home for every check-in proof rule.
 *
 * <p>The service is deliberately separate from {@code PlayerService}: the
 * rules are the security boundary of the whole game (they are what stops a
 * team collecting bases from the car park), they are shared by the player
 * endpoint and any future intake, and they are the part the phone mirrors in
 * {@code packages/game-core} so the client pre-check and the server verdict
 * agree. Keeping them in one class means the mirror has exactly one source.
 *
 * <p>Spec: docs/specs/2026-09-05-check-in-methods-design.md
 */
@Service
@RequiredArgsConstructor
public class CheckInVerificationService {

    /** Radius clamp, shared with the operator write paths. */
    public static final int MIN_RADIUS_M = 5;
    public static final int MAX_RADIUS_M = 200;

    /** A fix worse than this cannot confirm an automatic arrival. */
    public static final double AUTO_ACCURACY_CAP_M = 50.0;
    /** How much accuracy credit an automatic proof may borrow, at most. */
    public static final double ACCURACY_CREDIT_CAP_M = 30.0;
    /** A claim tolerates a worse fix, because it is gated by the dwell instead. */
    public static final double CLAIM_ACCURACY_CAP_M = 100.0;

    /** Offline queues replay late; clock skew runs slightly fast. */
    public static final Duration STALE_PAST = Duration.ofHours(24);
    public static final Duration STALE_FUTURE = Duration.ofMinutes(10);

    public static final int DWELL_MIN_FIXES = 4;
    public static final long DWELL_MIN_SPAN_MS = 60_000L;
    public static final long DWELL_MAX_GAP_TO_MAIN_MS = 120_000L;

    public static final double EARTH_RADIUS_M = 6_371_000.0;

    private final PlayerRepository playerRepository;
    private final PlayerLocationRepository playerLocationRepository;
    private final ObjectMapper objectMapper;

    /**
     * Everything the caller needs to write the check-in row. Returned instead
     * of mutating a passed-in entity so the verification step stays free of
     * persistence concerns and is trivial to unit-test.
     *
     * @param teammatesInRing  teammates inside the wider ring at claim time;
     *                         null unless the verification is CLAIMED
     * @param teammatesTotal   players on the team at claim time; null unless CLAIMED
     */
    public record VerifiedProof(
            CheckInMethod method,
            CheckInVerification verification,
            Double proofLat,
            Double proofLng,
            Double proofAccuracyM,
            Double proofDistanceM,
            Instant proofCapturedAt,
            String teamPositionsSnapshotJson,
            Instant checkedInAt,
            Integer teammatesInRing,
            Integer teammatesTotal
    ) {}

    /**
     * Verifies the submitted proof against the base's configured method.
     * Called after the live-game, team and base guards, after the dedup, and
     * after the base-order rule — so a team blocked by the route never learns
     * whether its proof would have been good.
     */
    public VerifiedProof verify(Base base, Team team, CheckInRequest request, Instant now) {
        CheckInMethod baseMethod = base.getCheckInMethod() != null
                ? base.getCheckInMethod() : CheckInMethod.NFC;
        boolean legacyBody = request == null || request.getMethod() == null;
        String proofType = resolveProofType(request);

        if (legacyBody) {
            // The legacy body carries no method discriminator, so we can only
            // honour it where it has always meant the same thing.
            if (baseMethod != CheckInMethod.NFC) {
                throw methodMismatch(baseMethod);
            }
        } else if (!proofType.equals(expectedProofType(baseMethod))) {
            throw methodMismatch(baseMethod);
        }

        return switch (baseMethod) {
            case NFC, QR -> verifyToken(base, baseMethod, request, legacyBody, now);
            case LOCATION -> Boolean.TRUE.equals(request.getClaimed())
                    ? verifyClaim(base, team, request, now)
                    : verifyAuto(base, request, now);
        };
    }

    // ── Dispatch helpers ─────────────────────────────────────────────────

    private String resolveProofType(CheckInRequest request) {
        if (request == null) {
            throw new BadRequestException("A check-in proof is required", ErrorCode.NFC_TOKEN_REQUIRED);
        }
        String method = request.getMethod();
        if (method == null) {
            if (request.getNfcToken() == null || request.getNfcToken().isBlank()) {
                throw new BadRequestException("NFC token is required for check-in",
                        ErrorCode.NFC_TOKEN_REQUIRED);
            }
            return "nfc";
        }
        String normalized = method.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "nfc", "qr", "geo" -> normalized;
            default -> throw new BadRequestException("Unknown check-in method: " + method,
                    ErrorCode.CHECK_IN_METHOD_MISMATCH);
        };
    }

    private String expectedProofType(CheckInMethod method) {
        return switch (method) {
            case NFC -> "nfc";
            case QR -> "qr";
            case LOCATION -> "geo";
        };
    }

    private BadRequestException methodMismatch(CheckInMethod baseMethod) {
        return new BadRequestException(
                "This base is checked in by " + baseMethod.name().toLowerCase(Locale.ROOT),
                ErrorCode.CHECK_IN_METHOD_MISMATCH);
    }

    // ── Token proofs ─────────────────────────────────────────────────────

    private VerifiedProof verifyToken(Base base, CheckInMethod method, CheckInRequest request,
                                      boolean legacyBody, Instant now) {
        String submitted = legacyBody ? request.getNfcToken() : request.getToken();
        if (submitted == null || submitted.isBlank()) {
            throw new BadRequestException("A check-in token is required", ErrorCode.NFC_TOKEN_REQUIRED);
        }
        String expected = base.getNfcToken() != null ? base.getNfcToken() : "";
        // Constant-time compare: the token is short and guessable-by-timing is
        // a real attack when the reward is a base you never walked to.
        if (!MessageDigest.isEqual(submitted.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8))) {
            throw new BadRequestException("Invalid check-in token", ErrorCode.CHECK_IN_TOKEN_INVALID);
        }
        return new VerifiedProof(method, CheckInVerification.VERIFIED,
                null, null, null, null, null, null, now, null, null);
    }

    // ── Geo proofs (Tasks 4 and 5) ───────────────────────────────────────

    private VerifiedProof verifyAuto(Base base, CheckInRequest request, Instant now) {
        throw new UnsupportedOperationException("Implemented in Task 4");
    }

    private VerifiedProof verifyClaim(Base base, Team team, CheckInRequest request, Instant now) {
        throw new UnsupportedOperationException("Implemented in Task 5");
    }

    // ── Geometry ─────────────────────────────────────────────────────────

    /** Great-circle distance in metres. Mirrored in {@code packages/game-core}. */
    public static double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** The wider ring a claim must sit inside: {@code max(3 * radius, 50)}. */
    public static double wideRingM(int radiusM) {
        return Math.max(3.0 * radiusM, 50.0);
    }

    /** Clamps an operator-supplied radius into the supported 5..200 m band. */
    public static int clampRadiusM(int radiusM) {
        return Math.max(MIN_RADIUS_M, Math.min(MAX_RADIUS_M, radiusM));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.CheckInVerificationServiceTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 4: Automatic geo proof — accuracy cap, staleness, distance rule

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/CheckInVerificationService.java` (replace the `verifyAuto` stub; add shared fix helpers)
- Test: `backend/src/test/java/com/prayer/pointfinder/service/CheckInGeoProofTest.java` (create)

**Interfaces:**
- Consumes: `CheckInRequest.lat/lng/accuracy/capturedAt`, `Base.resolvedCheckInRadiusM()`
- Produces: `VerifiedProof(LOCATION, VERIFIED, lat, lng, accuracy, distance, capturedAt, null, capturedAt, null, null)`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/CheckInGeoProofTest.java`:

```java
package com.prayer.pointfinder.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * Automatic ("the GPS confirmed it") geo proof. Accepts when
 * {@code distance <= radius + min(accuracy, 30)}; the row is VERIFIED and is
 * stamped with the moment the phone captured the fix, not receipt time, so an
 * offline replay does not backdate or postdate the arrival.
 */
class CheckInGeoProofTest {

    private final CheckInVerificationService service = new CheckInVerificationService(
            mock(PlayerRepository.class), mock(PlayerLocationRepository.class), new ObjectMapper());

    private final Instant now = Instant.parse("2026-09-05T10:00:00Z");
    private static final double BASE_LAT = 41.100000;
    private static final double BASE_LNG = -8.600000;

    private Base locationBase(Integer radiusOverride, int gameDefaultRadius) {
        Game game = Game.builder().id(UUID.randomUUID()).defaultCheckInRadiusM(gameDefaultRadius).build();
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Meadow")
                .lat(BASE_LAT)
                .lng(BASE_LNG)
                .nfcToken("ab12cd34")
                .checkInMethod(CheckInMethod.LOCATION)
                .checkInRadiusM(radiusOverride)
                .build();
    }

    private Team team() {
        return Team.builder().id(UUID.randomUUID()).name("Wolves").build();
    }

    /** Offsets a latitude by roughly {@code metres} to the north. */
    private static double latOffset(double metres) {
        return BASE_LAT + metres / 111_195.0;
    }

    private CheckInRequest geo(double lat, double accuracy, Instant capturedAt) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(lat);
        request.setLng(BASE_LNG);
        request.setAccuracy(accuracy);
        request.setCapturedAt(capturedAt);
        request.setClaimed(false);
        return request;
    }

    @Test
    void fixInsideTheRadiusIsVerifiedAndStampedWithCaptureTime() {
        Instant capturedAt = now.minus(3, ChronoUnit.MINUTES);
        var proof = service.verify(locationBase(20, 15), team(), geo(latOffset(10), 8.0, capturedAt), now);

        assertEquals(CheckInMethod.LOCATION, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
        assertEquals(capturedAt, proof.checkedInAt());
        assertEquals(capturedAt, proof.proofCapturedAt());
        assertEquals(8.0, proof.proofAccuracyM());
        assertTrue(proof.proofDistanceM() > 9.0 && proof.proofDistanceM() < 11.0);
    }

    @Test
    void accuracyCreditExtendsTheRadiusButIsCappedAtThirtyMetres() {
        // radius 20 + min(45, 30) = 50 m allowed.
        var accepted = service.verify(locationBase(20, 15), team(), geo(latOffset(48), 45.0, now), now);
        assertEquals(CheckInVerification.VERIFIED, accepted.verification());

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), geo(latOffset(60), 45.0, now), now));
        assertEquals(ErrorCode.CHECK_IN_OUT_OF_RANGE, error.getErrorCode());
        assertEquals("50", error.getErrors().get("allowedM"));
        assertEquals("60", error.getErrors().get("distanceM"));
    }

    @Test
    void gameDefaultRadiusAppliesWhenTheBaseHasNoOverride() {
        // Game default 40 + min(5, 30) = 45 m allowed.
        var proof = service.verify(locationBase(null, 40), team(), geo(latOffset(43), 5.0, now), now);
        assertEquals(CheckInVerification.VERIFIED, proof.verification());

        assertEquals(ErrorCode.CHECK_IN_OUT_OF_RANGE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(null, 40), team(), geo(latOffset(60), 5.0, now), now))
                .getErrorCode());
    }

    @Test
    void accuracyWorseThanFiftyMetresIsRejected() {
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), geo(latOffset(1), 51.0, now), now))
                .getErrorCode());
    }

    @Test
    void missingOrNonFiniteAccuracyIsRejected() {
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), geo(latOffset(1), Double.NaN, now), now))
                .getErrorCode());

        CheckInRequest noAccuracy = geo(latOffset(1), 5.0, now);
        noAccuracy.setAccuracy(null);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), noAccuracy, now)).getErrorCode());
    }

    @Test
    void fixesOlderThanADayOrMoreThanTenMinutesAheadAreStale() {
        assertEquals(ErrorCode.CHECK_IN_FIX_STALE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(),
                        geo(latOffset(1), 5.0, now.minus(25, ChronoUnit.HOURS)), now)).getErrorCode());

        assertEquals(ErrorCode.CHECK_IN_FIX_STALE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(),
                        geo(latOffset(1), 5.0, now.plus(11, ChronoUnit.MINUTES)), now)).getErrorCode());

        // Just inside both edges.
        assertEquals(CheckInVerification.VERIFIED, service.verify(locationBase(20, 15), team(),
                geo(latOffset(1), 5.0, now.minus(23, ChronoUnit.HOURS)), now).verification());
        assertEquals(CheckInVerification.VERIFIED, service.verify(locationBase(20, 15), team(),
                geo(latOffset(1), 5.0, now.plus(9, ChronoUnit.MINUTES)), now).verification());
    }

    @Test
    void missingOrNonFiniteCoordinatesAreRejected() {
        CheckInRequest noLat = geo(latOffset(1), 5.0, now);
        noLat.setLat(null);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), noLat, now)).getErrorCode());

        CheckInRequest infiniteLng = geo(latOffset(1), 5.0, now);
        infiniteLng.setLng(Double.POSITIVE_INFINITY);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), infiniteLng, now)).getErrorCode());
    }

    @Test
    void geoProofAtAnNfcBaseIsAMethodMismatch() {
        Base nfcBase = Base.builder()
                .id(UUID.randomUUID())
                .game(Game.builder().id(UUID.randomUUID()).build())
                .lat(BASE_LAT).lng(BASE_LNG).nfcToken("ab12cd34")
                .checkInMethod(CheckInMethod.NFC)
                .build();

        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH, assertThrows(BadRequestException.class,
                () -> service.verify(nfcBase, team(), geo(latOffset(1), 5.0, now), now)).getErrorCode());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.CheckInGeoProofTest'
```

Expected: every test fails with `UnsupportedOperationException: Implemented in Task 4` thrown from `verifyAuto`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/service/CheckInVerificationService.java`, add the imports

```java
import java.util.Map;
```

and replace the `verifyAuto` stub with the implementation plus the shared fix helpers (leave the `verifyClaim` stub in place for Task 5):

```java
    private VerifiedProof verifyAuto(Base base, CheckInRequest request, Instant now) {
        double accuracy = requireAccuracy(request.getAccuracy(), AUTO_ACCURACY_CAP_M);
        Instant capturedAt = requireFreshFix(request.getCapturedAt(), now);
        double lat = requireCoordinate(request.getLat(), 90.0);
        double lng = requireCoordinate(request.getLng(), 180.0);

        int radiusM = clampRadiusM(base.resolvedCheckInRadiusM());
        double distanceM = haversineMeters(lat, lng, base.getLat(), base.getLng());
        // A phone that says "±25 m" is honestly uncertain, so we widen the ring
        // by its own stated uncertainty — but only up to 30 m, otherwise a
        // deliberately degraded fix would unlock a base from streets away.
        double allowedM = radiusM + Math.min(accuracy, ACCURACY_CREDIT_CAP_M);

        if (distanceM > allowedM) {
            throw new BadRequestException("You are too far from this base",
                    ErrorCode.CHECK_IN_OUT_OF_RANGE,
                    Map.of("distanceM", metres(distanceM), "allowedM", metres(allowedM)));
        }

        // checked_in_at is the capture time, not receipt time: a proof queued
        // offline and synced an hour later still records when the team arrived.
        return new VerifiedProof(CheckInMethod.LOCATION, CheckInVerification.VERIFIED,
                lat, lng, accuracy, distanceM, capturedAt, null, capturedAt, null, null);
    }

    // ── Shared fix validation ────────────────────────────────────────────

    private double requireAccuracy(Double accuracy, double capM) {
        if (accuracy == null || !Double.isFinite(accuracy) || accuracy < 0 || accuracy > capM) {
            throw new BadRequestException("The GPS fix is not accurate enough to confirm this base",
                    ErrorCode.CHECK_IN_FIX_TOO_COARSE);
        }
        return accuracy;
    }

    private Instant requireFreshFix(Instant capturedAt, Instant now) {
        if (capturedAt == null
                || capturedAt.isBefore(now.minus(STALE_PAST))
                || capturedAt.isAfter(now.plus(STALE_FUTURE))) {
            throw new BadRequestException("This location fix is out of date",
                    ErrorCode.CHECK_IN_FIX_STALE);
        }
        return capturedAt;
    }

    /**
     * A missing or non-finite coordinate is reported as a coarse fix rather
     * than as its own code: from the player's side it is the same situation —
     * the phone did not produce a usable position.
     */
    private double requireCoordinate(Double value, double absoluteMax) {
        if (value == null || !Double.isFinite(value) || Math.abs(value) > absoluteMax) {
            throw new BadRequestException("The GPS fix is not usable",
                    ErrorCode.CHECK_IN_FIX_TOO_COARSE);
        }
        return value;
    }

    /** Error detail values are strings; metres are rounded so copy reads well. */
    private static String metres(double value) {
        return Long.toString(Math.round(value));
    }
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.CheckInGeoProofTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 5: Claimed proof — wide ring, dwell rule, teammate snapshot

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/CheckInVerificationService.java` (replace the `verifyClaim` stub)
- Test: `backend/src/test/java/com/prayer/pointfinder/service/CheckInClaimProofTest.java` (create)

**Interfaces:**
- Consumes: `PlayerRepository.findByTeamId(UUID)`, `PlayerLocationRepository.findById(UUID)`, `ObjectMapper`
- Produces: `VerifiedProof(LOCATION, CLAIMED, ..., teamPositionsSnapshotJson, now, teammatesInRing, teammatesTotal)`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/CheckInClaimProofTest.java`:

```java
package com.prayer.pointfinder.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The "I'm here" escape hatch. The claim is always accepted into the game —
 * a team stuck under tree cover must not be stranded — but it is recorded as
 * CLAIMED and carries a snapshot of where every teammate's phone last was, so
 * an operator can see afterwards whether the team was really there.
 */
class CheckInClaimProofTest {

    private final PlayerRepository playerRepository = mock(PlayerRepository.class);
    private final PlayerLocationRepository playerLocationRepository = mock(PlayerLocationRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CheckInVerificationService service =
            new CheckInVerificationService(playerRepository, playerLocationRepository, objectMapper);

    private final Instant now = Instant.parse("2026-09-05T10:00:00Z");
    private static final double BASE_LAT = 41.100000;
    private static final double BASE_LNG = -8.600000;

    private static double latOffset(double metres) {
        return BASE_LAT + metres / 111_195.0;
    }

    /** radius 20 → wide ring max(60, 50) = 60 m. */
    private Base locationBase() {
        Game game = Game.builder().id(UUID.randomUUID()).defaultCheckInRadiusM(15).build();
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Meadow")
                .lat(BASE_LAT)
                .lng(BASE_LNG)
                .nfcToken("ab12cd34")
                .checkInMethod(CheckInMethod.LOCATION)
                .checkInRadiusM(20)
                .build();
    }

    private Team team() {
        return Team.builder().id(UUID.randomUUID()).name("Wolves").build();
    }

    private CheckInRequest.FixDto fix(double metresFromBase, double accuracy, Instant capturedAt) {
        CheckInRequest.FixDto dto = new CheckInRequest.FixDto();
        dto.setLat(latOffset(metresFromBase));
        dto.setLng(BASE_LNG);
        dto.setAccuracy(accuracy);
        dto.setCapturedAt(capturedAt);
        return dto;
    }

    /** Four samples spanning 90 s, all 40 m out, ending 10 s before the main fix. */
    private List<CheckInRequest.FixDto> goodBuffer() {
        List<CheckInRequest.FixDto> buffer = new ArrayList<>();
        buffer.add(fix(40, 30.0, now.minus(100, ChronoUnit.SECONDS)));
        buffer.add(fix(40, 30.0, now.minus(70, ChronoUnit.SECONDS)));
        buffer.add(fix(40, 30.0, now.minus(40, ChronoUnit.SECONDS)));
        buffer.add(fix(40, 30.0, now.minus(10, ChronoUnit.SECONDS)));
        return buffer;
    }

    private CheckInRequest claim(double metresFromBase, double accuracy, List<CheckInRequest.FixDto> dwell) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(latOffset(metresFromBase));
        request.setLng(BASE_LNG);
        request.setAccuracy(accuracy);
        request.setCapturedAt(now);
        request.setClaimed(true);
        request.setDwell(dwell);
        return request;
    }

    private void stubTeam(Team team, Player... players) {
        when(playerRepository.findByTeamId(team.getId())).thenReturn(List.of(players));
    }

    private Player player(Team team, String name) {
        return Player.builder().id(UUID.randomUUID()).team(team).displayName(name).build();
    }

    @Test
    void validClaimIsAcceptedAsClaimedWithTeammateSnapshot() throws Exception {
        Team team = team();
        Player near = player(team, "Ana");
        Player far = player(team, "Bruno");
        stubTeam(team, near, far);
        when(playerLocationRepository.findById(near.getId())).thenReturn(Optional.of(PlayerLocation.builder()
                .player(near).lat(latOffset(30)).lng(BASE_LNG).accuracyM(12.0)
                .capturedAt(now.minus(30, ChronoUnit.SECONDS)).build()));
        when(playerLocationRepository.findById(far.getId())).thenReturn(Optional.of(PlayerLocation.builder()
                .player(far).lat(latOffset(500)).lng(BASE_LNG).accuracyM(9.0)
                .capturedAt(now.minus(60, ChronoUnit.SECONDS)).build()));

        var proof = service.verify(locationBase(), team, claim(40, 60.0, goodBuffer()), now);

        assertEquals(CheckInMethod.LOCATION, proof.method());
        assertEquals(CheckInVerification.CLAIMED, proof.verification());
        assertEquals(now, proof.checkedInAt());
        assertEquals(1, proof.teammatesInRing());
        assertEquals(2, proof.teammatesTotal());

        JsonNode snapshot = objectMapper.readTree(proof.teamPositionsSnapshotJson());
        assertEquals(2, snapshot.size());
        assertEquals("Ana", snapshot.get(0).get("displayName").asText());
        assertTrue(snapshot.get(0).get("distanceM").asDouble() > 25.0);
        assertEquals(30, snapshot.get(0).get("ageSeconds").asInt());
        assertEquals(12.0, snapshot.get(0).get("accuracyM").asDouble());
    }

    @Test
    void teammatesWithNoKnownPositionStillAppearInTheSnapshot() throws Exception {
        Team team = team();
        Player unknown = player(team, "Carla");
        stubTeam(team, unknown);
        when(playerLocationRepository.findById(any())).thenReturn(Optional.empty());

        var proof = service.verify(locationBase(), team, claim(40, 60.0, goodBuffer()), now);

        JsonNode snapshot = objectMapper.readTree(proof.teamPositionsSnapshotJson());
        assertEquals(1, snapshot.size());
        assertTrue(snapshot.get(0).get("lat").isNull());
        assertTrue(snapshot.get(0).get("distanceM").isNull());
        assertEquals(0, proof.teammatesInRing());
        assertEquals(1, proof.teammatesTotal());
    }

    @Test
    void mainFixOutsideTheWideRingIsRejected() {
        Team team = team();
        stubTeam(team);
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(80, 60.0, goodBuffer()), now));

        assertEquals(ErrorCode.CHECK_IN_CLAIM_NOT_DWELLED, error.getErrorCode());
        assertEquals("outside_ring", error.getErrors().get("reason"));
    }

    @Test
    void fewerThanFourDwellFixesIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> short3 = new ArrayList<>(goodBuffer().subList(0, 3));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, short3), now));

        assertEquals("too_few_fixes", error.getErrors().get("reason"));
    }

    @Test
    void missingDwellBufferIsRejected() {
        Team team = team();
        stubTeam(team);
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, null), now));

        assertEquals("too_few_fixes", error.getErrors().get("reason"));
    }

    @Test
    void bufferSpanningLessThanAMinuteIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> tight = List.of(
                fix(40, 30.0, now.minus(40, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(30, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(20, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(10, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, tight), now));

        assertEquals("span_too_short", error.getErrors().get("reason"));
    }

    @Test
    void aDwellFixOutsideTheRingIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> wandering = new ArrayList<>(goodBuffer());
        wandering.set(1, fix(400, 30.0, now.minus(70, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, wandering), now));

        assertEquals("outside_ring", error.getErrors().get("reason"));
    }

    @Test
    void aDwellFixWorseThanAHundredMetresIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> coarse = new ArrayList<>(goodBuffer());
        coarse.set(2, fix(40, 140.0, now.minus(40, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, coarse), now));

        assertEquals("fix_too_coarse", error.getErrors().get("reason"));
    }

    @Test
    void aBufferThatEndedMoreThanTwoMinutesBeforeTheClaimIsStale() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> old = List.of(
                fix(40, 30.0, now.minus(400, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(370, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(340, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(300, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, old), now));

        assertEquals("buffer_stale", error.getErrors().get("reason"));
    }

    @Test
    void mainClaimFixWorseThanAHundredMetresIsTooCoarse() {
        Team team = team();
        stubTeam(team);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 110.0, goodBuffer()), now)).getErrorCode());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.CheckInClaimProofTest'
```

Expected: every test fails with `UnsupportedOperationException: Implemented in Task 5` thrown from `verifyClaim`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/service/CheckInVerificationService.java`, add the imports

```java
import com.fasterxml.jackson.core.JsonProcessingException;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
```

and replace the `verifyClaim` stub with:

```java
    private VerifiedProof verifyClaim(Base base, Team team, CheckInRequest request, Instant now) {
        double accuracy = requireAccuracy(request.getAccuracy(), CLAIM_ACCURACY_CAP_M);
        Instant capturedAt = requireFreshFix(request.getCapturedAt(), now);
        double lat = requireCoordinate(request.getLat(), 90.0);
        double lng = requireCoordinate(request.getLng(), 180.0);

        int radiusM = clampRadiusM(base.resolvedCheckInRadiusM());
        double ringM = wideRingM(radiusM);
        double distanceM = haversineMeters(lat, lng, base.getLat(), base.getLng());
        if (distanceM > ringM) {
            throw claimNotDwelled("outside_ring");
        }

        List<CheckInRequest.FixDto> dwell = request.getDwell();
        if (dwell == null || dwell.size() < DWELL_MIN_FIXES) {
            throw claimNotDwelled("too_few_fixes");
        }

        Instant firstAt = null;
        Instant lastAt = null;
        for (CheckInRequest.FixDto sample : dwell) {
            if (sample == null || sample.getCapturedAt() == null) {
                throw claimNotDwelled("buffer_stale");
            }
            Double sampleAccuracy = sample.getAccuracy();
            if (sampleAccuracy == null || !Double.isFinite(sampleAccuracy)
                    || sampleAccuracy < 0 || sampleAccuracy > CLAIM_ACCURACY_CAP_M) {
                throw claimNotDwelled("fix_too_coarse");
            }
            if (sample.getLat() == null || sample.getLng() == null
                    || !Double.isFinite(sample.getLat()) || !Double.isFinite(sample.getLng())) {
                throw claimNotDwelled("outside_ring");
            }
            if (haversineMeters(sample.getLat(), sample.getLng(), base.getLat(), base.getLng()) > ringM) {
                throw claimNotDwelled("outside_ring");
            }
            if (firstAt == null || sample.getCapturedAt().isBefore(firstAt)) {
                firstAt = sample.getCapturedAt();
            }
            if (lastAt == null || sample.getCapturedAt().isAfter(lastAt)) {
                lastAt = sample.getCapturedAt();
            }
        }

        // A full minute inside the ring is what separates "I walked here and
        // the GPS is bad" from "I tapped the button while driving past".
        if (Duration.between(firstAt, lastAt).toMillis() < DWELL_MIN_SPAN_MS) {
            throw claimNotDwelled("span_too_short");
        }
        if (Math.abs(Duration.between(lastAt, capturedAt).toMillis()) > DWELL_MAX_GAP_TO_MAIN_MS) {
            throw claimNotDwelled("buffer_stale");
        }

        TeamSnapshot snapshot = snapshotTeammates(base, team, ringM, now);

        // checked_in_at is receipt time for a claim: nothing here proves the
        // team was at the base at capture time, so we record when they said so.
        return new VerifiedProof(CheckInMethod.LOCATION, CheckInVerification.CLAIMED,
                lat, lng, accuracy, distanceM, capturedAt, snapshot.json(), now,
                snapshot.inRing(), snapshot.total());
    }

    private BadRequestException claimNotDwelled(String reason) {
        return new BadRequestException("Stay near the base a little longer before claiming",
                ErrorCode.CHECK_IN_CLAIM_NOT_DWELLED, Map.of("reason", reason));
    }

    private record TeamSnapshot(String json, int inRing, int total) {}

    /**
     * Records where every teammate's phone last was, relative to this base.
     * This is the evidence behind a claim: one player claiming while the rest
     * of the team is two kilometres away looks very different from a whole
     * team standing in the same clearing under heavy canopy.
     */
    private TeamSnapshot snapshotTeammates(Base base, Team team, double ringM, Instant now) {
        List<Player> players = team != null && team.getId() != null
                ? playerRepository.findByTeamId(team.getId())
                : List.of();
        List<Map<String, Object>> entries = new ArrayList<>(players.size());
        int inRing = 0;

        for (Player player : players) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("playerId", player.getId() != null ? player.getId().toString() : null);
            entry.put("displayName", player.getDisplayName());

            PlayerLocation location = player.getId() != null
                    ? playerLocationRepository.findById(player.getId()).orElse(null)
                    : null;
            if (location == null || location.getLat() == null || location.getLng() == null) {
                entry.put("lat", null);
                entry.put("lng", null);
                entry.put("accuracyM", null);
                entry.put("ageSeconds", null);
                entry.put("distanceM", null);
            } else {
                double distanceM = haversineMeters(location.getLat(), location.getLng(),
                        base.getLat(), base.getLng());
                Instant at = location.getCapturedAt() != null
                        ? location.getCapturedAt() : location.getUpdatedAt();
                entry.put("lat", location.getLat());
                entry.put("lng", location.getLng());
                entry.put("accuracyM", location.getAccuracyM());
                entry.put("ageSeconds", at != null
                        ? Math.max(0L, Duration.between(at, now).getSeconds()) : null);
                entry.put("distanceM", Math.round(distanceM * 10.0) / 10.0);
                if (distanceM <= ringM) {
                    inRing++;
                }
            }
            entries.add(entry);
        }

        return new TeamSnapshot(writeJson(entries), inRing, players.size());
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            // The snapshot is built entirely from primitives we control, so a
            // failure here is a programming error, not a runtime condition.
            throw new IllegalStateException("Failed to serialize team position snapshot", ex);
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.CheckInClaimProofTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 6: PlayerService.checkIn rewrite, CheckInResponse fields, operator rescue verification

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/CheckInResponse.java` (add `method`, `verification`)
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java` (add field to the injected list at line ~47; rewrite `checkIn` lines 52–135; extend `buildCheckInResponse` lines 630–645)
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/TeamService.java` (`operatorCheckIn` builder ~line 197; `buildCheckInResponse` ~line 262)
- Test: `backend/src/test/java/com/prayer/pointfinder/service/PlayerServiceTest.java` (add mock + stubs to the two existing check-in tests)
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/PlayerCheckInMethodsTest.java` (create)

**Interfaces:**
- Consumes: `CheckInVerificationService.verify(Base, Team, CheckInRequest, Instant)`
- Produces: `CheckInResponse(UUID checkInId, UUID baseId, Instant checkedInAt, ChallengeInfo challenge, String method, String verification)`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/integration/PlayerCheckInMethodsTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.service.PlayerService;
import com.prayer.pointfinder.service.TeamService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * End-to-end check-in behaviour per base method, through the real service and
 * a real Postgres, including the legacy body and the operator rescue path.
 */
class PlayerCheckInMethodsTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    @Autowired
    private TeamService teamService;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private record Ctx(Game game, Team team, Player player, Base base, User operator) {}

    private Ctx ctx(String key, CheckInMethod method, Integer radiusM) {
        User operator = createOperator("method-" + key + "@test.com", "password");
        Game game = createGame(operator, "Method Game " + key, GameStatus.live);
        Team team = createTeam(game, "Wolves " + key, ("W" + key + "00001").substring(0, 6));
        Player player = createPlayer(team, "Scout", "device-" + key);
        Base base = createBase(game, "Base " + key);
        base.setLat(41.100000);
        base.setLng(-8.600000);
        base.setCheckInMethod(method);
        base.setCheckInRadiusM(radiusM);
        base = baseRepository.save(base);
        return new Ctx(game, team, player, base, operator);
    }

    private CheckInRequest token(String method, String value) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod(method);
        request.setToken(value);
        return request;
    }

    private CheckInRequest geo(double lat, double accuracy, Instant capturedAt) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(lat);
        request.setLng(-8.600000);
        request.setAccuracy(accuracy);
        request.setCapturedAt(capturedAt);
        request.setClaimed(false);
        return request;
    }

    @Test
    void qrBaseAcceptsQrTokenAndRecordsTheMethod() {
        Ctx c = ctx("qr", CheckInMethod.QR, null);

        CheckInResponse response = playerService.checkIn(
                c.game().getId(), c.base().getId(), c.player(), token("qr", c.base().getNfcToken()));

        assertEquals("QR", response.method());
        assertEquals("VERIFIED", response.verification());

        CheckIn row = checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId()).orElseThrow();
        assertEquals(CheckInMethod.QR, row.getMethod());
        assertEquals(CheckInVerification.VERIFIED, row.getVerification());
    }

    @Test
    void legacyBodyStillWorksAtNfcBasesAndFailsAtLocationBases() {
        Ctx nfc = ctx("lgn", CheckInMethod.NFC, null);
        CheckInResponse response = playerService.checkIn(
                nfc.game().getId(), nfc.base().getId(), nfc.player(), checkInRequestFor(nfc.base()));
        assertEquals("NFC", response.method());

        Ctx loc = ctx("lgl", CheckInMethod.LOCATION, 20);
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> playerService.checkIn(loc.game().getId(), loc.base().getId(), loc.player(),
                        checkInRequestFor(loc.base())));
        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH, error.getErrorCode());
    }

    @Test
    void locationBaseAcceptsANearbyFixAndStampsCaptureTime() {
        Ctx c = ctx("geo", CheckInMethod.LOCATION, 20);
        Instant capturedAt = Instant.now().minus(5, ChronoUnit.MINUTES);

        CheckInResponse response = playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                geo(41.100000 + 10.0 / 111_195.0, 8.0, capturedAt));

        assertEquals("LOCATION", response.method());
        assertEquals("VERIFIED", response.verification());

        CheckIn row = checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId()).orElseThrow();
        assertEquals(capturedAt.toEpochMilli(), row.getCheckedInAt().toEpochMilli());
        assertNotNull(row.getProofDistanceM());
        assertEquals(8.0, row.getProofAccuracyM());
    }

    @Test
    void locationBaseRejectsAFixFromFarAway() {
        Ctx c = ctx("far", CheckInMethod.LOCATION, 20);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                        geo(41.200000, 8.0, Instant.now())));

        assertEquals(ErrorCode.CHECK_IN_OUT_OF_RANGE, error.getErrorCode());
        assertNotNull(error.getErrors().get("distanceM"));
        assertNotNull(error.getErrors().get("allowedM"));
        assertEquals(List.of(), checkInRepository.findByTeamId(c.team().getId()));
    }

    @Test
    void repeatCheckInIsIdempotentRegardlessOfTheProofSent() {
        Ctx c = ctx("idm", CheckInMethod.LOCATION, 20);
        CheckInResponse first = playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                geo(41.100000, 8.0, Instant.now()));

        // A wildly out-of-range second attempt must return the existing row,
        // not a 400: the team already owns this base.
        CheckInResponse second = playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                geo(41.900000, 8.0, Instant.now()));

        assertEquals(first.checkInId(), second.checkInId());
        assertEquals(1, checkInRepository.findByTeamId(c.team().getId()).size());
    }

    @Test
    void operatorRescueIsRecordedAsOperatorVerification() {
        Ctx c = ctx("ops", CheckInMethod.LOCATION, 20);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(c.operator(), null, List.of()));

        CheckInResponse response = teamService.operatorCheckIn(
                c.game().getId(), c.team().getId(), c.base().getId());

        assertEquals("OPERATOR", response.verification());
        assertEquals("LOCATION", response.method());

        CheckIn row = checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId()).orElseThrow();
        assertEquals(CheckInVerification.OPERATOR, row.getVerification());
        assertEquals(CheckInMethod.LOCATION, row.getMethod());
    }
}
```

Also update `backend/src/test/java/com/prayer/pointfinder/service/PlayerServiceTest.java`:

Add the mock alongside the other `@Mock` fields (after `private QuotaService quotaService;`):

```java
    @Mock
    private CheckInVerificationService checkInVerificationService;
```

Add this private helper to the class (e.g. immediately above `checkInNotifiesOperatorsAfterSuccessfulCheckIn`):

```java
    /** PlayerService now delegates proof checking; stub a plain NFC pass. */
    private void stubVerifiedNfcProof() {
        when(checkInVerificationService.verify(any(), any(), any(), any()))
                .thenAnswer(inv -> new CheckInVerificationService.VerifiedProof(
                        com.prayer.pointfinder.entity.CheckInMethod.NFC,
                        com.prayer.pointfinder.entity.CheckInVerification.VERIFIED,
                        null, null, null, null, null, null, java.time.Instant.now(), null, null));
    }
```

Call `stubVerifiedNfcProof();` as the first statement of both `checkInNotifiesOperatorsAfterSuccessfulCheckIn` and `enforcedRouteRejectsLaterScanButAllowsTeamSpecificChallengeAfterPriorCheckIn`.

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.PlayerCheckInMethodsTest'
```

Expected: compilation failure — `cannot find symbol: method method()` / `verification()` on `CheckInResponse`, and `cannot find symbol: class CheckInVerificationService` in `PlayerServiceTest`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/dto/response/CheckInResponse.java`, extend the record and keep a four-argument compatibility constructor so existing controller tests keep compiling:

```java
public record CheckInResponse(
        UUID checkInId,
        UUID baseId,
        Instant checkedInAt,
        ChallengeInfo challenge,
        /** {@code NFC}, {@code QR}, or {@code LOCATION} — how this visit was proved. */
        String method,
        /** {@code VERIFIED}, {@code CLAIMED}, or {@code OPERATOR}. */
        String verification
) {
    /** Pre-check-in-methods shape; assumes a verified NFC tap. */
    public CheckInResponse(UUID checkInId, UUID baseId, Instant checkedInAt, ChallengeInfo challenge) {
        this(checkInId, baseId, checkedInAt, challenge, "NFC", "VERIFIED");
    }

    public record ChallengeInfo(
            UUID id,
            String title,
            String description,
            String content,
            String completionContent,
            String answerType,
            Boolean requirePresenceToSubmit
    ) {}
}
```

In `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java`, add the injected dependency after `private final PlayerJoinService playerJoinService;`:

```java
    private final CheckInVerificationService checkInVerificationService;
```

Replace the body of `checkIn` (from the "NFC token is required" comment through the `checkInRepository.save` block) so the order becomes dedup → base order → verify → save:

```java
        // Idempotency first: a team that already owns this base gets its
        // existing row back no matter what proof the phone re-sent. This runs
        // before verification so a repeat tap from inside a building, or a
        // rescue the operator already granted, never turns into an error.
        Optional<CheckIn> existing = checkInRepository.findByTeamIdAndBaseId(team.getId(), baseId);
        if (existing.isPresent()) {
            return buildCheckInResponse(existing.get(), base, team, gameId);
        }

        // Route order before proof: a team blocked by the route must not learn
        // whether its proof for a later base would have been accepted.
        if (Boolean.TRUE.equals(base.getGame().getEnforceBaseOrder())) {
            baseOrderService.requirePreviousBases(base.getGame(), team.getId(), baseId);
        }

        CheckInVerificationService.VerifiedProof proof =
                checkInVerificationService.verify(base, team, request, Instant.now());

        // Create new check-in.
        // V36 audit foundation: snapshot the player's device id (the player
        // FK already records the live identity; the snapshot survives later
        // player deletion). The display-name snapshot lives on the activity
        // event below because the existing check_ins schema does not need
        // it for the gameplay path — only the activity feed does.
        CheckIn checkIn = CheckIn.builder()
                .game(base.getGame())
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(proof.checkedInAt())
                .method(proof.method())
                .verification(proof.verification())
                .proofLat(proof.proofLat())
                .proofLng(proof.proofLng())
                .proofAccuracyM(proof.proofAccuracyM())
                .proofDistanceM(proof.proofDistanceM())
                .proofCapturedAt(proof.proofCapturedAt())
                .teamPositionsSnapshot(proof.teamPositionsSnapshotJson())
                .actorDeviceIdSnapshot(player.getDeviceId())
                .actorDisplayNameSnapshot(player.getDisplayName())
                .sourceSurface("player_app")
                .build();
        try {
            checkIn = checkInRepository.save(checkIn);
        } catch (DataIntegrityViolationException ex) {
            // Concurrent check-in won the race — return the existing one
            CheckIn existing2 = checkInRepository.findByTeamIdAndBaseId(team.getId(), baseId)
                    .orElseThrow(() -> new BadRequestException("Check-in failed"));
            return buildCheckInResponse(existing2, base, team, gameId);
        }
```

Keep the rest of the method (activity event, broadcast, push, return) unchanged for now; Task 13 adds the metadata.

Extend the tail of `PlayerService.buildCheckInResponse` so the row's recorded method and verification reach the client:

```java
        return new CheckInResponse(
                checkIn.getId(),
                base.getId(),
                checkIn.getCheckedInAt(),
                challengeInfo,
                checkIn.getMethod() != null ? checkIn.getMethod().name() : CheckInMethod.NFC.name(),
                checkIn.getVerification() != null
                        ? checkIn.getVerification().name() : CheckInVerification.VERIFIED.name());
```

In `backend/src/main/java/com/prayer/pointfinder/service/TeamService.java`, add to the `CheckIn.builder()` chain in `operatorCheckIn`, immediately after `.checkedInAt(Instant.now())`:

```java
                // A rescue proves nothing about presence; record the base's
                // own method so the audit shows what was bypassed, and mark
                // the row OPERATOR so it never reads as a player arrival.
                .method(base.getCheckInMethod() != null
                        ? base.getCheckInMethod() : com.prayer.pointfinder.entity.CheckInMethod.NFC)
                .verification(com.prayer.pointfinder.entity.CheckInVerification.OPERATOR)
```

and extend the tail of `TeamService.buildCheckInResponse` the same way as in `PlayerService`:

```java
        return new CheckInResponse(
                checkIn.getId(),
                base.getId(),
                checkIn.getCheckedInAt(),
                challengeInfo,
                checkIn.getMethod() != null
                        ? checkIn.getMethod().name()
                        : com.prayer.pointfinder.entity.CheckInMethod.NFC.name(),
                checkIn.getVerification() != null
                        ? checkIn.getVerification().name()
                        : com.prayer.pointfinder.entity.CheckInVerification.VERIFIED.name());
```

Add `import com.prayer.pointfinder.entity.CheckInMethod;` and `import com.prayer.pointfinder.entity.CheckInVerification;` to `PlayerService.java` if the wildcard `com.prayer.pointfinder.entity.*` import does not already cover them (it does — no change needed there).

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.PlayerCheckInMethodsTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.PlayerServiceTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.ManualCheckInTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 7: Location updates keep accuracy and capture time

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateLocationRequest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/controller/PlayerController.java` (line 183)
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java` (`updateLocation`, lines 554–598)
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/PlayerLocationFieldsTest.java` (create)

**Interfaces:**
- Produces: `PlayerService.updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng, Double accuracy, Instant capturedAt)` plus a four-argument overload that delegates with nulls.
- Produces: `UpdateLocationRequest.accuracy : Double`, `UpdateLocationRequest.capturedAt : Instant`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/integration/PlayerLocationFieldsTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The phone has always sent accuracy and capturedAt; the server used to throw
 * them away. Operators need accuracy to read the team-position map honestly,
 * and the claim snapshot needs capturedAt to report a fix's real age.
 */
class PlayerLocationFieldsTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    @Autowired
    private PlayerLocationRepository playerLocationRepository;

    private Player livePlayer(String key) {
        User operator = createOperator("locfield-" + key + "@test.com", "password");
        Game game = createGame(operator, "Loc Field " + key, GameStatus.live);
        Team team = createTeam(game, "Team " + key, ("L" + key + "00001").substring(0, 6));
        return createPlayer(team, "Scout", "device-" + key);
    }

    @Test
    void accuracyAndCapturedAtArePersisted() {
        Player player = livePlayer("a");
        Instant capturedAt = Instant.now().minus(20, ChronoUnit.SECONDS);

        playerService.updateLocation(player.getTeam().getGame().getId(), player,
                41.1, -8.6, 9.5, capturedAt);

        PlayerLocation stored = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertEquals(9.5, stored.getAccuracyM());
        assertEquals(capturedAt.toEpochMilli(), stored.getCapturedAt().toEpochMilli());
    }

    @Test
    void omittedFieldsStayNullAndDoNotBreakTheUpdate() {
        Player player = livePlayer("b");

        playerService.updateLocation(player.getTeam().getGame().getId(), player, 41.1, -8.6, null, null);

        PlayerLocation stored = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertNull(stored.getAccuracyM());
        assertNull(stored.getCapturedAt());
        assertEquals(41.1, stored.getLat());
    }

    @Test
    void nonFiniteAccuracyIsDiscardedRatherThanRejected() {
        Player player = livePlayer("c");

        playerService.updateLocation(player.getTeam().getGame().getId(), player,
                41.1, -8.6, Double.NaN, Instant.now());

        PlayerLocation stored = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertNull(stored.getAccuracyM());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.PlayerLocationFieldsTest'
```

Expected: compilation failure — `method updateLocation in class PlayerService cannot be applied to given types` (6 arguments supplied, 4 expected).

- [ ] **Step 3: Write minimal implementation**

Replace `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateLocationRequest.java`:

```java
package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.Instant;

@Data
public class UpdateLocationRequest {
    @NotNull
    private Double lat;

    @NotNull
    private Double lng;

    /**
     * Reported horizontal accuracy in metres. Optional so older clients keep
     * working; a non-finite value is discarded rather than rejected, because
     * a bad accuracy reading is not a reason to lose the position itself.
     */
    private Double accuracy;

    /** When the phone captured the fix, as opposed to when we received it. */
    private Instant capturedAt;
}
```

In `backend/src/main/java/com/prayer/pointfinder/controller/PlayerController.java`, line 183, pass the new fields:

```java
        playerService.updateLocation(gameId, player, request.getLat(), request.getLng(),
                request.getAccuracy(), request.getCapturedAt());
```

In `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java`, replace the `updateLocation` method with an overload pair:

```java
    /** Backwards-compatible overload for callers with no fix metadata. */
    @Transactional(timeout = 10)
    public void updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng) {
        updateLocation(gameId, authPlayer, lat, lng, null, null);
    }

    @Transactional(timeout = 10)
    public void updateLocation(UUID gameId, Player authPlayer, Double lat, Double lng,
                               Double accuracy, Instant capturedAt) {
        if (lat == null || lng == null || !Double.isFinite(lat) || !Double.isFinite(lng)
                || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new BadRequestException("Invalid coordinates");
        }

        // A garbage accuracy reading is not a reason to drop a good position:
        // keep the coordinates, forget the metadata.
        Double storedAccuracy = accuracy != null && Double.isFinite(accuracy) && accuracy >= 0
                ? accuracy : null;

        Player player = loadPlayer(authPlayer);

        Team team = player.getTeam();
        team.getId(); // force initialization

        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        ensureGameIsLiveForPlayerActions(team);

        PlayerLocation location = playerLocationRepository.findById(player.getId()).orElse(null);
        if (location == null) {
            location = PlayerLocation.builder()
                    .player(player)
                    .lat(lat)
                    .lng(lng)
                    .accuracyM(storedAccuracy)
                    .capturedAt(capturedAt)
                    .build();
        } else {
            location.setLat(lat);
            location.setLng(lng);
            location.setAccuracyM(storedAccuracy);
            location.setCapturedAt(capturedAt);
        }
        playerLocationRepository.save(location);

        Map<String, Object> locationData = new HashMap<>();
        locationData.put("teamId", team.getId());
        locationData.put("playerId", player.getId());
        locationData.put("displayName", player.getDisplayName());
        locationData.put("lat", lat);
        locationData.put("lng", lng);
        locationData.put("accuracyM", storedAccuracy);
        locationData.put("capturedAt", capturedAt != null ? capturedAt.toString() : null);
        locationData.put("updatedAt", Instant.now().toString());
        eventBroadcaster.broadcastLocationUpdate(gameId, locationData);
    }
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.PlayerLocationFieldsTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 8: Player base DTO carries the resolved method and radius, and hidden location bases ship as geofences

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/PlayerBaseResponse.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java` (`getBases` mapping ~line 324; `getGameData` hidden-base assembly ~lines 405–420)
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/PlayerGeofenceDataTest.java` (create)

**Interfaces:**
- Produces: `PlayerBaseResponse(UUID id, UUID gameId, Double lat, Double lng, Boolean nfcLinked, Boolean hidden, UUID fixedChallengeId, Integer sequenceNumber, String checkInMethod, Integer checkInRadiusM)` — `checkInMethod` and `checkInRadiusM` are resolved and never null.
- Produces: `GameDataResponse.bases` additionally contains geofence-only rows for hidden, unvisited `LOCATION` bases.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/integration/PlayerGeofenceDataTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.GameDataResponse;
import com.prayer.pointfinder.dto.response.PlayerBaseResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Hidden location bases have to reach the phone or arrival detection cannot
 * work offline — but only as bare geometry. A hidden NFC or QR base still
 * stays invisible, because there is nothing to detect until the player is
 * standing at the tag anyway.
 */
class PlayerGeofenceDataTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    private Base base(Game game, String name, CheckInMethod method, boolean hidden, Integer radiusM) {
        Base b = createBase(game, name);
        b.setCheckInMethod(method);
        b.setHidden(hidden);
        b.setCheckInRadiusM(radiusM);
        return baseRepository.save(b);
    }

    @Test
    void hiddenLocationBasesAreSentAsGeofenceOnlyRows() {
        User operator = createOperator("geofence@test.com", "password");
        Game game = createGame(operator, "Geofence Game", GameStatus.live);
        game.setDefaultCheckInRadiusM(25);
        game = gameRepository.save(game);
        Team team = createTeam(game, "Wolves", "GEO001");
        Player player = createPlayer(team, "Scout", "device-geofence");

        Base visible = base(game, "Visible", CheckInMethod.NFC, false, null);
        Base hiddenLocation = base(game, "Secret Clearing", CheckInMethod.LOCATION, true, 60);
        Base hiddenNfc = base(game, "Secret Tag", CheckInMethod.NFC, true, null);
        Challenge challenge = createChallenge(game, "C1", AnswerType.text, 10);
        visible.setFixedChallenge(challenge);
        baseRepository.save(visible);

        GameDataResponse data = playerService.getGameData(game.getId(), player);

        Optional<PlayerBaseResponse> geofence = data.bases().stream()
                .filter(b -> b.id().equals(hiddenLocation.getId())).findFirst();
        assertTrue(geofence.isPresent(), "hidden LOCATION base must be sent as a geofence");
        assertEquals("LOCATION", geofence.get().checkInMethod());
        assertEquals(60, geofence.get().checkInRadiusM());
        assertEquals(Boolean.TRUE, geofence.get().hidden());
        assertEquals(Boolean.FALSE, geofence.get().nfcLinked());
        assertNull(geofence.get().fixedChallengeId());

        assertFalse(data.bases().stream().anyMatch(b -> b.id().equals(hiddenNfc.getId())),
                "hidden NFC bases stay invisible");
    }

    @Test
    void visitedHiddenLocationBasesAreNotResentAsGeofences() {
        User operator = createOperator("geofence2@test.com", "password");
        Game game = createGame(operator, "Geofence Game 2", GameStatus.live);
        Team team = createTeam(game, "Otters", "GEO002");
        Player player = createPlayer(team, "Scout", "device-geofence2");
        createChallenge(game, "C1", AnswerType.text, 10);
        Base hiddenLocation = base(game, "Found Clearing", CheckInMethod.LOCATION, true, 30);

        checkInRepository.save(CheckIn.builder()
                .game(game).team(team).base(hiddenLocation).player(player)
                .checkedInAt(Instant.now()).sourceSurface("player_app").build());

        GameDataResponse data = playerService.getGameData(game.getId(), player);

        assertEquals(1, data.bases().stream()
                .filter(b -> b.id().equals(hiddenLocation.getId())).count(),
                "a visited hidden base must not be duplicated by the geofence pass");
    }

    @Test
    void visibleBasesCarryTheResolvedMethodAndRadius() {
        User operator = createOperator("resolved@test.com", "password");
        Game game = createGame(operator, "Resolved Game", GameStatus.live);
        game.setDefaultCheckInRadiusM(25);
        game = gameRepository.save(game);
        Team team = createTeam(game, "Badgers", "RES001");
        Player player = createPlayer(team, "Scout", "device-resolved");
        Base inherits = base(game, "Inherits", CheckInMethod.LOCATION, false, null);
        Base overrides = base(game, "Overrides", CheckInMethod.LOCATION, false, 80);

        var bases = playerService.getBases(game.getId(), player);

        assertEquals(25, bases.stream().filter(b -> b.id().equals(inherits.getId()))
                .findFirst().orElseThrow().checkInRadiusM());
        assertEquals(80, bases.stream().filter(b -> b.id().equals(overrides.getId()))
                .findFirst().orElseThrow().checkInRadiusM());
        assertEquals("LOCATION", bases.get(0).checkInMethod());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.PlayerGeofenceDataTest'
```

Expected: compilation failure — `cannot find symbol: method checkInMethod()` on `PlayerBaseResponse`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/dto/response/PlayerBaseResponse.java`, extend the record (keeping both existing convenience constructors so current call sites compile):

```java
public record PlayerBaseResponse(
    UUID id,
    UUID gameId,
    Double lat,
    Double lng,
    Boolean nfcLinked,
    Boolean hidden,
    UUID fixedChallengeId,
    Integer sequenceNumber,
    /**
     * Resolved check-in method: {@code NFC}, {@code QR}, or {@code LOCATION}.
     * Never null — the phone branches its whole check-in UI on this.
     */
    String checkInMethod,
    /**
     * Resolved radius in metres (base override, else the game default). Never
     * null, so the arrival detector never has to guess.
     */
    Integer checkInRadiusM
) {
    public PlayerBaseResponse(UUID id, UUID gameId, Double lat, Double lng, Boolean nfcLinked, Boolean hidden, UUID fixedChallengeId) {
        this(id, gameId, lat, lng, nfcLinked, hidden, fixedChallengeId, null, "NFC", 15);
    }

    public PlayerBaseResponse(UUID id, UUID gameId, Double lat, Double lng, Boolean nfcLinked, Boolean hidden, UUID fixedChallengeId, Integer sequenceNumber) {
        this(id, gameId, lat, lng, nfcLinked, hidden, fixedChallengeId, sequenceNumber, "NFC", 15);
    }
}
```

In `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java`, extend the `getBases` mapping (line ~324):

```java
                .map(base -> new PlayerBaseResponse(
                        base.getId(),
                        gameId,
                        base.getLat(),
                        base.getLng(),
                        base.getNfcLinked(),
                        base.getHidden(),
                        base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null,
                        sequenceNumbers.get(base.getId()),
                        base.getCheckInMethod().name(),
                        base.resolvedCheckInRadiusM()
                ))
```

In `getGameData`, immediately after the `hiddenUnlockTargetIds` block that appends hidden unlock-target bases (and before the "Load all relevant challenges" comment), append the geofence pass:

```java
        // Hidden LOCATION bases the team has not found yet ship as bare
        // geometry — id, coordinates, method, radius — and nothing else. The
        // arrival detector has to work offline and cannot ask the server
        // "am I near something?", so the ring has to be on the phone; but the
        // name, challenge and content stay behind until the base is earned.
        Set<UUID> alreadySent = bases.stream().map(PlayerBaseResponse::id).collect(Collectors.toSet());
        Set<UUID> visitedBaseIds = checkInRepository.findByGameIdAndTeamId(gameId, team.getId()).stream()
                .map(ci -> ci.getBase().getId())
                .collect(Collectors.toSet());
        List<PlayerBaseResponse> geofenceOnly = baseRepository.findByGameId(gameId).stream()
                .filter(b -> Boolean.TRUE.equals(b.getHidden()))
                .filter(b -> b.getCheckInMethod() == CheckInMethod.LOCATION)
                .filter(b -> !alreadySent.contains(b.getId()))
                .filter(b -> !visitedBaseIds.contains(b.getId()))
                .map(b -> new PlayerBaseResponse(
                        b.getId(),
                        gameId,
                        b.getLat(),
                        b.getLng(),
                        false,
                        true,
                        null,
                        null,
                        CheckInMethod.LOCATION.name(),
                        b.resolvedCheckInRadiusM()))
                .toList();
        if (!geofenceOnly.isEmpty()) {
            List<PlayerBaseResponse> withGeofences = new ArrayList<>(bases);
            withGeofences.addAll(geofenceOnly);
            bases = withGeofences;
        }
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.PlayerGeofenceDataTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.controller.PlayerControllerTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 9: Operator base DTOs, BaseService write paths, and the 0,0 guard

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/BaseResponse.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/CreateBaseRequest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateBaseRequest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/BaseService.java` (`createBase` ~lines 89–131, `updateBase` ~lines 133–209, `toResponse` ~lines 312–331, new private helpers)
- Test: `backend/src/test/java/com/prayer/pointfinder/service/BaseCheckInMethodServiceTest.java` (create)

**Interfaces:**
- Produces: `BaseResponse(..., UUID stageId, Integer sequenceNumber, String checkInMethod, Integer checkInRadiusM)` — `checkInRadiusM` is the raw override and may be null.
- Produces: `CreateBaseRequest.checkInMethod : String|null`, `CreateBaseRequest.checkInRadiusM : Integer|null` (`@Min(5) @Max(200)`); same on `UpdateBaseRequest`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/BaseCheckInMethodServiceTest.java`:

```java
package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Operator-side base editing for check-in methods: the game default seeds new
 * bases, an explicit method overrides it, the radius is clamped, and a
 * location base can never be saved at the null island.
 */
class BaseCheckInMethodServiceTest extends IntegrationTestBase {

    @Autowired
    private BaseService baseService;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private Game gameWithDefault(String key, CheckInMethod method, int radiusM) {
        User operator = createOperator("basemethod-" + key + "@test.com", "password");
        Game game = createGame(operator, "Base Method " + key, GameStatus.setup);
        game.setDefaultCheckInMethod(method);
        game.setDefaultCheckInRadiusM(radiusM);
        game = gameRepository.save(game);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        return game;
    }

    private CreateBaseRequest create(String name, Double lat, Double lng) {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName(name);
        request.setLat(lat);
        request.setLng(lng);
        return request;
    }

    @Test
    void newBasesInheritTheGameDefaultMethod() {
        Game game = gameWithDefault("inherit", CheckInMethod.QR, 25);

        BaseResponse created = baseService.createBase(game.getId(), create("Kiosk", 41.1, -8.6));

        assertEquals("QR", created.checkInMethod());
        assertNull(created.checkInRadiusM(), "no override means inherit");
    }

    @Test
    void anExplicitMethodAndRadiusWinOverTheDefault() {
        Game game = gameWithDefault("explicit", CheckInMethod.NFC, 15);
        CreateBaseRequest request = create("Clearing", 41.1, -8.6);
        request.setCheckInMethod("location");
        request.setCheckInRadiusM(45);

        BaseResponse created = baseService.createBase(game.getId(), request);

        assertEquals("LOCATION", created.checkInMethod());
        assertEquals(45, created.checkInRadiusM());
    }

    @Test
    void radiusIsClampedIntoTheSupportedBand() {
        Game game = gameWithDefault("clamp", CheckInMethod.LOCATION, 15);
        CreateBaseRequest tooSmall = create("Tiny", 41.1, -8.6);
        tooSmall.setCheckInRadiusM(1);
        CreateBaseRequest tooBig = create("Huge", 41.1, -8.6);
        tooBig.setCheckInRadiusM(9000);

        assertEquals(5, baseService.createBase(game.getId(), tooSmall).checkInRadiusM());
        assertEquals(200, baseService.createBase(game.getId(), tooBig).checkInRadiusM());
    }

    @Test
    void aLocationBaseCannotBeSavedAtNullIsland() {
        Game game = gameWithDefault("zero", CheckInMethod.LOCATION, 15);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> baseService.createBase(game.getId(), create("Nowhere", 0.0, 0.0)));

        assertEquals(true, error.getMessage().toLowerCase().contains("coordinates"));
    }

    @Test
    void anNfcBaseAtZeroZeroIsStillAllowed() {
        Game game = gameWithDefault("zeronfc", CheckInMethod.NFC, 15);

        BaseResponse created = baseService.createBase(game.getId(), create("Indoors", 0.0, 0.0));

        assertEquals("NFC", created.checkInMethod());
    }

    @Test
    void switchingAnExistingBaseToLocationAtZeroZeroIsRejected() {
        Game game = gameWithDefault("switch", CheckInMethod.NFC, 15);
        BaseResponse created = baseService.createBase(game.getId(), create("Indoors", 0.0, 0.0));

        UpdateBaseRequest update = new UpdateBaseRequest();
        update.setName("Indoors");
        update.setLat(0.0);
        update.setLng(0.0);
        update.setCheckInMethod("LOCATION");

        assertThrows(BadRequestException.class,
                () -> baseService.updateBase(game.getId(), created.id(), update));
    }

    @Test
    void anUnknownMethodStringIsRejected() {
        Game game = gameWithDefault("unknown", CheckInMethod.NFC, 15);
        CreateBaseRequest request = create("Odd", 41.1, -8.6);
        request.setCheckInMethod("beacon");

        assertThrows(BadRequestException.class, () -> baseService.createBase(game.getId(), request));
    }

    @Test
    void updateLeavesTheMethodAloneWhenTheFieldIsOmitted() {
        Game game = gameWithDefault("keep", CheckInMethod.QR, 15);
        BaseResponse created = baseService.createBase(game.getId(), create("Kiosk", 41.1, -8.6));

        UpdateBaseRequest update = new UpdateBaseRequest();
        update.setName("Kiosk renamed");
        update.setLat(41.1);
        update.setLng(-8.6);

        assertEquals("QR", baseService.updateBase(game.getId(), created.id(), update).checkInMethod());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.BaseCheckInMethodServiceTest'
```

Expected: compilation failure — `cannot find symbol: method setCheckInMethod(String)` on `CreateBaseRequest`, `cannot find symbol: method checkInMethod()` on `BaseResponse`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/dto/response/BaseResponse.java`, append two components and keep the existing 12-argument convenience constructor:

```java
        UUID stageId,
        Integer sequenceNumber,
        /** {@code NFC}, {@code QR}, or {@code LOCATION}. */
        String checkInMethod,
        /**
         * Raw per-base radius override in metres, or null when the base
         * inherits the game default. The operator UI shows the inherited value
         * as a hint, so it needs to know the difference.
         */
        Integer checkInRadiusM
) {
    public BaseResponse(UUID id, UUID gameId, String name, String description, Double lat, Double lng, Boolean nfcLinked, String nfcToken, Boolean hidden, UUID fixedChallengeId, List<UUID> tagIds, UUID stageId) {
        this(id, gameId, name, description, lat, lng, nfcLinked, nfcToken, hidden, fixedChallengeId, tagIds, stageId, null, "NFC", null);
    }

    public BaseResponse(UUID id, UUID gameId, String name, String description, Double lat, Double lng, Boolean nfcLinked, String nfcToken, Boolean hidden, UUID fixedChallengeId, List<UUID> tagIds, UUID stageId, Integer sequenceNumber) {
        this(id, gameId, name, description, lat, lng, nfcLinked, nfcToken, hidden, fixedChallengeId, tagIds, stageId, sequenceNumber, "NFC", null);
    }
}
```

In `backend/src/main/java/com/prayer/pointfinder/dto/request/CreateBaseRequest.java`, add the imports `jakarta.validation.constraints.Max` and `jakarta.validation.constraints.Min`, then append:

```java
    /**
     * {@code NFC}, {@code QR}, or {@code LOCATION}, case-insensitive. Null
     * means "use the game default", which is what the operator sees as the
     * pre-selected option in the base editor.
     */
    private String checkInMethod;

    /** Per-base radius override in metres. Null inherits the game default. */
    @Min(value = 5, message = "Check-in radius must be at least 5 m")
    @Max(value = 200, message = "Check-in radius must be at most 200 m")
    private Integer checkInRadiusM;
```

In `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateBaseRequest.java`, add the same imports and append:

```java
    /** Null leaves the base's current method untouched. */
    private String checkInMethod;

    /** Null leaves the current radius override untouched. */
    @Min(value = 5, message = "Check-in radius must be at least 5 m")
    @Max(value = 200, message = "Check-in radius must be at most 200 m")
    private Integer checkInRadiusM;
```

In `backend/src/main/java/com/prayer/pointfinder/service/BaseService.java`, add `import com.prayer.pointfinder.entity.CheckInMethod;` and `import java.util.Locale;`, then:

In `createBase`, replace the `Base.builder()` chain's `.hidden(...)` line region so the chain reads:

```java
        CheckInMethod checkInMethod = request.getCheckInMethod() != null
                ? parseCheckInMethod(request.getCheckInMethod())
                : (game.getDefaultCheckInMethod() != null ? game.getDefaultCheckInMethod() : CheckInMethod.NFC);
        Integer checkInRadiusM = clampRadius(request.getCheckInRadiusM());
        requireUsableCoordinates(checkInMethod, request.getLat(), request.getLng());

        Base base = Base.builder()
                .game(game)
                .orderIndex(baseRepository.findByGameId(gameId).stream()
                        .mapToInt(Base::getOrderIndex).max().orElse(-1) + 1)
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .lat(request.getLat())
                .lng(request.getLng())
                .nfcLinked(false)
                .nfcToken(generateNfcToken())
                .hidden(request.getHidden() != null ? request.getHidden() : false)
                .fixedChallenge(fixedChallenge)
                .checkInMethod(checkInMethod)
                .checkInRadiusM(checkInRadiusM)
                .build();
```

In `updateBase`, insert immediately after `base.setLng(request.getLng());`:

```java
        if (request.getCheckInMethod() != null) {
            base.setCheckInMethod(parseCheckInMethod(request.getCheckInMethod()));
        }
        if (request.getCheckInRadiusM() != null) {
            base.setCheckInRadiusM(clampRadius(request.getCheckInRadiusM()));
        }
        requireUsableCoordinates(base.getCheckInMethod(), request.getLat(), request.getLng());
```

Extend `toResponse(Base, Integer)`'s `new BaseResponse(...)` call with the two new trailing arguments:

```java
                base.getStageId(),
                sequenceNumber,
                base.getCheckInMethod() != null ? base.getCheckInMethod().name() : CheckInMethod.NFC.name(),
                base.getCheckInRadiusM()
        );
```

Add these private helpers to `BaseService` (next to `resolveTagIds`):

```java
    private CheckInMethod parseCheckInMethod(String raw) {
        try {
            return CheckInMethod.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new BadRequestException(
                    "Invalid check-in method: " + raw + ". Must be one of: NFC, QR, LOCATION");
        }
    }

    /** Null keeps the inherit-from-game behaviour; a value is clamped to 5..200. */
    private Integer clampRadius(Integer raw) {
        return raw == null ? null : CheckInVerificationService.clampRadiusM(raw);
    }

    /**
     * A location base at exactly 0,0 is never real — it is what a failed
     * coordinate parse used to produce. Since the ring is the only way to
     * reach such a base, saving one silently strands the whole game, so the
     * write is refused here as well as at go-live.
     */
    private void requireUsableCoordinates(CheckInMethod method, Double lat, Double lng) {
        if (method != CheckInMethod.LOCATION) {
            return;
        }
        if (lat == null || lng == null || (lat == 0.0 && lng == 0.0)) {
            throw new BadRequestException(
                    "A location base needs real coordinates — pick the spot on the map");
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.BaseCheckInMethodServiceTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.BaseServiceTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 10: Game DTOs carry the check-in defaults

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/GameResponse.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/CreateGameRequest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateGameRequest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/mapper/GameResponseMapper.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/GameService.java` (`createGame` ~line 119, `updateGame` ~line 163, new private helpers near `validateUnlockTrigger` ~line 305)
- Modify: `contract-snapshots/GameResponse.json`
- Test: `backend/src/test/java/com/prayer/pointfinder/service/GameCheckInDefaultsTest.java` (create)

**Interfaces:**
- Produces: `GameResponse(..., Boolean enforceBaseOrder, String defaultCheckInMethod, Integer defaultCheckInRadiusM)`
- Produces: `CreateGameRequest.defaultCheckInMethod/defaultCheckInRadiusM`, `UpdateGameRequest.defaultCheckInMethod/defaultCheckInRadiusM`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/GameCheckInDefaultsTest.java`:

```java
package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CreateGameRequest;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The game-level check-in default: what new bases inherit at creation.
 * Changing it later must not rewrite bases that already exist.
 */
class GameCheckInDefaultsTest extends IntegrationTestBase {

    @Autowired
    private GameService gameService;

    private void authenticate(String email) {
        User operator = createOperator(email, "password");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
    }

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void newGamesDefaultToNfcAtFifteenMetres() {
        authenticate("gamedefault-a@test.com");
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Plain Game");

        GameResponse created = gameService.createGame(request);

        assertEquals("NFC", created.defaultCheckInMethod());
        assertEquals(15, created.defaultCheckInRadiusM());
    }

    @Test
    void createAcceptsAnExplicitDefault() {
        authenticate("gamedefault-b@test.com");
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Trail Game");
        request.setDefaultCheckInMethod("location");
        request.setDefaultCheckInRadiusM(45);

        GameResponse created = gameService.createGame(request);

        assertEquals("LOCATION", created.defaultCheckInMethod());
        assertEquals(45, created.defaultCheckInRadiusM());
    }

    @Test
    void updateChangesTheDefaultAndClampsTheRadius() {
        authenticate("gamedefault-c@test.com");
        CreateGameRequest create = new CreateGameRequest();
        create.setName("Editable Game");
        GameResponse created = gameService.createGame(create);

        UpdateGameRequest update = new UpdateGameRequest();
        update.setName("Editable Game");
        update.setDefaultCheckInMethod("QR");
        update.setDefaultCheckInRadiusM(500);

        GameResponse updated = gameService.updateGame(created.id(), update);

        assertEquals("QR", updated.defaultCheckInMethod());
        assertEquals(200, updated.defaultCheckInRadiusM());
    }

    @Test
    void omittedFieldsOnUpdateLeaveTheDefaultAlone() {
        authenticate("gamedefault-d@test.com");
        CreateGameRequest create = new CreateGameRequest();
        create.setName("Stable Game");
        create.setDefaultCheckInMethod("LOCATION");
        create.setDefaultCheckInRadiusM(30);
        GameResponse created = gameService.createGame(create);

        UpdateGameRequest update = new UpdateGameRequest();
        update.setName("Stable Game renamed");

        GameResponse updated = gameService.updateGame(created.id(), update);

        assertEquals("LOCATION", updated.defaultCheckInMethod());
        assertEquals(30, updated.defaultCheckInRadiusM());
    }

    @Test
    void anUnknownDefaultMethodIsRejected() {
        authenticate("gamedefault-e@test.com");
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Bad Game");
        request.setDefaultCheckInMethod("beacon");

        assertThrows(BadRequestException.class, () -> gameService.createGame(request));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.GameCheckInDefaultsTest'
```

Expected: compilation failure — `cannot find symbol: method setDefaultCheckInMethod(String)` on `CreateGameRequest` and `defaultCheckInMethod()` on `GameResponse`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/dto/response/GameResponse.java`, append two components and keep the existing 15-argument convenience constructor:

```java
        Boolean enforceBaseOrder,
        /** Method copied onto new bases: {@code NFC}, {@code QR}, {@code LOCATION}. */
        String defaultCheckInMethod,
        /** Radius in metres used by location bases with no override. */
        Integer defaultCheckInRadiusM
) {
    public GameResponse(UUID id, String name, String description, Instant startDate, Instant endDate, String status, UUID createdBy, List<UUID> operatorIds, Boolean uniformAssignment, Boolean broadcastEnabled, String broadcastCode, String tileSource, String unlockTrigger, UUID orgId, String orgName) {
        this(id, name, description, startDate, endDate, status, createdBy, operatorIds, uniformAssignment, broadcastEnabled, broadcastCode, tileSource, unlockTrigger, orgId, orgName, false, "NFC", 15);
    }
}
```

In `backend/src/main/java/com/prayer/pointfinder/dto/request/CreateGameRequest.java` and `UpdateGameRequest.java`, append to both (adding `jakarta.validation.constraints.Max` / `Min` imports):

```java
    /** {@code NFC}, {@code QR}, or {@code LOCATION}, case-insensitive. */
    private String defaultCheckInMethod;

    /** Default location radius in metres; clamped to 5..200 on write. */
    @Min(value = 5, message = "Check-in radius must be at least 5 m")
    @Max(value = 200, message = "Check-in radius must be at most 200 m")
    private Integer defaultCheckInRadiusM;
```

In `backend/src/main/java/com/prayer/pointfinder/mapper/GameResponseMapper.java`, extend the `new GameResponse(...)` tail:

```java
                Boolean.TRUE.equals(game.getEnforceBaseOrder()),
                game.getDefaultCheckInMethod() != null
                        ? game.getDefaultCheckInMethod().name()
                        : com.prayer.pointfinder.entity.CheckInMethod.NFC.name(),
                game.getDefaultCheckInRadiusM() != null ? game.getDefaultCheckInRadiusM() : 15
        );
```

In `backend/src/main/java/com/prayer/pointfinder/service/GameService.java`, add to the `Game.builder()` chain in `createGame`, after `.unlockTrigger(...)`:

```java
                .defaultCheckInMethod(validateCheckInMethod(request.getDefaultCheckInMethod()))
                .defaultCheckInRadiusM(clampDefaultRadius(request.getDefaultCheckInRadiusM()))
```

and in `updateGame`, after the `unlockTrigger` block:

```java
        if (request.getDefaultCheckInMethod() != null) {
            game.setDefaultCheckInMethod(validateCheckInMethod(request.getDefaultCheckInMethod()));
        }
        if (request.getDefaultCheckInRadiusM() != null) {
            game.setDefaultCheckInRadiusM(clampDefaultRadius(request.getDefaultCheckInRadiusM()));
        }
```

Add these helpers beside `validateUnlockTrigger`:

```java
    /**
     * Null means "keep the product default of NFC", which is what an older
     * client that does not know about check-in methods will send.
     */
    private com.prayer.pointfinder.entity.CheckInMethod validateCheckInMethod(String raw) {
        if (raw == null || raw.isBlank()) {
            return com.prayer.pointfinder.entity.CheckInMethod.NFC;
        }
        try {
            return com.prayer.pointfinder.entity.CheckInMethod
                    .valueOf(raw.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(
                    "Invalid check-in method: " + raw + ". Must be one of: NFC, QR, LOCATION");
        }
    }

    private Integer clampDefaultRadius(Integer raw) {
        return raw == null ? 15 : CheckInVerificationService.clampRadiusM(raw);
    }
```

Update `contract-snapshots/GameResponse.json` to the full current shape (this also repairs the pre-existing drift, where `enforceBaseOrder` was missing after it was added to the DTO):

```json
{
  "id" : "d4e5f6a7-b8c9-0123-defa-234567890123",
  "name" : "Forest Adventure",
  "description" : "A scouting game in the forest",
  "startDate" : "2025-03-01T08:00:00Z",
  "endDate" : "2025-03-01T18:00:00Z",
  "status" : "live",
  "createdBy" : "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "operatorIds" : [ "a1b2c3d4-e5f6-7890-abcd-ef1234567890" ],
  "uniformAssignment" : false,
  "broadcastEnabled" : true,
  "broadcastCode" : "FOREST2025",
  "tileSource" : "osm-classic",
  "unlockTrigger" : "CHECK_IN",
  "orgId" : null,
  "orgName" : null,
  "enforceBaseOrder" : false,
  "defaultCheckInMethod" : "NFC",
  "defaultCheckInRadiusM" : 15
}
```

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.GameCheckInDefaultsTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.contract.DtoContractTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 11: Go-live readiness per method

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/GameReadinessValidator.java` (replace the NFC-linked block, lines 51–57; add the location block after it)
- Test: `backend/src/test/java/com/prayer/pointfinder/service/GameReadinessCheckInMethodTest.java` (create)

**Interfaces:**
- Consumes: `Base.getCheckInMethod()`, `Base.resolvedCheckInRadiusM()`, `CheckInVerificationService.haversineMeters`, `MIN_RADIUS_M`, `MAX_RADIUS_M`
- Produces: go-live rejection messages for unlinked NFC bases, 0,0 location bases, out-of-band radii, and overlapping location rings. QR bases always pass.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/GameReadinessCheckInMethodTest.java`:

```java
package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Go-live rules per check-in method. NFC bases still need a linked tag; QR
 * bases need nothing (the code is printed from the same token); location
 * bases need real coordinates, a sane radius, and rings that do not overlap —
 * two overlapping rings would let one arrival unlock two bases at once.
 */
class GameReadinessCheckInMethodTest extends IntegrationTestBase {

    @Autowired
    private GameReadinessValidator validator;

    private Game gameWithTeamAndChallenges(String key, int challengeCount) {
        User operator = createOperator("readiness-" + key + "@test.com", "password");
        Game game = createGame(operator, "Readiness " + key, GameStatus.setup);
        createTeam(game, "Team " + key, ("R" + key + "00001").substring(0, 6));
        for (int i = 0; i < challengeCount; i++) {
            createChallenge(game, "Challenge " + key + i, AnswerType.text, 10);
        }
        return game;
    }

    private Base base(Game game, String name, CheckInMethod method, boolean nfcLinked,
                      double lat, double lng, Integer radiusM) {
        Base b = Base.builder()
                .game(game)
                .name(name)
                .description("")
                .lat(lat)
                .lng(lng)
                .nfcLinked(nfcLinked)
                .checkInMethod(method)
                .checkInRadiusM(radiusM)
                .build();
        return baseRepository.save(b);
    }

    @Test
    void qrBasesNeedNoTagLink() {
        Game game = gameWithTeamAndChallenges("qr", 1);
        base(game, "Kiosk", CheckInMethod.QR, false, 41.1, -8.6, null);

        assertDoesNotThrow(() -> validator.validateGoLivePrerequisites(game));
    }

    @Test
    void locationBasesNeedNoTagLinkEither() {
        Game game = gameWithTeamAndChallenges("loc", 1);
        base(game, "Clearing", CheckInMethod.LOCATION, false, 41.1, -8.6, 20);

        assertDoesNotThrow(() -> validator.validateGoLivePrerequisites(game));
    }

    @Test
    void unlinkedNfcBasesStillBlockGoLiveAndTheMessageCountsOnlyNfcBases() {
        Game game = gameWithTeamAndChallenges("nfc", 2);
        base(game, "Tag", CheckInMethod.NFC, false, 41.1, -8.6, null);
        base(game, "Kiosk", CheckInMethod.QR, false, 41.2, -8.7, null);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().contains("0 of 1"), error.getMessage());
    }

    @Test
    void locationBasesAtNullIslandBlockGoLive() {
        Game game = gameWithTeamAndChallenges("zero", 1);
        base(game, "Nowhere", CheckInMethod.LOCATION, false, 0.0, 0.0, 20);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().toLowerCase().contains("coordinates"), error.getMessage());
    }

    @Test
    void aRadiusOutsideTheSupportedBandBlocksGoLive() {
        Game game = gameWithTeamAndChallenges("radius", 1);
        Base b = base(game, "Wide", CheckInMethod.LOCATION, false, 41.1, -8.6, 20);
        // Bypass the service clamp to model a row written before the clamp existed.
        b.setCheckInRadiusM(900);
        baseRepository.save(b);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().toLowerCase().contains("radius"), error.getMessage());
    }

    @Test
    void overlappingLocationRingsBlockGoLive() {
        Game game = gameWithTeamAndChallenges("overlap", 2);
        // 40 m apart with 30 m radii each: the rings intersect.
        base(game, "Ring A", CheckInMethod.LOCATION, false, 41.100000, -8.600000, 30);
        base(game, "Ring B", CheckInMethod.LOCATION, false, 41.100000 + 40.0 / 111_195.0, -8.600000, 30);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().toLowerCase().contains("overlap"), error.getMessage());
    }

    @Test
    void locationRingsThatDoNotTouchArePermitted() {
        Game game = gameWithTeamAndChallenges("apart", 2);
        base(game, "Ring A", CheckInMethod.LOCATION, false, 41.100000, -8.600000, 20);
        base(game, "Ring B", CheckInMethod.LOCATION, false, 41.100000 + 200.0 / 111_195.0, -8.600000, 20);

        assertDoesNotThrow(() -> validator.validateGoLivePrerequisites(game));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.GameReadinessCheckInMethodTest'
```

Expected: `qrBasesNeedNoTagLink` and `locationBasesNeedNoTagLinkEither` fail with `BadRequestException: All bases must have NFC tags linked...`; the 0,0, radius and overlap tests fail with "expected BadRequestException to be thrown, but nothing was thrown".

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/service/GameReadinessValidator.java`, add the imports

```java
import com.prayer.pointfinder.entity.CheckInMethod;
```

and replace the NFC-linked block (lines 51–57) with:

```java
        List<Base> allBases = baseRepository.findByGameId(game.getId());

        // Only NFC bases need a written tag. A QR base is printed from the
        // same token and is always ready; a location base has no tag at all.
        long nfcBaseCount = allBases.stream()
                .filter(b -> b.getCheckInMethod() == CheckInMethod.NFC)
                .count();
        long nfcLinkedCount = allBases.stream()
                .filter(b -> b.getCheckInMethod() == CheckInMethod.NFC)
                .filter(b -> Boolean.TRUE.equals(b.getNfcLinked()))
                .count();
        if (nfcLinkedCount < nfcBaseCount) {
            throw new BadRequestException(
                    String.format("All NFC bases must have tags linked before going live. %d of %d bases linked",
                            nfcLinkedCount, nfcBaseCount));
        }

        validateLocationBases(allBases);
```

Add this private method at the end of the class:

```java
    /**
     * Location bases carry the whole burden of proof themselves, so a
     * misconfigured one is not a cosmetic problem — it is a base nobody can
     * ever reach, or two bases that unlock from one spot. Both are caught
     * here rather than discovered by a team standing in a field.
     */
    private void validateLocationBases(List<Base> allBases) {
        List<Base> locationBases = allBases.stream()
                .filter(b -> b.getCheckInMethod() == CheckInMethod.LOCATION)
                .toList();
        if (locationBases.isEmpty()) {
            return;
        }

        for (Base base : locationBases) {
            if (base.getLat() == null || base.getLng() == null
                    || (base.getLat() == 0.0 && base.getLng() == 0.0)) {
                throw new BadRequestException(String.format(
                        "Location base \"%s\" needs real coordinates before going live", base.getName()));
            }
            int radiusM = base.resolvedCheckInRadiusM();
            if (radiusM < CheckInVerificationService.MIN_RADIUS_M
                    || radiusM > CheckInVerificationService.MAX_RADIUS_M) {
                throw new BadRequestException(String.format(
                        "Location base \"%s\" has a check-in radius of %d m; it must be between %d and %d m",
                        base.getName(), radiusM,
                        CheckInVerificationService.MIN_RADIUS_M, CheckInVerificationService.MAX_RADIUS_M));
            }
        }

        for (int i = 0; i < locationBases.size(); i++) {
            for (int j = i + 1; j < locationBases.size(); j++) {
                Base a = locationBases.get(i);
                Base b = locationBases.get(j);
                double distanceM = CheckInVerificationService.haversineMeters(
                        a.getLat(), a.getLng(), b.getLat(), b.getLng());
                double combinedRadiiM = a.resolvedCheckInRadiusM() + b.resolvedCheckInRadiusM();
                if (distanceM < combinedRadiiM) {
                    throw new BadRequestException(String.format(
                            "Location bases \"%s\" and \"%s\" have overlapping rings (%.0f m apart, %.0f m combined radius)",
                            a.getName(), b.getName(), distanceM, combinedRadiiM));
                }
            }
        }
    }
```

Delete the now-duplicated `List<Base> bases = baseRepository.findByGameId(game.getId());` inside the location-bound challenge block and reuse `allBases` there instead.

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.GameReadinessCheckInMethodTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.GoLiveReadinessTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 12: Method and radius travel with import and export

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/export/GameMetadataDto.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/export/BaseExportDto.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/GameImportExportService.java` (`GameMetadataDto.builder()` ~line 79, `BaseExportDto.builder()` ~line 109, `Game.builder()` ~line 238, `Base.builder()` ~line 319)
- Test: `backend/src/test/java/com/prayer/pointfinder/service/GameImportExportServiceTest.java` (append tests)

**Interfaces:**
- Produces: `GameMetadataDto.defaultCheckInMethod : String`, `GameMetadataDto.defaultCheckInRadiusM : Integer`
- Produces: `BaseExportDto.checkInMethod : String`, `BaseExportDto.checkInRadiusM : Integer`

- [ ] **Step 1: Write the failing test**

Append to `backend/src/test/java/com/prayer/pointfinder/service/GameImportExportServiceTest.java`, just before the private helper section:

```java
    // ── Check-in methods travel with the template ────────────────────

    @Test
    void exportGame_carriesCheckInMethodAndRadius() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Trail Game");
        game.setDefaultCheckInMethod(com.prayer.pointfinder.entity.CheckInMethod.LOCATION);
        game.setDefaultCheckInRadiusM(35);

        Base base = Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Clearing")
                .description("Under the oak")
                .lat(41.1)
                .lng(-8.6)
                .hidden(false)
                .nfcLinked(false)
                .checkInMethod(com.prayer.pointfinder.entity.CheckInMethod.QR)
                .checkInRadiusM(60)
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        GameExportDto export = service.exportGame(gameId);

        assertEquals("LOCATION", export.getGame().getDefaultCheckInMethod());
        assertEquals(35, export.getGame().getDefaultCheckInRadiusM());
        assertEquals("QR", export.getBases().get(0).getCheckInMethod());
        assertEquals(60, export.getBases().get(0).getCheckInRadiusM());
    }

    @Test
    void importGame_restoresCheckInMethodAndRadius() {
        UUID savedGameId = UUID.randomUUID();
        stubImportSaves(savedGameId);
        when(baseRepository.save(any(Base.class))).thenAnswer(inv -> {
            Base b = inv.getArgument(0);
            if (b.getId() == null) b.setId(UUID.randomUUID());
            return b;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getGame().setDefaultCheckInMethod("LOCATION");
        request.getGameData().getGame().setDefaultCheckInRadiusM(35);
        request.getGameData().getBases().add(BaseExportDto.builder()
                .tempId("base_1")
                .name("Clearing")
                .description("Under the oak")
                .lat(41.1)
                .lng(-8.6)
                .hidden(false)
                .checkInMethod("QR")
                .checkInRadiusM(60)
                .build());

        service.importGame(request);

        ArgumentCaptor<Game> gameCaptor = ArgumentCaptor.forClass(Game.class);
        verify(gameRepository).save(gameCaptor.capture());
        assertEquals(com.prayer.pointfinder.entity.CheckInMethod.LOCATION,
                gameCaptor.getValue().getDefaultCheckInMethod());
        assertEquals(35, gameCaptor.getValue().getDefaultCheckInRadiusM());

        ArgumentCaptor<Base> baseCaptor = ArgumentCaptor.forClass(Base.class);
        verify(baseRepository, org.mockito.Mockito.atLeastOnce()).save(baseCaptor.capture());
        Base savedBase = baseCaptor.getAllValues().get(0);
        assertEquals(com.prayer.pointfinder.entity.CheckInMethod.QR, savedBase.getCheckInMethod());
        assertEquals(60, savedBase.getCheckInRadiusM());
    }

    @Test
    void importGame_defaultsMissingCheckInFieldsToNfcAndInherit() {
        UUID savedGameId = UUID.randomUUID();
        stubImportSaves(savedGameId);
        when(baseRepository.save(any(Base.class))).thenAnswer(inv -> {
            Base b = inv.getArgument(0);
            if (b.getId() == null) b.setId(UUID.randomUUID());
            return b;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(BaseExportDto.builder()
                .tempId("base_1")
                .name("Old Template Base")
                .description("")
                .lat(41.1)
                .lng(-8.6)
                .build());

        service.importGame(request);

        ArgumentCaptor<Game> gameCaptor = ArgumentCaptor.forClass(Game.class);
        verify(gameRepository).save(gameCaptor.capture());
        assertEquals(com.prayer.pointfinder.entity.CheckInMethod.NFC,
                gameCaptor.getValue().getDefaultCheckInMethod());
        assertEquals(15, gameCaptor.getValue().getDefaultCheckInRadiusM());

        ArgumentCaptor<Base> baseCaptor = ArgumentCaptor.forClass(Base.class);
        verify(baseRepository, org.mockito.Mockito.atLeastOnce()).save(baseCaptor.capture());
        assertEquals(com.prayer.pointfinder.entity.CheckInMethod.NFC,
                baseCaptor.getAllValues().get(0).getCheckInMethod());
        assertNull(baseCaptor.getAllValues().get(0).getCheckInRadiusM());
    }
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.GameImportExportServiceTest'
```

Expected: compilation failure — `cannot find symbol: method setDefaultCheckInMethod(String)` on `GameMetadataDto`, `checkInMethod(String)` on `BaseExportDto.BaseExportDtoBuilder`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/dto/export/GameMetadataDto.java`, append:

```java
    /** {@code NFC}, {@code QR}, or {@code LOCATION}. Null on pre-V60 templates. */
    private String defaultCheckInMethod;
    /** Default location radius in metres. Null on pre-V60 templates. */
    private Integer defaultCheckInRadiusM;
```

In `backend/src/main/java/com/prayer/pointfinder/dto/export/BaseExportDto.java`, append:

```java
    /** Per-base method; null on pre-V60 templates, which were all NFC. */
    private String checkInMethod;
    /** Per-base radius override in metres; null means inherit the game default. */
    private Integer checkInRadiusM;
```

In `backend/src/main/java/com/prayer/pointfinder/service/GameImportExportService.java`:

Add to the `GameMetadataDto.builder()` chain (~line 79):

```java
                .defaultCheckInMethod(game.getDefaultCheckInMethod() != null
                        ? game.getDefaultCheckInMethod().name() : CheckInMethod.NFC.name())
                .defaultCheckInRadiusM(game.getDefaultCheckInRadiusM() != null
                        ? game.getDefaultCheckInRadiusM() : 15)
```

Add to the `BaseExportDto.builder()` chain (~line 109), after `.hidden(base.getHidden())`:

```java
                            .checkInMethod(base.getCheckInMethod() != null
                                    ? base.getCheckInMethod().name() : CheckInMethod.NFC.name())
                            .checkInRadiusM(base.getCheckInRadiusM())
```

Add to the import `Game.builder()` chain (~line 238), after `.broadcastEnabled(...)`:

```java
                // Templates exported before check-in methods existed carry no
                // method at all; those games were NFC-only, so that is the
                // honest default rather than a guess.
                .defaultCheckInMethod(data.getGame().getDefaultCheckInMethod() != null
                        ? CheckInMethod.valueOf(data.getGame().getDefaultCheckInMethod())
                        : CheckInMethod.NFC)
                .defaultCheckInRadiusM(data.getGame().getDefaultCheckInRadiusM() != null
                        ? CheckInVerificationService.clampRadiusM(data.getGame().getDefaultCheckInRadiusM())
                        : 15)
```

Add to the import `Base.builder()` chain (~line 319), after `.hidden(...)`:

```java
                    .checkInMethod(baseDto.getCheckInMethod() != null
                            ? CheckInMethod.valueOf(baseDto.getCheckInMethod())
                            : CheckInMethod.NFC)
                    .checkInRadiusM(baseDto.getCheckInRadiusM() != null
                            ? CheckInVerificationService.clampRadiusM(baseDto.getCheckInRadiusM())
                            : null)
```

Add `import com.prayer.pointfinder.entity.CheckInMethod;` to `GameImportExportService.java` if the existing imports do not already cover it.

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.GameImportExportServiceTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 13: Activity events carry the method, verification, and claim summary

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java` (`checkIn` activity-event builder, ~line 120)
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/TeamService.java` (`operatorCheckIn` activity-event builder, ~line 217)
- Modify: `backend/src/main/java/com/prayer/pointfinder/websocket/GameEventBroadcaster.java` (`broadcastActivityEvent`, lines 68–79)
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/ActivityEventResponse.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/MonitoringService.java` (`getActivity` mapping, lines 110–119)
- Test: `backend/src/test/java/com/prayer/pointfinder/integration/CheckInActivityMetadataTest.java` (create)

**Interfaces:**
- Produces: `ActivityEventResponse(..., Instant timestamp, Map<String,Object> metadata)`
- Produces: realtime `activity` payload key `metadata`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/integration/CheckInActivityMetadataTest.java`:

```java
package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The operator feed has to distinguish "walked in and the GPS agreed" from
 * "pressed I'm here", and for a claim it has to say how much of the team was
 * actually nearby — otherwise the badge is an accusation with no evidence.
 */
class CheckInActivityMetadataTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    @Autowired
    private ActivityEventRepository activityEventRepository;

    @Autowired
    private PlayerLocationRepository playerLocationRepository;

    private static final double BASE_LAT = 41.100000;
    private static final double BASE_LNG = -8.600000;

    private static double latOffset(double metres) {
        return BASE_LAT + metres / 111_195.0;
    }

    private record Ctx(Game game, Team team, Player player, Base base) {}

    private Ctx ctx(String key, CheckInMethod method) {
        User operator = createOperator("actmeta-" + key + "@test.com", "password");
        Game game = createGame(operator, "Act Meta " + key, GameStatus.live);
        Team team = createTeam(game, "Wolves " + key, ("A" + key + "00001").substring(0, 6));
        Player player = createPlayer(team, "Scout", "device-actmeta-" + key);
        Base base = createBase(game, "Base " + key);
        base.setLat(BASE_LAT);
        base.setLng(BASE_LNG);
        base.setCheckInMethod(method);
        base.setCheckInRadiusM(20);
        base = baseRepository.save(base);
        return new Ctx(game, team, player, base);
    }

    private ActivityEvent onlyEvent(Ctx c) {
        List<ActivityEvent> events = activityEventRepository.findByGameIdIncludingArchived(c.game().getId());
        assertEquals(1, events.size());
        return events.get(0);
    }

    @Test
    void verifiedGeoCheckInRecordsMethodAndVerification() {
        Ctx c = ctx("v", CheckInMethod.LOCATION);
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(latOffset(5));
        request.setLng(BASE_LNG);
        request.setAccuracy(6.0);
        request.setCapturedAt(Instant.now());
        request.setClaimed(false);

        playerService.checkIn(c.game().getId(), c.base().getId(), c.player(), request);

        ActivityEvent event = onlyEvent(c);
        assertEquals("LOCATION", event.getMetadata().get("method"));
        assertEquals("VERIFIED", event.getMetadata().get("verification"));
        assertNull(event.getMetadata().get("teammatesInRing"));
    }

    @Test
    void claimedCheckInReportsHowManyTeammatesWereInTheRing() {
        Ctx c = ctx("c", CheckInMethod.LOCATION);
        Player mate = createPlayer(c.team(), "Mate", "device-actmeta-mate");
        playerLocationRepository.save(PlayerLocation.builder()
                .player(mate).lat(latOffset(1000)).lng(BASE_LNG).accuracyM(10.0)
                .capturedAt(Instant.now()).build());

        Instant now = Instant.now();
        List<CheckInRequest.FixDto> dwell = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            CheckInRequest.FixDto fix = new CheckInRequest.FixDto();
            fix.setLat(latOffset(40));
            fix.setLng(BASE_LNG);
            fix.setAccuracy(30.0);
            fix.setCapturedAt(now.minus(100 - i * 30L, ChronoUnit.SECONDS));
            dwell.add(fix);
        }
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(latOffset(40));
        request.setLng(BASE_LNG);
        request.setAccuracy(60.0);
        request.setCapturedAt(now);
        request.setClaimed(true);
        request.setDwell(dwell);

        playerService.checkIn(c.game().getId(), c.base().getId(), c.player(), request);

        ActivityEvent event = onlyEvent(c);
        assertEquals("CLAIMED", event.getMetadata().get("verification"));
        assertEquals(0, ((Number) event.getMetadata().get("teammatesInRing")).intValue());
        assertEquals(2, ((Number) event.getMetadata().get("teammatesTotal")).intValue());
        assertNotNull(checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId())
                .orElseThrow().getTeamPositionsSnapshot());
    }

    @Test
    void nfcCheckInStillRecordsItsMethod() {
        Ctx c = ctx("n", CheckInMethod.NFC);

        playerService.checkIn(c.game().getId(), c.base().getId(), c.player(), checkInRequestFor(c.base()));

        ActivityEvent event = onlyEvent(c);
        assertEquals("NFC", event.getMetadata().get("method"));
        assertEquals("VERIFIED", event.getMetadata().get("verification"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.CheckInActivityMetadataTest'
```

Expected: `NullPointerException` on `event.getMetadata().get(...)` — the check-in path never populates the column.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/service/PlayerService.java`, immediately before the `ActivityEvent event = ActivityEvent.builder()` call in `checkIn`, add:

```java
        // Structured twin of the feed message. The operator UI reads these to
        // draw the method icon and the "claimed" badge; the free-text message
        // stays the human sentence and is not parsed by anyone.
        Map<String, Object> eventMetadata = new LinkedHashMap<>();
        eventMetadata.put("method", proof.method().name());
        eventMetadata.put("verification", proof.verification().name());
        if (proof.verification() == CheckInVerification.CLAIMED) {
            eventMetadata.put("teammatesInRing", proof.teammatesInRing());
            eventMetadata.put("teammatesTotal", proof.teammatesTotal());
        }
```

and add `.metadata(eventMetadata)` to that `ActivityEvent.builder()` chain, after `.sourceSurface("player_app")`.

Add `import java.util.LinkedHashMap;` to `PlayerService.java` if the existing `java.util.*` wildcard does not already cover it (it does — no change needed).

In `backend/src/main/java/com/prayer/pointfinder/service/TeamService.java`, add to the `ActivityEvent.builder()` chain in `operatorCheckIn`:

```java
                .metadata(java.util.Map.of(
                        "method", base.getCheckInMethod() != null
                                ? base.getCheckInMethod().name()
                                : com.prayer.pointfinder.entity.CheckInMethod.NFC.name(),
                        "verification", com.prayer.pointfinder.entity.CheckInVerification.OPERATOR.name()))
```

In `backend/src/main/java/com/prayer/pointfinder/websocket/GameEventBroadcaster.java`, add to `broadcastActivityEvent` after the `timestamp` line:

```java
        data.put("metadata", event.getMetadata());
```

In `backend/src/main/java/com/prayer/pointfinder/dto/response/ActivityEventResponse.java`, append the component:

```java
public record ActivityEventResponse(
    UUID id,
    UUID gameId,
    String type,
    UUID teamId,
    UUID baseId,
    UUID challengeId,
    String message,
    Instant timestamp,
    /**
     * Structured extras. For check-ins: {@code method}, {@code verification},
     * and for claims {@code teammatesInRing} / {@code teammatesTotal}. Null
     * for events that carry nothing beyond the message.
     */
    java.util.Map<String, Object> metadata
) {}
```

In `backend/src/main/java/com/prayer/pointfinder/service/MonitoringService.java`, add `e.getMetadata()` as the final argument of the `new ActivityEventResponse(...)` call.

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.integration.CheckInActivityMetadataTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.websocket.GameEventBroadcasterTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.MonitoringServiceTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 14: Audit export carries method, verification and the raw proof

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/response/AuditEntryDto.java` (`Details` record)
- Modify: `backend/src/main/java/com/prayer/pointfinder/service/AuditExportService.java` (`toDto`, `export`, `CSV_HEADER`, `renderCsv`, new `buildCheckInAuditIndex`)
- Test: `backend/src/test/java/com/prayer/pointfinder/service/AuditExportCheckInProofTest.java` (create)

**Interfaces:**
- Produces: `AuditEntryDto.Details(String message, String operatorReason, String checkInMethod, String checkInVerification, String checkInProof)`
- Produces: three CSV columns appended after `archived`: `check_in_method`, `check_in_verification`, `check_in_proof`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/prayer/pointfinder/service/AuditExportCheckInProofTest.java`:

```java
package com.prayer.pointfinder.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.response.AuditEntryDto;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.AuditExportService.AuditExportQuery;
import com.prayer.pointfinder.service.AuditExportService.AuditExportResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * An incident review of a claimed check-in needs the proof itself, not just
 * "team X checked in". The export therefore carries the method, the strength
 * of the proof, and the raw fix and teammate snapshot as one JSON column.
 */
class AuditExportCheckInProofTest extends IntegrationTestBase {

    @Autowired
    private AuditExportService auditExportService;

    @Autowired
    private PlayerService playerService;

    private final ObjectMapper mapper = new ObjectMapper();

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private Game setUpGeoCheckIn() {
        User operator = createOperator("auditproof@test.com", "password");
        Game game = createGame(operator, "Audit Proof Game", GameStatus.live);
        Team team = createTeam(game, "Wolves", "AUD001");
        Player player = createPlayer(team, "Scout", "device-auditproof");
        Base base = createBase(game, "Clearing");
        base.setLat(41.100000);
        base.setLng(-8.600000);
        base.setCheckInMethod(CheckInMethod.LOCATION);
        base.setCheckInRadiusM(20);
        base = baseRepository.save(base);

        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(41.100000 + 5.0 / 111_195.0);
        request.setLng(-8.600000);
        request.setAccuracy(7.0);
        request.setCapturedAt(Instant.now());
        request.setClaimed(false);
        playerService.checkIn(game.getId(), base.getId(), player, request);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        return game;
    }

    @Test
    void jsonExportCarriesTheProof() throws Exception {
        Game game = setUpGeoCheckIn();

        AuditExportResult result = auditExportService.export(new AuditExportQuery(
                game.getId(), "json", null, null, null, null, null, null, null, null));

        List<AuditEntryDto> entries = mapper.readValue(result.body(), new TypeReference<>() {});
        AuditEntryDto checkIn = entries.stream()
                .filter(e -> "check_in".equals(e.type())).findFirst().orElseThrow();

        assertEquals("LOCATION", checkIn.details().checkInMethod());
        assertEquals("VERIFIED", checkIn.details().checkInVerification());
        assertNotNull(checkIn.details().checkInProof());
        assertTrue(checkIn.details().checkInProof().contains("accuracyM"));
    }

    @Test
    void csvExportAppendsTheThreeColumnsAfterArchived() {
        Game game = setUpGeoCheckIn();

        AuditExportResult result = auditExportService.export(new AuditExportQuery(
                game.getId(), "csv", null, null, null, null, null, null, null, null));

        String[] lines = result.body().split("\r\n");
        String header = lines[0];
        assertTrue(header.endsWith("archived,check_in_method,check_in_verification,check_in_proof"), header);
        assertTrue(result.body().contains("LOCATION"), result.body());
        assertTrue(result.body().contains("VERIFIED"), result.body());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.AuditExportCheckInProofTest'
```

Expected: compilation failure — `cannot find symbol: method checkInMethod()` on `AuditEntryDto.Details`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/main/java/com/prayer/pointfinder/dto/response/AuditEntryDto.java`, replace the `Details` record with:

```java
    public record Details(
            String message,
            String operatorReason,
            /** {@code NFC}, {@code QR}, {@code LOCATION}; null for non-check-in rows. */
            String checkInMethod,
            /** {@code VERIFIED}, {@code CLAIMED}, {@code OPERATOR}; null otherwise. */
            String checkInVerification,
            /**
             * The geo proof and teammate snapshot as one JSON blob, so an
             * incident reviewer sees exactly what the phone reported rather
             * than a verdict derived from it. Null for token proofs and
             * operator rescues, which have no fix to show.
             */
            String checkInProof
    ) {}
```

In `backend/src/main/java/com/prayer/pointfinder/service/AuditExportService.java`:

Add imports:

```java
import com.prayer.pointfinder.entity.CheckInMethod;
import java.util.LinkedHashMap;
import java.util.Objects;
```

In `export(...)`, after `Map<UUID, String> checkInReasonsByActivityKey = buildCheckInReasonIndex(query.gameId());` add:

```java
        Map<UUID, CheckInAudit> checkInAuditByActivityKey = buildCheckInAuditIndex(query.gameId());
```

and change the mapping line to:

```java
        List<AuditEntryDto> entries = rows.stream()
                .map(row -> toDto(row, submissionReasonsByActivityKey, checkInReasonsByActivityKey,
                        checkInAuditByActivityKey))
                .toList();
```

Change `toDto`'s signature and its `Details` construction:

```java
    private AuditEntryDto toDto(
            ActivityEvent row,
            Map<UUID, String> submissionReasons,
            Map<UUID, String> checkInReasons,
            Map<UUID, CheckInAudit> checkInAudits
    ) {
        AuditEntryDto.Actor actor = resolveActor(row);
        AuditEntryDto.Target target = resolveTarget(row);
        String operatorReason = lookupOperatorReason(row, submissionReasons, checkInReasons);
        CheckInAudit audit = checkInAudits.get(row.getId());

        return new AuditEntryDto(
                row.getId(),
                row.getTimestamp(),
                row.getType() != null ? row.getType().name() : null,
                row.getSourceSurface(),
                actor,
                target,
                new AuditEntryDto.Details(
                        row.getMessage(),
                        operatorReason,
                        audit != null ? audit.method() : null,
                        audit != null ? audit.verification() : null,
                        audit != null ? audit.proofJson() : null),
                row.isArchived());
    }
```

Add the enrichment index beside `buildCheckInReasonIndex`:

```java
    private record CheckInAudit(String method, String verification, String proofJson) {}

    /**
     * Projects the check-in rows' proof fields onto their activity events, on
     * the same {@code (teamId, baseId)} tuple the operator-reason enrichment
     * already uses. Kept separate from that index because it applies to every
     * check-in, not only the ones an operator justified.
     */
    private Map<UUID, CheckInAudit> buildCheckInAuditIndex(UUID gameId) {
        List<CheckIn> checkIns = checkInRepository.findByGameIdIncludingArchived(gameId);
        Map<ReasonKey, CheckInAudit> byTuple = new HashMap<>();
        for (CheckIn ci : checkIns) {
            UUID teamId = ci.getTeam() != null ? ci.getTeam().getId() : null;
            UUID baseId = ci.getBase() != null ? ci.getBase().getId() : null;
            if (teamId == null || baseId == null) {
                continue;
            }
            byTuple.put(new ReasonKey(teamId, baseId), new CheckInAudit(
                    ci.getMethod() != null ? ci.getMethod().name() : CheckInMethod.NFC.name(),
                    ci.getVerification() != null ? ci.getVerification().name() : null,
                    renderProof(ci)));
        }
        if (byTuple.isEmpty()) {
            return Map.of();
        }
        Map<UUID, CheckInAudit> byEventId = new HashMap<>();
        for (ActivityEvent ev : activityEventRepository.findByGameIdIncludingArchived(gameId)) {
            if (ev.getType() != ActivityEventType.check_in || ev.getTeam() == null || ev.getBase() == null) {
                continue;
            }
            CheckInAudit audit = byTuple.get(new ReasonKey(ev.getTeam().getId(), ev.getBase().getId()));
            if (audit != null) {
                byEventId.put(ev.getId(), audit);
            }
        }
        return byEventId;
    }

    /** Null when the row carries no geo proof at all, so the column stays empty. */
    private String renderProof(CheckIn ci) {
        Map<String, Object> proof = new LinkedHashMap<>();
        proof.put("lat", ci.getProofLat());
        proof.put("lng", ci.getProofLng());
        proof.put("accuracyM", ci.getProofAccuracyM());
        proof.put("distanceM", ci.getProofDistanceM());
        proof.put("capturedAt", ci.getProofCapturedAt() != null ? ci.getProofCapturedAt().toString() : null);
        proof.put("teamPositions", ci.getTeamPositionsSnapshot());
        if (proof.values().stream().allMatch(Objects::isNull)) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(proof);
        } catch (JsonProcessingException ex) {
            log.warn("Failed to serialize check-in proof for audit export: {}", ex.getMessage());
            return null;
        }
    }
```

Append the three columns to `CSV_HEADER` (after `"archived"`):

```java
            "archived",
            "check_in_method",
            "check_in_verification",
            "check_in_proof"
```

and in `renderCsv`, after `columns.add(csvCell(Boolean.toString(e.archived())));` add:

```java
            columns.add(csvCell(details != null ? details.checkInMethod() : null));
            columns.add(csvCell(details != null ? details.checkInVerification() : null));
            columns.add(csvCell(details != null ? details.checkInProof() : null));
```

Also change `new ArrayList<>(16)` to `new ArrayList<>(19)` in `renderCsv`, and update the `CSV_HEADER` javadoc to name the three new trailing columns so the "documented in docs/api-reference.md" note stays honest.

- [ ] **Step 4: Run test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.AuditExportCheckInProofTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.AuditExportServiceTest'
docker compose -f docker-compose.test.yml run --rm backend-test ./gradlew test --no-daemon --tests 'com.prayer.pointfinder.service.AuditExportCsvEscapeTest'
```

- [ ] **Step 5: Verify green — do not commit yet.**

---
### Task 15: Rewrite docs/business-logic.md § 2, full suite, and the phase commit

**Files:**
- Modify: `docs/business-logic.md` (Table of Contents line 11; section heading line 109; the "Check-In Rules" and "Location-Bound Assignments" subsections, lines 143–195)
- Test: full backend suite

**Interfaces:**
- Consumes: everything landed in Tasks 1–14.
- Produces: one commit containing the whole backend phase.

- [ ] **Step 1: Write the failing test**

There is no unit test for prose. The verification for this step is the full suite plus a grep proving the corrected statements are present and the false one is gone:

```
grep -n "backend enforces proximity" docs/business-logic.md   # must print nothing when done
grep -n "## 2. Check-In Methods" docs/business-logic.md       # must print the new heading
```

Run them now and confirm the first prints a match (the false claim is still there) and the second prints nothing.

- [ ] **Step 2: Run test to verify it fails**

```
grep -n "backend enforces proximity" docs/business-logic.md && grep -c "## 2. Check-In Methods" docs/business-logic.md
```

Expected: the first grep prints the line `- The backend enforces proximity before allowing check-in for location-bound challenges.`; the second prints `0`.

- [ ] **Step 3: Write minimal implementation**

In `docs/business-logic.md`, change the Table of Contents line 11 to:

```
2. [Check-In Methods](#2-check-in-methods)
```

Change the section heading on line 109 to:

```
## 2. Check-In Methods
```

Insert a new lead paragraph directly under that heading, before the existing "### NFC Tag Format" subsection:

```markdown
Every base declares **how** a team proves it got there. The method is chosen per
base and seeded from the game's default at creation; changing the game default
later does not rewrite bases that already exist.

| Method | Proof | Go-live requirement |
|---|---|---|
| `NFC` | Tap the tag written for the base | The tag must be linked |
| `QR` | Scan the printed code, which carries the same token as the tag | None — the code prints from the token |
| `LOCATION` | A GPS fix inside the base radius, verified server-side | Real coordinates (not 0,0), radius 5–200 m, no two location rings overlapping |

Per-base fields: `check_in_method` and `check_in_radius_m` (null inherits the
game default). Game fields: `default_check_in_method` and
`default_check_in_radius_m` (default 15 m). Legacy iOS and Android apps only
support `NFC` bases; a game containing a `QR` or `LOCATION` base cannot be
completed on them.
```

Replace the whole "### Check-In Rules" subsection (from its heading through the "> **Note**: Check-in does NOT validate..." blockquote) with:

````markdown
### Check-In Rules

`POST /api/player/games/{gameId}/bases/{baseId}/check-in` takes a discriminated proof:

```json
{ "method": "nfc", "token": "ab12cd34" }
{ "method": "qr",  "token": "ab12cd34" }
{ "method": "geo", "lat": 41.1, "lng": -8.6, "accuracy": 8.5,
  "capturedAt": "2026-09-05T10:00:00Z", "claimed": false }
{ "method": "geo", "lat": 41.1, "lng": -8.6, "accuracy": 22.0,
  "capturedAt": "2026-09-05T10:00:00Z", "claimed": true, "dwell": [ /* 4+ fixes */ ] }
```

The legacy body `{"nfcToken": "ab12cd34"}` stays accepted and means `method: "nfc"`.
It is only valid at `NFC` bases.

Checks run in this order, in `PlayerService.checkIn`:

1. **Guards** — the player belongs to the game, the game is `live`, the base belongs to the game.
2. **Idempotency** — one active row per `(team, base)`. A repeat returns the existing row unchanged, whatever proof was sent and whoever created the original row (including an operator rescue).
3. **Base order** — when `enforce_base_order` is on, a later base is rejected with `PREVIOUS_BASE_REQUIRED`. This runs *before* verification, so a blocked team never learns whether its proof would have passed.
4. **Verification** — `CheckInVerificationService.verify` against the base's own method.

**Verification rules**

| Rule | Value |
|---|---|
| Method match | Proof type must equal the base method; legacy bodies only at `NFC` |
| Token proofs | Constant-time compare against the base token |
| Auto geo accuracy | Finite and ≤ 50 m |
| Auto geo acceptance | `distance ≤ radius + min(accuracy, 30)`, haversine, Earth radius 6 371 000 m |
| Fix staleness | `capturedAt` within `[now − 24 h, now + 10 min]` |
| Claim accuracy | ≤ 100 m |
| Claim ring | `R = max(3 × radius, 50)`; the main fix must be inside it |
| Claim dwell | ≥ 4 fixes, all inside `R`, all ≤ 100 m accuracy, first-to-last span ≥ 60 s, last fix within 2 min of the main fix |

Failures carry a machine-readable code: `CHECK_IN_METHOD_MISMATCH`,
`CHECK_IN_TOKEN_INVALID`, `CHECK_IN_FIX_TOO_COARSE`, `CHECK_IN_FIX_STALE`,
`CHECK_IN_OUT_OF_RANGE` (details `distanceM`, `allowedM`), and
`CHECK_IN_CLAIM_NOT_DWELLED` (details `reason`).

**What the row records.** `method` and `verification` (`VERIFIED`, `CLAIMED`, or
`OPERATOR`), plus the raw proof for geo rows: `proof_lat`, `proof_lng`,
`proof_accuracy_m`, `proof_distance_m`, `proof_captured_at`. For `VERIFIED` geo
rows `checked_in_at` is the proof's `capturedAt`, so a check-in queued offline
and synced hours later still records when the team arrived; for `CLAIMED` rows
it is receipt time, because nothing proves where the team was at capture time.

**Claims.** A claim is always accepted into the game — a team under heavy canopy
must not be stranded — but it is marked `CLAIMED` and the server snapshots every
teammate's latest known position with distance and age into
`team_positions_snapshot`. The activity event reports how many teammates were
inside `R`. Operators see the claim in the feed with a badge and the summary.

> **Note**: Check-in does NOT validate that an assignment exists for the team-base pair. A player can check in at any base belonging to the game. Assignment validation occurs later during submission creation.
````

Replace the whole "### Location-Bound Assignments" subsection with:

```markdown
### Location-Bound Assignments

`location_bound = true` on a challenge means the challenge lives at a specific
base. At go-live the backend requires every location-bound challenge to be
assigned to a base (via `fixedChallengeId` or an assignment row).

The player's device reports its position via
`POST /api/player/games/{gameId}/location` on a 30-second interval; the request
carries `lat`, `lng`, and — since the check-in methods wave — `accuracy` and
`capturedAt`, all of which are stored on `player_locations`.

**The backend does not enforce proximity for `location_bound` challenges.** That
flag is a content-placement rule, not a geofence. Proximity is enforced only by
`LOCATION` check-in method verification, described above, and only at check-in
time.

**`requirePresenceToSubmit` is client-side.** The re-proof before submitting —
re-tap for `NFC`, re-scan for `QR`, currently inside the wider ring for
`LOCATION` — is performed by the player app. The backend accepts the submission
either way, so this is a UX guardrail, not a security boundary.
```

- [ ] **Step 4: Run test to verify it passes**

```
cd /Users/xmedavid/dev/dbvnfc && grep -c "backend enforces proximity" docs/business-logic.md   # expect 0
cd /Users/xmedavid/dev/dbvnfc && grep -c "## 2. Check-In Methods" docs/business-logic.md       # expect 1
make test-backend-docker
```

`make test-backend-docker` must be fully green before the commit.

- [ ] **Step 5: Commit** — this phase is ONE atomic commit.

```
cd /Users/xmedavid/dev/dbvnfc && git add \
  backend/src/main/java backend/src/main/resources/db/migration/V60__check_in_methods.sql \
  backend/src/test/java contract-snapshots/GameResponse.json docs/business-logic.md
git status   # confirm no plan or spec file is staged
git commit -m "$(cat <<'EOF'
feat(backend): per-base check-in methods with location verification

Bases now declare how a team proves it got there: tap the NFC tag, scan the
printed QR code, or simply be inside the base radius. Location bases are
verified server-side from the phone's GPS fix; when GPS never converges a
player may claim presence after dwelling nearby, and the claim is recorded as
CLAIMED with a snapshot of where every teammate's phone last was, so operators
can judge it afterwards instead of guessing.

Adds V60 (method, radius, proof and snapshot columns, plus player-location
accuracy/capture time and activity-event metadata), CheckInVerificationService
with the full rule set, per-method go-live readiness, a guard against saving a
location base at 0,0, and method/verification/proof columns in the audit export.
Legacy NFC bodies keep working; games with QR or location bases cannot be
completed by the legacy iOS and Android apps.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

Do NOT stage `docs/superpowers/plans/` or `docs/specs/`.
