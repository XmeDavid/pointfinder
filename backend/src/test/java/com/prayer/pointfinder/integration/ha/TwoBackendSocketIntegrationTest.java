package com.prayer.pointfinder.integration.ha;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.PointFinderApplication;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.realtime.RealtimeDispatcher;
import com.prayer.pointfinder.realtime.RealtimeEvent;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.socket.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Two actual HTTP servers/brokers sharing PostgreSQL, not two mocked dispatchers. */
@TestPropertySource(properties = {
        "app.instance-id=socket-node-a", "app.ha.outbox.poll-interval-ms=100",
        "spring.datasource.hikari.maximum-pool-size=5"
})
class TwoBackendSocketIntegrationTest extends IntegrationTestBase {
    @LocalServerPort int portA;
    @Autowired Environment environment;
    @Autowired ObjectMapper mapper;
    @Autowired ConfigurableApplicationContext contextA;

    private ConfigurableApplicationContext startB() {
        // All values come from the isolated Testcontainers database/test profile.
        return new SpringApplicationBuilder(PointFinderApplication.class).profiles("test").run(
                "--server.port=0", "--app.instance-id=socket-node-b",
                "--spring.datasource.url=" + environment.getRequiredProperty("spring.datasource.url"),
                "--spring.datasource.username=" + environment.getRequiredProperty("spring.datasource.username"),
                "--spring.datasource.password=" + environment.getRequiredProperty("spring.datasource.password"),
                "--spring.datasource.hikari.maximum-pool-size=5",
                "--app.ha.outbox.poll-interval-ms=100",
                "--spring.main.banner-mode=off");
    }

    @Test
    void authenticatedHttpMutationReachesBothSocketTransportsAndSurvivesPeerRestart() throws Exception {
        var operator = createOperator("socket-" + UUID.randomUUID() + "@example.test", "test-only-password");
        var game = createGame(operator, "Socket HA", GameStatus.setup);
        String auth = operatorAuthHeader(operator);
        var stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
        stompClient.setDefaultHeartbeat(new long[]{0, 0});
        ConfigurableApplicationContext b = null;
        List<SocketPair> sockets = new ArrayList<>();
        try {
            b = startB();
            int portB = ((WebServerApplicationContext) b).getWebServer().getPort();
            assertNotEquals(portA, portB);
            SocketPair aSockets = connect(stompClient, contextA, portA, game.getId(), auth);
            SocketPair bSockets = connect(stompClient, b, portB, game.getId(), auth);
            sockets.add(aSockets);
            sockets.add(bSockets);

            rename(portA, game.getId(), auth, "Committed on A");
            long versionA = assertFanout(aSockets, bSockets);
            assertGameName(portB, game.getId(), auth, "Committed on A");

            rename(portB, game.getId(), auth, "Committed on B");
            long versionB = assertFanout(aSockets, bSockets);
            assertTrue(versionB > versionA);
            assertGameName(portA, game.getId(), auth, "Committed on B");

            bSockets.close();
            sockets.remove(bSockets);
            b.close();
            b = null;
            // A continues serving while B is completely stopped.
            rename(portA, game.getId(), auth, "Peer offline");
            aSockets.expectConfig();
            b = startB();
            portB = ((WebServerApplicationContext) b).getWebServer().getPort();
            // Reconnecting clients refresh authoritative state, not a promise
            // of durable per-socket delivery while they were disconnected.
            assertGameName(portB, game.getId(), auth, "Peer offline");
            SocketPair recovered = connect(stompClient, b, portB, game.getId(), auth);
            sockets.add(recovered);
            rename(portB, game.getId(), auth, "Peer recovered");
            assertTrue(assertFanout(aSockets, recovered) > versionB);

            var noAuth = restTemplate.getForEntity(url(portB, "/api/games/" + game.getId()), String.class);
            assertTrue(noAuth.getStatusCode().is4xxClientError(), "replica must still enforce HTTP authorization");
        } finally {
            for (SocketPair pair : sockets) pair.close();
            if (b != null) b.close();
            stompClient.stop();
        }
    }

    private void rename(int port, UUID gameId, String auth, String name) {
        var result = restTemplate.exchange(url(port, "/api/games/" + gameId), HttpMethod.PUT,
                new HttpEntity<>(Map.of("name", name), headersWithAuth(auth)), String.class);
        assertEquals(200, result.getStatusCode().value(), result.getBody());
    }

