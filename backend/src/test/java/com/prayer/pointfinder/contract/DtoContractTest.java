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
        PlayerAuthResponse dto = PlayerAuthResponse.builder()
                .token("eyJhbGciOiJIUzI1NiJ9.test-player-token")
                .player(PlayerAuthResponse.PlayerInfo.builder()
                        .id(UUID.fromString("b2c3d4e5-f6a7-8901-bcde-f12345678901"))
                        .displayName("Scout Team Alpha")
                        .deviceId("ios-device-abc123")
                        .build())
                .team(PlayerAuthResponse.TeamInfo.builder()
                        .id(UUID.fromString("c3d4e5f6-a7b8-9012-cdef-123456789012"))
                        .name("Eagles")
                        .color("#FF5733")
                        .build())
                .game(PlayerAuthResponse.GameInfo.builder()
                        .id(UUID.fromString("d4e5f6a7-b8c9-0123-defa-234567890123"))
                        .name("Forest Adventure")
                        .description("A scouting game in the forest")
                        .status("live")
                        .tileSource("osm-classic")
                        .build())
                .build();

        assertMatchesSnapshot("PlayerAuthResponse", dto);
    }

    @Test
    void gameResponse_matchesSnapshot() throws IOException {
        GameResponse dto = GameResponse.builder()
                .id(UUID.fromString("d4e5f6a7-b8c9-0123-defa-234567890123"))
                .name("Forest Adventure")
                .description("A scouting game in the forest")
                .startDate(Instant.parse("2025-03-01T08:00:00Z"))
                .endDate(Instant.parse("2025-03-01T18:00:00Z"))
                .status("live")
                .createdBy(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890"))
                .operatorIds(List.of(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890")))
                .uniformAssignment(false)
                .broadcastEnabled(true)
                .broadcastCode("FOREST2025")
                .tileSource("osm-classic")
                .build();

        assertMatchesSnapshot("GameResponse", dto);
    }

    @Test
    void submissionResponse_matchesSnapshot() throws IOException {
        SubmissionResponse dto = SubmissionResponse.builder()
                .id(UUID.fromString("e5f6a7b8-c9d0-1234-efab-345678901234"))
                .teamId(UUID.fromString("c3d4e5f6-a7b8-9012-cdef-123456789012"))
                .challengeId(UUID.fromString("f6a7b8c9-d0e1-2345-fabc-456789012345"))
                .baseId(UUID.fromString("a7b8c9d0-e1f2-3456-abcd-567890123456"))
                .answer("The answer is 42")
                .fileUrl("/uploads/game1/photo.jpg")
                .fileUrls(List.of("/uploads/game1/photo.jpg", "/uploads/game1/photo2.jpg"))
                .status("approved")
                .submittedAt(Instant.parse("2025-03-01T10:30:00Z"))
                .reviewedBy(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567890"))
                .feedback("Great work!")
                .points(100)
                .completionContent("You found the hidden treasure!")
                .build();

        assertMatchesSnapshot("SubmissionResponse", dto);
    }

    @Test
    void baseProgressResponse_matchesSnapshot() throws IOException {
        BaseProgressResponse dto = BaseProgressResponse.builder()
                .baseId(UUID.fromString("a7b8c9d0-e1f2-3456-abcd-567890123456"))
                .baseName("Forest Clearing")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(true)
                .status("completed")
                .checkedInAt(Instant.parse("2025-03-01T09:15:00Z"))
                .challengeId(UUID.fromString("f6a7b8c9-d0e1-2345-fabc-456789012345"))
                .submissionStatus("approved")
                .build();

        assertMatchesSnapshot("BaseProgressResponse", dto);
    }

    @Test
    void leaderboardEntry_matchesSnapshot() throws IOException {
        LeaderboardEntry dto = LeaderboardEntry.builder()
                .teamId(UUID.fromString("c3d4e5f6-a7b8-9012-cdef-123456789012"))
                .teamName("Eagles")
                .color("#FF5733")
                .points(350)
                .completedChallenges(5)
                .build();

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
