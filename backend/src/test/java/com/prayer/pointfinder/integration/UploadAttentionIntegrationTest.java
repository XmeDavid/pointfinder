package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionChunk;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.UploadSessionChunkRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-18: operators see uploads that need them. A transfer is stalled when it
 * is still active but no chunk arrived for the stall threshold (30 minutes by
 * default); an upload is unlinked when it finished but no answer claimed it.
 * Nothing is changed or deleted: the player's app still holds the bytes and
 * resumes when it can, so the operator's action is to contact the team.
 */
class UploadAttentionIntegrationTest extends IntegrationTestBase {

    @Autowired private UploadSessionRepository sessions;
    @Autowired private UploadSessionChunkRepository chunks;
    @Autowired private JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private User owner;
    private User stranger;
    private Game game;
    private Team falcons;
    private Player ana;

    @BeforeEach
    void setUpUploads() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        owner = createOperator("owner-" + tag + "@test.com", "Password1");
        stranger = createOperator("stranger-" + tag + "@test.com", "Password1");
        game = createGame(owner, "Upload trail " + tag, GameStatus.live);
        falcons = createTeam(game, "Falcons", "F" + tag.substring(0, 6).toUpperCase());
        ana = createPlayer(falcons, "Ana", "device-" + tag);
    }

    private UploadSession session(String fileName, UploadSessionStatus status, int totalChunks, Duration createdAgo) {
        UploadSession s = sessions.save(UploadSession.builder()
                .game(game).player(ana).originalFileName(fileName).contentType("image/jpeg")
                .totalSizeBytes(totalChunks * 1000L).chunkSizeBytes(1000).totalChunks(totalChunks)
                .status(status).expiresAt(Instant.now().plus(Duration.ofHours(12)))
                .completedAt(status == UploadSessionStatus.completed ? Instant.now().minus(createdAgo) : null)
                .fileUrl(status == UploadSessionStatus.completed ? "/api/games/" + game.getId() + "/files/" + fileName : null)
                .build());
        jdbc.update("UPDATE upload_sessions SET created_at = ? WHERE id = ?", Timestamp.from(Instant.now().minus(createdAgo)), s.getId());
        return s;
    }

    private void chunk(UploadSession s, int index, Duration ago) {
        chunks.save(UploadSessionChunk.builder().sessionId(s.getId()).chunkIndex(index).chunkSizeBytes(1000).build());
        jdbc.update("UPDATE upload_session_chunks SET created_at = ? WHERE session_id = ? AND chunk_index = ?",
                Timestamp.from(Instant.now().minus(ago)), s.getId(), index);
    }

    private ResponseEntity<String> attention(User user) {
        return restTemplate.exchange("/api/games/" + game.getId() + "/uploads/attention", HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(user))), String.class);
    }

    private JsonNode node(String body) {
        try {
            return json.readTree(body);
        } catch (Exception e) {
            throw new AssertionError("Not JSON: " + body, e);
        }
    }

    @Test
    void operatorsSeeStalledAndUnlinkedUploadsWithWhoToContact() {
        UploadSession stalled = session("stalled.jpg", UploadSessionStatus.active, 5, Duration.ofMinutes(90));
        chunk(stalled, 0, Duration.ofMinutes(80));
        chunk(stalled, 1, Duration.ofMinutes(45));
        UploadSession neverStarted = session("waiting.jpg", UploadSessionStatus.active, 3, Duration.ofMinutes(40));
        UploadSession moving = session("moving.jpg", UploadSessionStatus.active, 4, Duration.ofMinutes(60));
        chunk(moving, 0, Duration.ofMinutes(5));
        session("recent.jpg", UploadSessionStatus.active, 2, Duration.ofMinutes(10));
        session("unlinked.jpg", UploadSessionStatus.completed, 1, Duration.ofMinutes(20));
        session("just-finished.jpg", UploadSessionStatus.completed, 1, Duration.ofMinutes(2));

        ResponseEntity<String> response = attention(owner);
        assertEquals(HttpStatus.OK, response.getStatusCode(), response.getBody());
        List<String> seen = new ArrayList<>();
        JsonNode stalledRow = null;
        for (JsonNode row : node(response.getBody())) {
            seen.add(row.get("kind").asText() + ":" + row.get("fileName").asText());
            if (row.get("sessionId").asText().equals(stalled.getId().toString())) stalledRow = row;
        }
        // Oldest problem first; transfers still moving and fresh ones are left alone.
        assertEquals(List.of("stalled:stalled.jpg", "stalled:waiting.jpg", "unlinked:unlinked.jpg"), seen);
        assertEquals("Falcons", stalledRow.get("teamName").asText());
        assertEquals("Ana", stalledRow.get("playerName").asText());
        assertEquals(5000, stalledRow.get("totalBytes").asLong());
        assertEquals(2000, stalledRow.get("receivedBytes").asLong());
        // "since" is the last progress, not when the upload began.
        Instant since = Instant.parse(stalledRow.get("since").asText());
        assertTrue(Duration.between(since, Instant.now()).toMinutes() >= 44, since.toString());

        JsonNode snapshot = node(restTemplate.exchange("/api/games/" + game.getId() + "/snapshot", HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(owner))), String.class).getBody());
        assertEquals(2, snapshot.get("stalledUploads").asInt());
        assertEquals(1, snapshot.get("needsAttention").asInt());
    }

    @Test
    void onlyOperatorsOfTheGameSeeIt() {
        assertEquals(HttpStatus.FORBIDDEN, attention(stranger).getStatusCode());
    }
}