    private void assertGameName(int port, UUID gameId, String auth, String expected) throws Exception {
        var result = restTemplate.exchange(url(port, "/api/games/" + gameId), HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(auth)), String.class);
        assertEquals(200, result.getStatusCode().value(), result.getBody());
        assertEquals(expected, mapper.readTree(result.getBody()).path("name").asText());
    }

    private long assertFanout(SocketPair a, SocketPair b) throws Exception {
        long first = a.expectConfig();
        assertEquals(first, b.expectConfig(), "both replicas must see the same committed state version");
        return first;
    }

    private SocketPair connect(WebSocketStompClient client, ConfigurableApplicationContext context,
                               int port, UUID gameId, String auth) throws Exception {
        var messages = new LinkedBlockingQueue<JsonNode>();
        var nativeMessages = new LinkedBlockingQueue<JsonNode>();
        var headers = new StompHeaders();
        headers.set("Authorization", auth);
        StompSession session = client.connectAsync("ws://localhost:" + port + "/ws-native",
                new WebSocketHttpHeaders(), headers, new StompSessionHandlerAdapter() {}).get(15, TimeUnit.SECONDS);
        WebSocketSession nativeSession = null;
        try {
            session.subscribe("/topic/games/" + gameId, new StompFrameHandler() {
                public Type getPayloadType(StompHeaders h) { return JsonNode.class; }
                public void handleFrame(StompHeaders h, Object payload) { messages.add((JsonNode) payload); }
            });
            var nativeHeaders = new WebSocketHttpHeaders();
            nativeHeaders.set("Authorization", auth);
            nativeSession = new StandardWebSocketClient().execute(new TextWebSocketHandler() {
                @Override
                protected void handleTextMessage(WebSocketSession s, TextMessage message) throws Exception {
                    nativeMessages.add(mapper.readTree(message.getPayload()));
                }
            }, nativeHeaders, URI.create("ws://localhost:" + port + "/ws/mobile?gameId=" + gameId))
                    .get(15, TimeUnit.SECONDS);
            // Spring's simple broker does not implement STOMP receipts. Probe
            // the real socket paths to establish subscription readiness before
            // testing one-shot HTTP mutations through the durable outbox.
            boolean stompReady = false;
            boolean mobileReady = false;
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while ((!stompReady || !mobileReady) && System.nanoTime() < deadline) {
                context.getBean(RealtimeDispatcher.class).dispatch(RealtimeEvent.all(gameId, "test_ready",
                        Map.of("type", "test_ready", "gameId", gameId.toString())));
                JsonNode s = messages.poll(100, TimeUnit.MILLISECONDS);
                JsonNode m = nativeMessages.poll(100, TimeUnit.MILLISECONDS);
                stompReady |= s != null && "test_ready".equals(s.path("type").asText());
                mobileReady |= m != null && "test_ready".equals(m.path("type").asText());
            }
            assertTrue(stompReady && mobileReady, "both authenticated socket transports must be subscribed");
            return new SocketPair(session, nativeSession, messages, nativeMessages);
        } catch (Throwable error) {
            session.disconnect();
            if (nativeSession != null) nativeSession.close();
            throw error;
        }
    }

    private static String url(int port, String path) { return "http://localhost:" + port + path; }

    private record SocketPair(StompSession stomp, WebSocketSession mobile,
                              LinkedBlockingQueue<JsonNode> stompMessages,
                              LinkedBlockingQueue<JsonNode> nativeMessages) implements AutoCloseable {
        long expectConfig() throws Exception {
            JsonNode a = config(stompMessages);
            JsonNode b = config(nativeMessages);
            assertTrue(a.hasNonNull("stateVersion"));
            assertEquals(a.path("stateVersion").asLong(), b.path("stateVersion").asLong());
            return a.path("stateVersion").asLong();
        }
        private static JsonNode config(LinkedBlockingQueue<JsonNode> queue) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (System.nanoTime() < deadline) {
                JsonNode event = queue.poll(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                if (event != null && "game_config".equals(event.path("type").asText())) return event;
            }
            fail("No game_config event arrived on the authenticated socket");
            return null;
        }
        public void close() {
            try { if (stomp.isConnected()) stomp.disconnect(); } catch (Exception ignored) { }
            try { mobile.close(); } catch (Exception ignored) { }
        }
    }
}
