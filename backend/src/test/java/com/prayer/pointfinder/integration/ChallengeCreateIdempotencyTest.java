package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CreateChallengeRequest;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-04: a client that is unsure whether its challenge create landed resends
 * it with the same idempotency key and gets the same challenge back — through
 * the body field, the {@code Idempotency-Key} header, sequentially and under a
 * real race — instead of a second empty challenge. Keys are scoped per game.
 */
class ChallengeCreateIdempotencyTest extends IntegrationTestBase {

    private User operator;
    private Game game;
    private String auth;
    private ExecutorService pool;

    @BeforeEach
    void setUpGame() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        operator = createOperator("idem-op-" + tag + "@test.com", "Password1");
        game = createGame(operator, "Idempotent " + tag, GameStatus.setup);
        auth = operatorAuthHeader(operator);
        pool = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
    }

    private static CreateChallengeRequest request(String title, UUID key) {
        CreateChallengeRequest r = new CreateChallengeRequest();
        r.setTitle(title);
        r.setAnswerType("text");
        r.setPoints(10);
        r.setIdempotencyKey(key);
        return r;
    }

    private ResponseEntity<ChallengeResponse> create(Game target, CreateChallengeRequest body, HttpHeaders headers) {
        return restTemplate.exchange("/api/games/" + target.getId() + "/challenges", HttpMethod.POST,
                new HttpEntity<>(body, headers), ChallengeResponse.class);
    }

    @Test
    void createWithoutKeyBehavesAsBefore() {
        ResponseEntity<ChallengeResponse> resp = create(game, request("Plain", null), headersWithAuth(auth));
        assertEquals(HttpStatus.CREATED, resp.getStatusCode());
        assertNotNull(resp.getBody().id());
        assertEquals(1, challengeRepository.countByGameId(game.getId()));

        // Without a key every send is a new challenge, as before.
        ResponseEntity<ChallengeResponse> again = create(game, request("Plain", null), headersWithAuth(auth));
        assertEquals(HttpStatus.CREATED, again.getStatusCode());
        assertNotEquals(resp.getBody().id(), again.getBody().id());
        assertEquals(2, challengeRepository.countByGameId(game.getId()));
    }

    @Test
    void sameBodyKeyTwiceReturnsTheSameChallenge() {
        UUID key = UUID.randomUUID();
        ResponseEntity<ChallengeResponse> first = create(game, request("Bell", key), headersWithAuth(auth));
        ResponseEntity<ChallengeResponse> replay = create(game, request("Bell", key), headersWithAuth(auth));

        assertEquals(HttpStatus.CREATED, first.getStatusCode());
        assertEquals(HttpStatus.CREATED, replay.getStatusCode());
        assertEquals(first.getBody().id(), replay.getBody().id());
        assertEquals("Bell", replay.getBody().title());
        assertEquals(1, challengeRepository.countByGameId(game.getId()));
        assertEquals(key, challengeRepository.findById(first.getBody().id()).orElseThrow().getIdempotencyKey());
    }

    @Test
    void idempotencyKeyHeaderIsAcceptedWhenTheBodyHasNone() {
        UUID key = UUID.randomUUID();
        HttpHeaders headers = headersWithAuth(auth);
        headers.set("Idempotency-Key", key.toString());

        ResponseEntity<ChallengeResponse> first = create(game, request("Header", null), headers);
        ResponseEntity<ChallengeResponse> replay = create(game, request("Header", null), headers);

        assertEquals(HttpStatus.CREATED, first.getStatusCode());
        assertEquals(HttpStatus.CREATED, replay.getStatusCode());
        assertEquals(first.getBody().id(), replay.getBody().id());
        assertEquals(1, challengeRepository.countByGameId(game.getId()));

        // The body field wins over the header when both are present.
        UUID bodyKey = UUID.randomUUID();
        ResponseEntity<ChallengeResponse> viaBody = create(game, request("Header", bodyKey), headers);
        assertEquals(HttpStatus.CREATED, viaBody.getStatusCode());
        assertNotEquals(first.getBody().id(), viaBody.getBody().id());
        assertEquals(bodyKey, challengeRepository.findById(viaBody.getBody().id()).orElseThrow().getIdempotencyKey());
        assertEquals(2, challengeRepository.countByGameId(game.getId()));
    }

    @Test
    void concurrentRetriesWithOneKeyCreateExactlyOneChallenge() throws Exception {
        UUID key = UUID.randomUUID();
        CountDownLatch go = new CountDownLatch(1);
        Callable<ResponseEntity<ChallengeResponse>> attempt = () -> {
            go.await(5, TimeUnit.SECONDS);
            return create(game, request("Race", key), headersWithAuth(auth));
        };
        List<Future<ResponseEntity<ChallengeResponse>>> futures = new ArrayList<>();
        futures.add(pool.submit(attempt));
        futures.add(pool.submit(attempt));
        go.countDown();

        List<ResponseEntity<ChallengeResponse>> results = new ArrayList<>();
        for (Future<ResponseEntity<ChallengeResponse>> f : futures) {
            results.add(f.get(30, TimeUnit.SECONDS));
        }

        for (ResponseEntity<ChallengeResponse> r : results) {
            assertEquals(HttpStatus.CREATED, r.getStatusCode(), "both retries answer 201");
            assertNotNull(r.getBody().id());
        }
        assertEquals(results.get(0).getBody().id(), results.get(1).getBody().id());
        assertEquals(1, challengeRepository.countByGameId(game.getId()));
    }

    @Test
    void theSameKeyInAnotherGameCreatesASeparateChallenge() {
        UUID key = UUID.randomUUID();
        Game other = createGame(operator, "Other " + UUID.randomUUID(), GameStatus.setup);

        ResponseEntity<ChallengeResponse> inFirst = create(game, request("Scoped", key), headersWithAuth(auth));
        ResponseEntity<ChallengeResponse> inOther = create(other, request("Scoped", key), headersWithAuth(auth));

        assertEquals(HttpStatus.CREATED, inFirst.getStatusCode());
        assertEquals(HttpStatus.CREATED, inOther.getStatusCode());
        assertNotEquals(inFirst.getBody().id(), inOther.getBody().id());
        assertEquals(game.getId(), inFirst.getBody().gameId());
        assertEquals(other.getId(), inOther.getBody().gameId());
        assertEquals(1, challengeRepository.countByGameId(game.getId()));
        assertEquals(1, challengeRepository.countByGameId(other.getId()));
    }

    @Test
    void malformedIdempotencyKeyHeaderIsRejected() {
        HttpHeaders headers = headersWithAuth(auth);
        headers.set("Idempotency-Key", "not-a-uuid");

        ResponseEntity<Map> resp = restTemplate.exchange("/api/games/" + game.getId() + "/challenges",
                HttpMethod.POST, new HttpEntity<>(request("Bad", null), headers), Map.class);

        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(String.valueOf(resp.getBody().get("message")).contains("Idempotency-Key"));
        assertEquals(0, challengeRepository.countByGameId(game.getId()));
    }
}
