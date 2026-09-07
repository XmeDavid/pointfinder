package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A team meets a challenge at exactly one base, and an "All Teams" row counts
 * for every team: the same challenge cannot be all-teams at one base and
 * team-specific at another, whether the rows arrive together or one by one.
 */
class AssignmentCrossColumnTest extends IntegrationTestBase {

    private static Map<String, Object> row(UUID baseId, UUID challengeId, UUID teamId) {
        Map<String, Object> row = new HashMap<>();
        row.put("baseId", baseId);
        row.put("challengeId", challengeId);
        row.put("teamId", teamId);
        return row;
    }

    private ResponseEntity<String> bulk(User user, Game game, List<Map<String, Object>> rows) {
        Map<String, Object> body = new HashMap<>();
        body.put("assignments", rows);
        return restTemplate.exchange("/api/games/" + game.getId() + "/assignments", HttpMethod.PUT,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), String.class);
    }

    private ResponseEntity<String> single(User user, Game game, Map<String, Object> row) {
        return restTemplate.exchange("/api/games/" + game.getId() + "/assignments", HttpMethod.POST,
                new HttpEntity<>(row, headersWithAuth(operatorAuthHeader(user))), String.class);
    }

    @Test
    void theReverseOrderRouteIsAcceptedAsSixPerTeamRows() {
        User operator = createOperator("cross-ok@test.com", "password");
        Game game = createGame(operator, "Reverse", GameStatus.setup);
        Base a = createBase(game, "A"); Base b = createBase(game, "B"); Base c = createBase(game, "C");
        Challenge c1 = createChallenge(game, "One", com.prayer.pointfinder.entity.AnswerType.text, 10);
        Challenge c2 = createChallenge(game, "Two", com.prayer.pointfinder.entity.AnswerType.text, 10);
        Challenge c3 = createChallenge(game, "Three", com.prayer.pointfinder.entity.AnswerType.text, 10);
        Team falcons = createTeam(game, "Falcons", "FALC001");
        Team lions = createTeam(game, "Lions", "LION001");

        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(a.getId(), c1.getId(), falcons.getId()));
        rows.add(row(b.getId(), c2.getId(), falcons.getId()));
        rows.add(row(c.getId(), c3.getId(), falcons.getId()));
        rows.add(row(a.getId(), c3.getId(), lions.getId()));
        rows.add(row(b.getId(), c2.getId(), lions.getId()));
        rows.add(row(c.getId(), c1.getId(), lions.getId()));

        assertEquals(HttpStatus.OK, bulk(operator, game, rows).getStatusCode());
    }

    @Test
    void rewritingTheGridOverExistingRowsSucceeds() {
        // Regression: the grid's PUT replaces the whole set. The delete was
        // only queued, Hibernate flushed the inserts first, and the second
        // write of any existing (base, team) pair died on the unique index.
        User operator = createOperator("cross-rewrite@test.com", "password");
        Game game = createGame(operator, "Rewrite", GameStatus.setup);
        Base a = createBase(game, "A"); Base b = createBase(game, "B");
        Challenge c1 = createChallenge(game, "One", com.prayer.pointfinder.entity.AnswerType.text, 10);
        Challenge c2 = createChallenge(game, "Two", com.prayer.pointfinder.entity.AnswerType.text, 10);
        Team falcons = createTeam(game, "Falcons", "FALC002");
        Team lions = createTeam(game, "Lions", "LION002");

        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(a.getId(), c1.getId(), falcons.getId()));
        rows.add(row(b.getId(), c2.getId(), falcons.getId()));
        rows.add(row(a.getId(), c2.getId(), lions.getId()));
        rows.add(row(b.getId(), c1.getId(), lions.getId()));
        assertEquals(HttpStatus.OK, bulk(operator, game, rows).getStatusCode());

        // The same set again, then one cell swapped: both are rewrites of live rows.
        assertEquals(HttpStatus.OK, bulk(operator, game, rows).getStatusCode());
        rows.set(0, row(a.getId(), c2.getId(), falcons.getId()));
        rows.set(1, row(b.getId(), c1.getId(), falcons.getId()));
        assertEquals(HttpStatus.OK, bulk(operator, game, rows).getStatusCode());
        assertEquals(4, assignmentRepository.findByGameId(game.getId()).size());
    }

    @Test
    void aChallengeCannotBeAllTeamsAtOneBaseAndTeamSpecificAtAnother() {
        User operator = createOperator("cross-bulk@test.com", "password");
        Game game = createGame(operator, "Cross", GameStatus.setup);
        Base a = createBase(game, "A"); Base c = createBase(game, "C");
        Challenge c1 = createChallenge(game, "One", com.prayer.pointfinder.entity.AnswerType.text, 10);
        Team falcons = createTeam(game, "Falcons", "FALC002");

        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(a.getId(), c1.getId(), null));
        rows.add(row(c.getId(), c1.getId(), falcons.getId()));
        ResponseEntity<String> refused = bulk(operator, game, rows);
        assertEquals(HttpStatus.CONFLICT, refused.getStatusCode());
        assertTrue(refused.getBody().contains("ASSIGNMENT_CHALLENGE_REPEATED"));

        // One by one, in either order.
        List<Map<String, Object>> onlyAll = new ArrayList<>();
        onlyAll.add(row(a.getId(), c1.getId(), null));
        assertEquals(HttpStatus.OK, bulk(operator, game, onlyAll).getStatusCode());
        ResponseEntity<String> thenTeam = single(operator, game, row(c.getId(), c1.getId(), falcons.getId()));
        assertEquals(HttpStatus.CONFLICT, thenTeam.getStatusCode());
        assertTrue(thenTeam.getBody().contains("ASSIGNMENT_CHALLENGE_REPEATED"));

        List<Map<String, Object>> onlyTeam = new ArrayList<>();
        onlyTeam.add(row(c.getId(), c1.getId(), falcons.getId()));
        assertEquals(HttpStatus.OK, bulk(operator, game, onlyTeam).getStatusCode());
        ResponseEntity<String> thenAll = single(operator, game, row(a.getId(), c1.getId(), null));
        assertEquals(HttpStatus.CONFLICT, thenAll.getStatusCode());
        assertTrue(thenAll.getBody().contains("ASSIGNMENT_CHALLENGE_REPEATED"));
    }
}
