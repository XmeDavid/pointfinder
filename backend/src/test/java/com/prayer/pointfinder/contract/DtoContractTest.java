package com.prayer.pointfinder.contract;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.prayer.pointfinder.dto.response.*;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Cross-platform DTO contract tests.
 *
 * Generates canonical JSON snapshots of key DTOs and asserts that serialization
 * output matches the committed snapshots. Other platforms (web-admin, Android,
 * iOS) validate deserialization of these same snapshots to catch DTO drift.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DtoContractTest {

    private ObjectMapper mapper;
    private Path snapshotDir;

    @BeforeAll
    void setUp() {
        mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mapper.enable(SerializationFeature.INDENT_OUTPUT);

        // Snapshots live at repo root: contract-snapshots/
        snapshotDir = Path.of(System.getProperty("user.dir")).resolve("../contract-snapshots");
    }

    @Test
    void authResponse_matchesSnapshot() throws IOException {
        AuthResponse dto = AuthResponse.builder()
                .accessToken("eyJhbGciOiJIUzI1NiJ9.test-access-token")
                .refreshToken("eyJhbGciOiJIUzI1NiJ9.test-refresh-token")
                .user(UserResponse.builder()
                        .id(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890"))
                        .email("operator@example.com")
                        .name("Test Operator")
                        .role("operator")
                        .createdAt(Instant.parse("2025-01-15T10:30:00Z"))
                        .build())
                .build();

        assertMatchesSnapshot("AuthResponse", dto);
    }

    @Test
    void playerAuthResponse_matchesSnapshot() throws IOException {
        PlayerAuthResponse dto = new PlayerAuthResponse(
                "eyJhbGciOiJIUzI1NiJ9.test-player-token",
                new PlayerAuthResponse.PlayerInfo(
                        UUID.fromString("b2c3d4e5-f6a7-8901-bcde-f12345678901"),
                        "Scout Team Alpha",
                        "ios-device-abc123"
                ),
                new PlayerAuthResponse.TeamInfo(
                        UUID.fromString("c3d4e5f6-a7b8-9012-cdef-123456789012"),
                        "Eagles",
                        "#FF5733"
                ),
                new PlayerAuthResponse.GameInfo(
                        UUID.fromString("d4e5f6a7-b8c9-0123-defa-234567890123"),
                        "Forest Adventure",
                        "A scouting game in the forest",
                        "live",
                        "osm-classic"
                )
        );

        assertMatchesSnapshot("PlayerAuthResponse", dto);
    }

    @Test
    void gameResponse_matchesSnapshot() throws IOException {
        GameResponse dto = new GameResponse(
                UUID.fromString("d4e5f6a7-b8c9-0123-defa-234567890123"),
                "Forest Adventure",
                "A scouting game in the forest",
                Instant.parse("2025-03-01T08:00:00Z"),
                Instant.parse("2025-03-01T18:00:00Z"),
                "live",
                UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
                List.of(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890")),
                false,
                true,
                "FOREST2025",
                "osm-classic",
                "CHECK_IN",
                null,
                null);

        assertMatchesSnapshot("GameResponse", dto);
    }

    @Test
    void submissionResponse_matchesSnapshot() throws IOException {
        SubmissionResponse dto = new SubmissionResponse(
                UUID.fromString("e5f6a7b8-c9d0-1234-efab-345678901234"),
                UUID.fromString("c3d4e5f6-a7b8-9012-cdef-123456789012"),
                UUID.fromString("f6a7b8c9-d0e1-2345-fabc-456789012345"),
                UUID.fromString("a7b8c9d0-e1f2-3456-abcd-567890123456"),
                "The answer is 42",
                "/uploads/game1/photo.jpg",
                List.of("/uploads/game1/photo.jpg", "/uploads/game1/photo2.jpg"),
                "approved",
                Instant.parse("2025-03-01T10:30:00Z"),
                UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
                "Great work!",
                100,
                "You found the hidden treasure!");

        assertMatchesSnapshot("SubmissionResponse", dto);
    }

    @Test
    void baseProgressResponse_matchesSnapshot() throws IOException {
        // P1 Phase 4 W4: the player-facing progress DTO carries the
        // challenge title instead of the base name. The snapshot was
        // regenerated when the field was renamed; mobile contract tests
        // were updated in lock-step.
        BaseProgressResponse dto = new BaseProgressResponse(
                UUID.fromString("a7b8c9d0-e1f2-3456-abcd-567890123456"),
                "Find the tree",
                47.3769,
                8.5417,
                true,
                "completed",
                Instant.parse("2025-03-01T09:15:00Z"),
                UUID.fromString("f6a7b8c9-d0e1-2345-fabc-456789012345"),
                "approved");

        assertMatchesSnapshot("BaseProgressResponse", dto);
    }

    @Test
    void leaderboardEntry_matchesSnapshot() throws IOException {
        LeaderboardEntry dto = new LeaderboardEntry(
                UUID.fromString("c3d4e5f6-a7b8-9012-cdef-123456789012"),
                "Eagles",
                "#FF5733",
                350,
                5);

        assertMatchesSnapshot("LeaderboardEntry", dto);
    }

    /**
     * Serializes the DTO to JSON and compares against the committed snapshot.
     * If the snapshot file does not exist, it is created (first run).
     */
    private void assertMatchesSnapshot(String name, Object dto) throws IOException {
        String actual = mapper.writeValueAsString(dto);
        Path snapshotFile = snapshotDir.resolve(name + ".json");

        if (!Files.exists(snapshotFile)) {
            Files.createDirectories(snapshotDir);
            Files.writeString(snapshotFile, actual + "\n");
            return;
        }

        String expected = Files.readString(snapshotFile).trim();
        assertEquals(
                mapper.readTree(expected),
                mapper.readTree(actual),
                "DTO contract drift detected for " + name +
                        ". If the change is intentional, update the snapshot and all platform tests."
        );
    }
}
