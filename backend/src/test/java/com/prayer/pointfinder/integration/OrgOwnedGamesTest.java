package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.OrgMembership;
import com.prayer.pointfinder.entity.OrgPermission;
import com.prayer.pointfinder.entity.Organization;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Org-owned games end to end: who may create one, which workspace lists it,
 * who may delete it, and the fact that an org game is bounded by the org
 * plan rather than the creator's personal active-game quota.
 *
 * <p>Quota enforcement is on for the whole class so the personal one-game
 * free limit is real; the point of several of these cases is that org games
 * sit outside it.
 */
@TestPropertySource(properties = "app.quota.enforcement-enabled=true")
class OrgOwnedGamesTest extends IntegrationTestBase {

    private static final String GAMES = "/api/games";

    @Autowired
    private OrganizationRepository orgRepository;
    @Autowired
    private OrgMembershipRepository membershipRepository;

    private Organization org;

    @BeforeEach
    void createOrganization() {
        membershipRepository.deleteAll();
        orgRepository.deleteAll();
        User owner = createOperator("org-owner-" + UUID.randomUUID() + "@test.com", "password");
        org = orgRepository.save(Organization.builder()
                .name("Scout District")
                .slug("scout-district-" + UUID.randomUUID())
                .createdBy(owner)
                .build());
    }

    private User member(String label, OrgPermission... permissions) {
        User user = createOperator(label + "-" + UUID.randomUUID() + "@test.com", "password");
        int bits = 0;
        for (OrgPermission permission : permissions) {
            bits = OrgPermission.grant(bits, permission);
        }
        membershipRepository.save(OrgMembership.builder()
                .organization(org)
                .user(user)
                .permissions(bits)
                .build());
        return user;
    }

