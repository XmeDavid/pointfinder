package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for all go-live readiness conditions enforced by GameService.validateGoLivePrerequisites.
 *
 * Conditions tested:
 * 1. No bases → rejected
 * 2. NFC tags not linked → rejected
 * 3. No teams → rejected
 * 4. Not enough challenges (fewer challenges than bases) → rejected
 * 5. Location-bound challenge not assigned to any base → rejected
 * 6. Incomplete team variables → rejected
 * 7. All conditions met → succeeds
 */
class GoLiveReadinessTest extends IntegrationTestBase {

    private static int counter = 0;

    private String suffix() {
        return String.valueOf(++counter);
    }

    /** Creates a game via API with a fresh operator and returns (gameId, opHeaders). */
    private GameContext createGame(String nameSuffix) {
        User operator = createOperator("golive-" + nameSuffix + "@test.com", "password123");
        HttpHeaders opHeaders = headersWithAuth(operatorAuthHeader(operator));

        CreateGameRequest req = new CreateGameRequest();
        req.setName("GoLive Test " + nameSuffix);
        ResponseEntity<GameResponse> resp = restTemplate.exchange(
                "/api/games", HttpMethod.POST,
                new HttpEntity<>(req, opHeaders), GameResponse.class);
        assertEquals(HttpStatus.CREATED, resp.getStatusCode());
        return new GameContext(resp.getBody().getId(), opHeaders);
    }

    private ResponseEntity<String> tryGoLive(GameContext ctx) {
        UpdateGameStatusRequest goLive = new UpdateGameStatusRequest();
        goLive.setStatus("live");
        return restTemplate.exchange(
                "/api/games/" + ctx.gameId + "/status", HttpMethod.PATCH,
                new HttpEntity<>(goLive, ctx.opHeaders), String.class);
    }

    // ── Tests ────────────────────────────────────────────────────────

