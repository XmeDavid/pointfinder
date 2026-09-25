package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.realtime.RealtimeOutboxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-23: a supported, read-only way to inspect realtime events an instance
 * failed to deliver. There is deliberately no replay: events are refresh
 * signals and clients converge on a snapshot, so a late copy only causes a
 * needless refetch.
 */
class RealtimeDeadLetterIntegrationTest extends IntegrationTestBase {

    @Autowired private RealtimeOutboxRepository outbox;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private ResponseEntity<String> list(User user, String query) {
        return restTemplate.exchange("/api/admin/realtime/dead-letters" + query, HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(user))), String.class);
    }

    @Test
    void adminsReadRecentFailedEventsNewestFirstAndBounded() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        User admin = createAdmin("admin-" + tag + "@test.com", "Password1");
        User operator = createOperator("op-" + tag + "@test.com", "Password1");
        UUID gameId = createGame(operator, "Realtime " + tag, GameStatus.live).getId();
        long base = Math.abs(UUID.randomUUID().getMostSignificantBits() % 1_000_000_000L);
        for (int i = 0; i < 3; i++) {
            outbox.insertDeadLetter("api-" + tag, new RealtimeOutboxRepository.Row(base + i, 1, "api-" + tag, gameId, "operators", null,
                    "game_config", "{\"entity\":\"resources\",\"action\":\"updated\"}", Instant.now().minusSeconds(60L * (3 - i))),
                    4, "java.io.IOException: Broken pipe " + "x".repeat(i == 2 ? 2000 : 0));
        }

        ResponseEntity<String> response = list(admin, "?limit=2");
        assertEquals(HttpStatus.OK, response.getStatusCode(), response.getBody());
        JsonNode body = json.readTree(response.getBody());
        assertTrue(body.get("total").asLong() >= 3);
        JsonNode items = body.get("items");
        assertEquals(2, items.size());
        // Newest first; long errors are trimmed for display.
        assertEquals(base + 2, items.get(0).get("outboxId").asLong());
        assertEquals("api-" + tag, items.get(0).get("instanceId").asText());
        assertEquals(gameId.toString(), items.get(0).get("gameId").asText());
        assertEquals("game_config", items.get(0).get("eventType").asText());
        assertEquals(4, items.get(0).get("attempts").asInt());
        assertTrue(items.get(0).get("lastError").asText().length() <= 500);

        assertEquals(HttpStatus.FORBIDDEN, list(operator, "").getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, list(admin, "?limit=5000").getStatusCode());
    }
}