    private <T> ResponseEntity<T> call(User user, HttpMethod method, String path, Object body, Class<T> type) {
        return restTemplate.exchange(path, method,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), type);
    }

    private List<GameResponse> list(User user, String path) {
        return restTemplate.exchange(path, HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(user))),
                new ParameterizedTypeReference<List<GameResponse>>() {}).getBody();
    }

    private Map<String, Object> createBody(String name, UUID orgId) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        if (orgId != null) body.put("orgId", orgId.toString());
        return body;
    }

    @Test
    void aMemberWithCreateGamesCreatesAGameOwnedByTheOrg() {
        User creator = member("creator", OrgPermission.OPERATE_GAMES, OrgPermission.CREATE_GAMES);

        ResponseEntity<GameResponse> response = call(creator, HttpMethod.POST, GAMES,
                createBody("District rally", org.getId()), GameResponse.class);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(org.getId(), response.getBody().orgId());
        assertEquals("Scout District", response.getBody().orgName());
    }

    @Test
    void aMemberWithoutCreateGamesCannotCreateAnOrgGame() {
        User plain = member("operate-only", OrgPermission.OPERATE_GAMES);

        ResponseEntity<String> response = call(plain, HttpMethod.POST, GAMES,
                createBody("Not mine to make", org.getId()), String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void aNonMemberCannotCreateAGameInTheOrg() {
        User outsider = createOperator("outsider-" + UUID.randomUUID() + "@test.com", "password");

        ResponseEntity<String> response = call(outsider, HttpMethod.POST, GAMES,
                createBody("Trespassing", org.getId()), String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void anOrgGameDoesNotCountAgainstThePersonalActiveGameLimit() {
        User creator = member("creator", OrgPermission.OPERATE_GAMES, OrgPermission.CREATE_GAMES);

        // The single free personal slot goes to a personal game.
        assertEquals(HttpStatus.CREATED,
                call(creator, HttpMethod.POST, GAMES, createBody("My own game", null), GameResponse.class)
                        .getStatusCode());

        ResponseEntity<String> secondPersonal = call(creator, HttpMethod.POST, GAMES,
                createBody("One too many", null), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, secondPersonal.getStatusCode());
        assertTrue(secondPersonal.getBody().contains("QUOTA_ACTIVE_GAMES_EXCEEDED"));

        // The org game is bounded by the org plan instead, so it still lands.
        ResponseEntity<GameResponse> orgGame = call(creator, HttpMethod.POST, GAMES,
                createBody("District rally", org.getId()), GameResponse.class);
        assertEquals(HttpStatus.CREATED, orgGame.getStatusCode());
        assertEquals(org.getId(), orgGame.getBody().orgId());
    }

    @Test
    void aPracticeGameIgnoresTheOrgIdAndStaysPersonal() {
        User creator = member("creator", OrgPermission.OPERATE_GAMES, OrgPermission.CREATE_GAMES);
        Map<String, Object> body = createBody("Practice", org.getId());
        body.put("tutorialScenario", "first-game");

        ResponseEntity<GameResponse> response = call(creator, HttpMethod.POST, GAMES, body, GameResponse.class);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        // The request asked for a practice game, so the orgId is ignored. No
        // tutorial run is in progress here, so this lands as an ordinary
        // personal game rather than a practice one — either way, not the org's.
        assertNull(response.getBody().orgId());
    }

    @Test
    void theListingShowsOneWorkspaceAtATime() {
        User creator = member("creator", OrgPermission.OPERATE_GAMES, OrgPermission.CREATE_GAMES);
        createGame(creator, "Personal game", GameStatus.setup);
        UUID orgGameId = call(creator, HttpMethod.POST, GAMES,
                createBody("Org game", org.getId()), GameResponse.class).getBody().id();

        List<GameResponse> personal = list(creator, GAMES);
        assertEquals(List.of("Personal game"), personal.stream().map(GameResponse::name).toList());

        List<GameResponse> orgGames = list(creator, GAMES + "?orgId=" + org.getId());
        assertEquals(List.of(orgGameId), orgGames.stream().map(GameResponse::id).toList());
    }

    @Test
    void aNonMemberCannotListTheOrgWorkspace() {
        User outsider = createOperator("outsider-" + UUID.randomUUID() + "@test.com", "password");

        ResponseEntity<String> response = call(outsider, HttpMethod.GET,
                GAMES + "?orgId=" + org.getId(), null, String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void deletingAnOrgGameNeedsDeleteGames() {
        User creator = member("creator", OrgPermission.OPERATE_GAMES, OrgPermission.CREATE_GAMES);
        UUID gameId = call(creator, HttpMethod.POST, GAMES,
                createBody("Org game", org.getId()), GameResponse.class).getBody().id();

        // The creator may operate it but was not granted DELETE_GAMES.
        assertEquals(HttpStatus.FORBIDDEN,
                call(creator, HttpMethod.DELETE, GAMES + "/" + gameId, null, String.class).getStatusCode());

        User remover = member("remover", OrgPermission.OPERATE_GAMES, OrgPermission.DELETE_GAMES);
        assertEquals(HttpStatus.NO_CONTENT,
                call(remover, HttpMethod.DELETE, GAMES + "/" + gameId, null, String.class).getStatusCode());
        assertTrue(gameRepository.findById(gameId).isEmpty());
    }

    @Test
    void aMemberWithoutOperateGamesCannotOpenTheOrgGame() {
        User creator = member("creator", OrgPermission.OPERATE_GAMES, OrgPermission.CREATE_GAMES);
        Game orgGame = gameRepository.findById(call(creator, HttpMethod.POST, GAMES,
                createBody("Org game", org.getId()), GameResponse.class).getBody().id()).orElseThrow();

        User billingOnly = member("billing-only", OrgPermission.MANAGE_BILLING);

        assertEquals(HttpStatus.FORBIDDEN,
                call(billingOnly, HttpMethod.GET, GAMES + "/" + orgGame.getId(), null, String.class).getStatusCode());
    }
}