    @Test
    void noBases_goLiveRejected() {
        GameContext ctx = createGame("nobase");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        // Add team and challenge but NO base
        createTeam(game, "Team A", "NBASE1");
        createChallenge(game, "Challenge A", AnswerType.text, 50);

        ResponseEntity<String> resp = tryGoLive(ctx);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("base"), "Error should mention 'base'");
    }

    @Test
    void nfcTagNotLinked_goLiveRejected() {
        GameContext ctx = createGame("nfclink");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        // Create a base WITHOUT NFC linked
        Base base = Base.builder()
                .game(game)
                .name("Unlinked Base")
                .description("No NFC")
                .lat(47.0)
                .lng(8.0)
                .nfcLinked(false)
                .build();
        baseRepository.save(base);

        createTeam(game, "Team NFC", "NFCL01");
        createChallenge(game, "Challenge NFC", AnswerType.text, 50);

        ResponseEntity<String> resp = tryGoLive(ctx);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("NFC") || resp.getBody().contains("nfc") || resp.getBody().contains("linked"),
                "Error should mention NFC linking");
    }

    @Test
    void noTeams_goLiveRejected() {
        GameContext ctx = createGame("noteam");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        // Base and challenge but NO team
        createBase(game, "Base A");
        createChallenge(game, "Challenge A", AnswerType.text, 50);

        ResponseEntity<String> resp = tryGoLive(ctx);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("team"), "Error should mention 'team'");
    }

    @Test
    void notEnoughChallenges_goLiveRejected() {
        GameContext ctx = createGame("fewchallenges");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        // 2 bases but only 1 challenge (baseCount > challengeCount triggers rejection)
        createBase(game, "Base 1");
        createBase(game, "Base 2");
        createTeam(game, "Team X", "FEWC01");
        createChallenge(game, "Challenge Only One", AnswerType.text, 50);
        // Only 1 challenge for 2 bases

        ResponseEntity<String> resp = tryGoLive(ctx);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("challenge") || resp.getBody().contains("assignment"),
                "Error should mention challenge or assignment shortage");
    }

    @Test
    void locationBoundChallengeNotAssignedToBase_goLiveRejected() {
        GameContext ctx = createGame("locbound");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        createBase(game, "Base Loc");
        createTeam(game, "Team Loc", "LOCB01");

        // Location-bound challenge not fixed to any base, not assigned
        Challenge locationBound = Challenge.builder()
                .game(game)
                .title("Location Challenge")
                .description("Must be at specific base")
                .content("Challenge content")
                .completionContent("Well done!")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(50)
                .locationBound(true)
                .build();
        challengeRepository.save(locationBound);

        // Also add a non-location-bound challenge so the count check passes (2 challenges >= 1 base)
        createChallenge(game, "Regular Challenge", AnswerType.text, 30);

        ResponseEntity<String> resp = tryGoLive(ctx);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("location") || resp.getBody().contains("bound") || resp.getBody().contains("assigned"),
                "Error should mention location-bound challenge not assigned");
    }

    @Test
    void incompleteTeamVariables_goLiveRejected() {
        GameContext ctx = createGame("teamvars");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        createBase(game, "Base Var");
        createChallenge(game, "Challenge Var", AnswerType.text, 50);
        Team team1 = createTeam(game, "Team Var 1", "VAR001");
        Team team2 = createTeam(game, "Team Var 2", "VAR002");

        // Save a game-level variable for team1 only — team2 is missing the value
        TeamVariable var = TeamVariable.builder()
                .game(game)
                .team(team1)
                .variableKey("secretCode")
                .variableValue("alpha")
                .build();
        teamVariableRepository.save(var);
        // team2 has no entry for "secretCode" → incompleteness

        ResponseEntity<String> resp = tryGoLive(ctx);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("variable") || resp.getBody().contains("secretCode"),
                "Error should mention incomplete team variables");
    }

    @Test
    void allConditionsMet_goLiveSucceeds() {
        GameContext ctx = createGame("allgood");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        // NFC-linked base, challenge (>= bases count), team — no location-bound, no team vars
        createBase(game, "Good Base");
        createChallenge(game, "Good Challenge", AnswerType.text, 100);
        createTeam(game, "Good Team", "GOOD01");

        UpdateGameStatusRequest goLiveReq = new UpdateGameStatusRequest();
        goLiveReq.setStatus("live");
        ResponseEntity<GameResponse> resp = restTemplate.exchange(
                "/api/games/" + ctx.gameId + "/status", HttpMethod.PATCH,
                new HttpEntity<>(goLiveReq, ctx.opHeaders),
                GameResponse.class);

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("live", resp.getBody().getStatus());
    }

    @Test
    void mixedNfcLinkedBases_partialLink_goLiveRejected() {
        GameContext ctx = createGame("mixednfc");
        Game game = gameRepository.findById(ctx.gameId).orElseThrow();

        // One linked, one not linked
        createBase(game, "Linked Base");    // nfcLinked=true (from createBase helper)
        Base unlinked = Base.builder()
                .game(game)
                .name("Unlinked Base 2")
                .description("No NFC")
                .lat(47.1)
                .lng(8.1)
                .nfcLinked(false)
                .build();
        baseRepository.save(unlinked);

        createTeam(game, "Team Mixed", "MIX001");
        // Need 2 challenges for 2 bases
        createChallenge(game, "Challenge 1", AnswerType.text, 50);
        createChallenge(game, "Challenge 2", AnswerType.text, 50);

        ResponseEntity<String> resp = tryGoLive(ctx);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("NFC") || resp.getBody().contains("nfc") || resp.getBody().contains("linked"),
                "Error should mention NFC linking");
    }

    // ── Helper record ─────────────────────────────────────────────────

    private record GameContext(UUID gameId, HttpHeaders opHeaders) {}

    @org.springframework.beans.factory.annotation.Autowired
    protected com.prayer.pointfinder.repository.TeamVariableRepository teamVariableRepository;
}
