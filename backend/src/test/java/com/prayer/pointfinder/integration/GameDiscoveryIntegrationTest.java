package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.repository.GamePublicationRepository;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import com.prayer.pointfinder.entity.GamePublicationEvent;
import com.prayer.pointfinder.repository.GamePublicationEventRepository;
import java.util.List;
import org.springframework.http.ResponseEntity;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * PF-07/PF-08 against Postgres: games stay unlisted until the owner publishes
 * a separately authored summary under the game's own name; signed-in accounts
 * browse, filter and join through the account participation contract; nothing
 * private leaks.
 */
class GameDiscoveryIntegrationTest extends IntegrationTestBase {

    @Autowired private PlayerJoinRateLimiter rateLimiter;
    @Autowired private GamePublicationRepository publicationRepository;
    @Autowired private GamePublicationEventRepository publicationEventRepository;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private User owner;
    private User coOperator;
    private User stranger;
    private User participant;
    private User admin;
    private Game game;
    private Team falcons;
    private Team owls;

    @BeforeEach
    void setUpDiscovery() {
        rateLimiter.clear();
        String tag = UUID.randomUUID().toString().substring(0, 8);
        owner = createOperator("owner-" + tag + "@test.com", "Password1");
        owner.setName("Lavos Pathfinder");
        owner = userRepository.save(owner);
        coOperator = createOperator("coop-" + tag + "@test.com", "Password1");
        stranger = createOperator("stranger-" + tag + "@test.com", "Password1");
        admin = createAdmin("admin-" + tag + "@test.com", "Password1");
        participant = userRepository.save(User.builder()
                .email("ana-" + tag + "@test.com").name("Ana").passwordHash(passwordEncoder.encode("Secret123"))
                .role(UserRole.participant).build());
        game = createGame(owner, "Salt and sand " + tag, GameStatus.live);
        game.setDescription("PRIVATE-DESCRIPTION-" + tag);
        game.getOperators().add(coOperator);
        game = gameRepository.save(game);
        falcons = createTeam(game, "Falcons", "FALC" + tag.substring(0, 4).toUpperCase());
        owls = createTeam(game, "Owls", "OWLS" + tag.substring(0, 4).toUpperCase());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private Map<String, Object> summary(UUID admissionTeamId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Salt, sand & hidden stories");
        body.put("summary", "A coastal trail for families.");
        body.put("place", "Costa de Lavos");
        body.put("lat", 40.0797);
        body.put("lng", -8.8708);
        body.put("category", "coast");
        body.put("admissionTeamId", admissionTeamId);
        return body;
    }

    private ResponseEntity<String> call(User user, HttpMethod method, String path, Object body) {
        return restTemplate.exchange(path, method, new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), String.class);
    }

    private ResponseEntity<String> publicationPut(User user, Game g, Map<String, Object> body) {
        return call(user, HttpMethod.PUT, "/api/games/" + g.getId() + "/publication", body);
    }

    private ResponseEntity<String> publish(User user, Game g) {
        return call(user, HttpMethod.POST, "/api/games/" + g.getId() + "/publication/publish", null);
    }

    private JsonNode node(ResponseEntity<String> response) {
        try {
            return json.readTree(response.getBody());
        } catch (Exception e) {
            throw new AssertionError("Not JSON: " + response.getBody(), e);
        }
    }

    private JsonNode explore(User user, String query) {
        ResponseEntity<String> r = call(user, HttpMethod.GET, "/api/explore/games" + query, null);
        assertEquals(HttpStatus.OK, r.getStatusCode(), r.getBody());
        return node(r);
    }

    private ResponseEntity<String> exploreJoin(User user, Game g, String deviceId) {
        return call(user, HttpMethod.POST, "/api/explore/games/" + g.getId() + "/join", Map.of("displayName", user.getName(), "deviceId", deviceId));
    }

    private void listedByOwner(Game g, UUID admissionTeamId) {
        assertEquals(HttpStatus.OK, publicationPut(owner, g, summary(admissionTeamId)).getStatusCode());
        assertEquals(HttpStatus.OK, publish(owner, g).getStatusCode());
    }

    // ── unlisted by default, nothing private ────────────────────────────

    @Test
    void gamesStayUnlistedUntilPublishedAndNeverLeakPrivateContent() {
        // Nothing listed: empty page, and no game is reachable by id, draft or not.
        JsonNode empty = explore(participant, "");
        assertEquals(0, empty.get("total").asLong());
        assertEquals(HttpStatus.NOT_FOUND, call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null).getStatusCode());

        assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(falcons.getId())).getStatusCode());
        JsonNode draft = node(call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null));
        assertFalse(draft.get("listed").asBoolean());
        assertEquals(0, explore(participant, "").get("total").asLong());
        assertEquals(HttpStatus.NOT_FOUND, call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null).getStatusCode());

        assertEquals(HttpStatus.OK, publish(owner, game).getStatusCode());
        ResponseEntity<String> listed = call(participant, HttpMethod.GET, "/api/explore/games", null);
        JsonNode page = node(listed);
        assertEquals(1, page.get("total").asLong());
        JsonNode item = page.get("items").get(0);
        assertEquals(game.getId().toString(), item.get("gameId").asText());
        // The listing title is the game's name; the request's title is accepted but ignored.
        assertEquals(game.getName(), item.get("title").asText());
        assertEquals(game.getName(), draft.get("title").asText());
        assertEquals(game.getName(), draft.get("gameName").asText());
        assertEquals("Costa de Lavos", item.get("place").asText());
        assertEquals("coast", item.get("category").asText());
        assertEquals("Lavos Pathfinder", item.get("organizer").asText());
        assertEquals("live", item.get("gameStatus").asText());
        assertEquals("open", item.get("admission").asText());
        assertTrue(item.get("joinable").asBoolean());
        assertFalse(item.get("joined").asBoolean());
        // The private game description, the team names and the join codes never appear.
        String body = listed.getBody();
        assertFalse(body.contains("PRIVATE-DESCRIPTION"), body);
        assertFalse(body.contains(falcons.getJoinCode()), body);
        assertFalse(body.contains("Falcons"), body);
        assertFalse(body.contains("Salt, sand & hidden stories"), body);
        assertNull(item.get("description"));
        assertNull(item.get("admissionTeamId"));

        JsonNode detail = node(call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null));
        assertEquals(game.getName(), detail.get("title").asText());
    }

    // ── title follows the game name ─────────────────────────────────────

    @Test
    void listingTitleFollowsTheGameNameAfterARename() {
        listedByOwner(game, falcons.getId());
        String newName = "Renamed-trail-" + UUID.randomUUID().toString().substring(0, 8);
        game.setName(newName);
        gameRepository.save(game);

        // No resave of the publication: every read derives the title from the current game name.
        JsonNode publication = node(call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null));
        assertEquals(newName, publication.get("title").asText());
        assertEquals(newName, publication.get("gameName").asText());
        assertEquals(newName, node(call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null)).get("title").asText());
        assertEquals(newName, explore(participant, "").get("items").get(0).get("title").asText());
        assertEquals(newName, node(call(admin, HttpMethod.GET, "/api/admin/publications", null)).get(0).get("title").asText());

        // Search follows the rename too: the new name matches, the old one no longer does.
        assertEquals(1, explore(participant, "?q=" + newName).get("total").asLong());
        assertEquals(0, explore(participant, "?q=Salt").get("total").asLong());

        // A request without a title, or with a title that differs from the game name, is accepted and ignored.
        Map<String, Object> noTitle = summary(falcons.getId());
        noTitle.remove("title");
        JsonNode saved = node(publicationPut(owner, game, noTitle));
        assertEquals(newName, saved.get("title").asText());
        Map<String, Object> otherTitle = summary(falcons.getId());
        otherTitle.put("title", "Something else entirely");
        assertEquals(newName, node(publicationPut(owner, game, otherTitle)).get("title").asText());
        assertTrue(node(call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null)).get("listed").asBoolean());
    }

    @Test
    void gameNamesLongerThanTheOldTitleBoundAreSavedAndReturnedInFull() {
        // games.name allows 255 characters; the listing title is that name, untruncated, and the
        // client still sends it back as the (ignored) request title.
        String longName = ("Long trail " + UUID.randomUUID().toString().substring(0, 8) + " ").repeat(10).trim();
        assertTrue(longName.length() > 120 && longName.length() <= 255, String.valueOf(longName.length()));
        game.setName(longName);
        gameRepository.save(game);

        Map<String, Object> body = summary(falcons.getId());
        body.put("title", longName);
        ResponseEntity<String> saved = publicationPut(owner, game, body);
        assertEquals(HttpStatus.OK, saved.getStatusCode(), saved.getBody());
        assertEquals(longName, node(saved).get("title").asText());
        assertEquals(HttpStatus.OK, publish(owner, game).getStatusCode());
        assertEquals(longName, explore(participant, "").get("items").get(0).get("title").asText());
        assertEquals(longName, node(call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null)).get("title").asText());
        assertEquals(longName, publicationRepository.findById(game.getId()).orElseThrow().getTitle());
    }

    // ── permissions ─────────────────────────────────────────────────────

    @Test
    void onlyOwnerOrAdminPublishesWhileCoOperatorsRead() {
        assertEquals(HttpStatus.FORBIDDEN, publicationPut(coOperator, game, summary(null)).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, publicationPut(stranger, game, summary(null)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, publish(owner, game).getStatusCode()); // no draft yet

        assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(null)).getStatusCode());
        assertEquals(HttpStatus.OK, call(coOperator, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(stranger, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, publish(coOperator, game).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(coOperator, HttpMethod.POST, "/api/games/" + game.getId() + "/publication/unpublish", null).getStatusCode());

        assertEquals(HttpStatus.OK, publish(admin, game).getStatusCode());
        JsonNode listed = node(call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null));
        assertTrue(listed.get("listed").asBoolean());
        assertEquals(admin.getId().toString(), listed.get("publishedById").asText());

        // Every account role browses; a player token and anonymous callers do not.
        for (User u : new User[] {participant, owner, stranger, admin}) {
            assertEquals(1, explore(u, "").get("total").asLong());
        }
        Player guest = createPlayer(falcons, "Guest", "guest-device");
        ResponseEntity<String> asPlayer = restTemplate.exchange("/api/explore/games", HttpMethod.GET, new HttpEntity<>(headersWithAuth(playerAuthHeader(guest))), String.class);
        assertEquals(HttpStatus.FORBIDDEN, asPlayer.getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED, restTemplate.getForEntity("/api/explore/games", String.class).getStatusCode());
    }

    @Test
    void everyListingChangeLeavesAnAuditRowWithItsActor() {
        assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(falcons.getId())).getStatusCode());
        assertEquals(HttpStatus.OK, publish(owner, game).getStatusCode());
        assertEquals(HttpStatus.OK, call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/feature", null).getStatusCode());
        assertEquals(HttpStatus.OK, call(owner, HttpMethod.POST, "/api/games/" + game.getId() + "/publication/unpublish", null).getStatusCode());

        List<GamePublicationEvent> rows = publicationEventRepository.findByGameIdOrderByCreatedAtAsc(game.getId());
        assertEquals(List.of("admission", "publish", "feature", "unpublish"),
                rows.stream().map(GamePublicationEvent::getOperation).toList());
        assertEquals(owner.getId(), rows.get(0).getActorUser().getId());
        assertEquals("Lavos Pathfinder", rows.get(0).getActorNameSnapshot());
        assertEquals(falcons.getId(), rows.get(0).getTeam().getId());
        assertNull(rows.get(0).getPreviousTeam());
        assertEquals(admin.getId(), rows.get(2).getActorUser().getId());
        assertNull(rows.get(3).getTeam());
    }

    @Test
    void listingChangesAreCappedPerAccount() {
        for (int i = 0; i < 60; i++) {
            assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(null)).getStatusCode(), "change " + (i + 1));
        }
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, publicationPut(owner, game, summary(null)).getStatusCode());
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, publish(owner, game).getStatusCode());
        // The cap is per account: the platform admin still acts on the same game.
        assertEquals(HttpStatus.OK, publish(admin, game).getStatusCode());
    }

    @Test
    void featuredCurationIsPlatformAdminOnlyAndClearsOnUnpublish() {
        assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(null)).getStatusCode());
        // A draft cannot be featured; neither the owner nor a participant may curate.
        assertEquals(HttpStatus.FORBIDDEN, call(owner, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/feature", null).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(participant, HttpMethod.GET, "/api/admin/publications", null).getStatusCode());
        ResponseEntity<String> draftFeature = call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/feature", null);
        assertEquals(HttpStatus.BAD_REQUEST, draftFeature.getStatusCode());
        assertEquals("PUBLICATION_NOT_ALLOWED", node(draftFeature).get("code").asText());

        assertEquals(HttpStatus.OK, publish(owner, game).getStatusCode());
        JsonNode featured = node(call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/feature", null));
        assertTrue(featured.get("featured").asBoolean());
        assertNotNull(featured.get("featuredAt").asText());
        assertTrue(explore(participant, "?featured=true").get("items").get(0).get("featured").asBoolean());
        assertEquals(1, node(call(admin, HttpMethod.GET, "/api/admin/publications", null)).size());

        assertEquals(HttpStatus.OK, call(owner, HttpMethod.POST, "/api/games/" + game.getId() + "/publication/unpublish", null).getStatusCode());
        JsonNode after = node(call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null));
        assertFalse(after.get("listed").asBoolean());
        assertFalse(after.get("featured").asBoolean());
        assertEquals(0, explore(participant, "").get("total").asLong());
        assertEquals(HttpStatus.NOT_FOUND, call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null).getStatusCode());
    }

    // ── validation of the summary and admission team ────────────────────

    @Test
    void summaryValidationAndPublishGates() {
        Game other = createGame(owner, "Other " + UUID.randomUUID(), GameStatus.live);
        Team foreign = createTeam(other, "Foreign", "FORE" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());

        ResponseEntity<String> wrongGame = publicationPut(owner, game, summary(foreign.getId()));
        assertEquals(HttpStatus.BAD_REQUEST, wrongGame.getStatusCode());
        assertEquals("PUBLICATION_TEAM_INVALID", node(wrongGame).get("code").asText());
        ResponseEntity<String> unknown = publicationPut(owner, game, summary(UUID.randomUUID()));
        assertEquals("PUBLICATION_TEAM_INVALID", node(unknown).get("code").asText());

        Map<String, Object> halfCoords = summary(null);
        halfCoords.remove("lng");
        assertEquals(HttpStatus.BAD_REQUEST, publicationPut(owner, game, halfCoords).getStatusCode());
        Map<String, Object> badCategory = summary(null);
        badCategory.put("category", "mountain");
        assertEquals(HttpStatus.BAD_REQUEST, publicationPut(owner, game, badCategory).getStatusCode());
        Map<String, Object> blank = summary(null);
        blank.put("summary", " ");
        assertEquals(HttpStatus.BAD_REQUEST, publicationPut(owner, game, blank).getStatusCode());
        Map<String, Object> blankPlace = summary(null);
        blankPlace.put("place", " ");
        assertEquals(HttpStatus.BAD_REQUEST, publicationPut(owner, game, blankPlace).getStatusCode());
        Map<String, Object> longTitle = summary(null);
        longTitle.put("title", "x".repeat(256));
        assertEquals(HttpStatus.BAD_REQUEST, publicationPut(owner, game, longTitle).getStatusCode()); // bounded like games.name

        Game practice = gameRepository.save(Game.builder().name("Practice").description("d").status(GameStatus.live)
                .createdBy(owner).tutorialScenario("fixed-route").build());
        ResponseEntity<String> practiceSave = publicationPut(owner, practice, summary(null));
        assertEquals(HttpStatus.BAD_REQUEST, practiceSave.getStatusCode());
        assertEquals("PUBLICATION_NOT_ALLOWED", node(practiceSave).get("code").asText());

        Game ended = createGame(owner, "Ended " + UUID.randomUUID(), GameStatus.ended);
        assertEquals(HttpStatus.OK, publicationPut(owner, ended, summary(null)).getStatusCode());
        ResponseEntity<String> endedPublish = publish(owner, ended);
        assertEquals(HttpStatus.BAD_REQUEST, endedPublish.getStatusCode());
        assertEquals("PUBLICATION_NOT_ALLOWED", node(endedPublish).get("code").asText());
    }

    // ── filters, near me, pagination ────────────────────────────────────

    @Test
    void filtersNearMeAndBoundedPagination() {
        Game forest = createGame(owner, "Pinewoods " + UUID.randomUUID(), GameStatus.setup);
        Game city = createGame(owner, "River " + UUID.randomUUID(), GameStatus.live);
        listedByOwner(game, falcons.getId()); // coast, Costa de Lavos, with coordinates

        Map<String, Object> forestSummary = summary(null);
        forestSummary.put("title", "Into the pinewoods");
        forestSummary.put("place", "Mata Nacional do Urso");
        forestSummary.put("category", "forest");
        forestSummary.remove("lat");
        forestSummary.remove("lng");
        assertEquals(HttpStatus.OK, publicationPut(owner, forest, forestSummary).getStatusCode());
        assertEquals(HttpStatus.OK, publish(owner, forest).getStatusCode());

        Map<String, Object> citySummary = summary(null);
        citySummary.put("title", "The city between river and sea");
        citySummary.put("place", "Figueira da Foz");
        citySummary.put("category", "city");
        citySummary.put("lat", 40.15);
        citySummary.put("lng", -8.862);
        assertEquals(HttpStatus.OK, publicationPut(owner, city, citySummary).getStatusCode());
        assertEquals(HttpStatus.OK, publish(owner, city).getStatusCode());
        assertEquals(HttpStatus.OK, call(admin, HttpMethod.POST, "/api/admin/publications/" + city.getId() + "/feature", null).getStatusCode());

        // Default order: featured first, then live before setup.
        JsonNode all = explore(participant, "");
        assertEquals(3, all.get("total").asLong());
        assertEquals(city.getId().toString(), all.get("items").get(0).get("gameId").asText());
        assertEquals(game.getId().toString(), all.get("items").get(1).get("gameId").asText());
        assertEquals(forest.getId().toString(), all.get("items").get(2).get("gameId").asText());
        assertFalse(all.get("items").get(2).get("joinable").asBoolean()); // setup game, no team
        assertEquals("code", all.get("items").get(2).get("admission").asText());

        // Text search matches the game name (the title), place or summary, case-insensitively.
        JsonNode search = explore(participant, "?q=PINEWOODS");
        assertEquals(1, search.get("total").asLong());
        assertEquals(forest.getId().toString(), search.get("items").get(0).get("gameId").asText());
        assertEquals(1, explore(participant, "?q=figueira").get("total").asLong());
        assertEquals(1, explore(participant, "?q=" + game.getName().substring("Salt and sand ".length())).get("total").asLong()); // the game name is the title
        assertEquals(0, explore(participant, "?q=hidden").get("total").asLong()); // the request title is not stored as the listing title

        assertEquals(1, explore(participant, "?category=coast").get("total").asLong());
        assertEquals(HttpStatus.BAD_REQUEST, call(participant, HttpMethod.GET, "/api/explore/games?category=mountain", null).getStatusCode());
        JsonNode featuredOnly = explore(participant, "?featured=true");
        assertEquals(1, featuredOnly.get("total").asLong());
        assertEquals(city.getId().toString(), featuredOnly.get("items").get(0).get("gameId").asText());

        // Near me: from Costa de Lavos the coast listing is nearest, the one without coordinates last.
        JsonNode near = explore(participant, "?lat=40.08&lng=-8.87");
        assertEquals(game.getId().toString(), near.get("items").get(0).get("gameId").asText());
        assertTrue(near.get("items").get(0).get("distanceKm").asDouble() < 2.0);
        assertEquals(city.getId().toString(), near.get("items").get(1).get("gameId").asText());
        assertTrue(near.get("items").get(1).get("distanceKm").asDouble() > 5.0);
        assertTrue(near.get("items").get(2).get("distanceKm").isNull());
        JsonNode within = explore(participant, "?lat=40.08&lng=-8.87&radiusKm=3");
        assertEquals(1, within.get("total").asLong());
        assertEquals(HttpStatus.BAD_REQUEST, call(participant, HttpMethod.GET, "/api/explore/games?lat=40.08", null).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, call(participant, HttpMethod.GET, "/api/explore/games?lat=95&lng=0", null).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, call(participant, HttpMethod.GET, "/api/explore/games?radiusKm=10", null).getStatusCode());

        // Pagination is bounded.
        JsonNode first = explore(participant, "?page=0&size=2");
        assertEquals(2, first.get("items").size());
        assertTrue(first.get("hasMore").asBoolean());
        JsonNode second = explore(participant, "?page=1&size=2");
        assertEquals(1, second.get("items").size());
        assertFalse(second.get("hasMore").asBoolean());
        assertEquals(3, second.get("total").asLong());
        // A page far past the end is an empty page, never an int overflow into a negative offset.
        JsonNode farPage = explore(participant, "?page=2147483647&size=20");
        assertEquals(0, farPage.get("items").size());
        assertEquals(3, farPage.get("total").asLong());
        assertFalse(farPage.get("hasMore").asBoolean());
        assertEquals(2147483647, farPage.get("page").asInt());
        assertEquals(HttpStatus.BAD_REQUEST, call(participant, HttpMethod.GET, "/api/explore/games?size=51", null).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, call(participant, HttpMethod.GET, "/api/explore/games?page=-1", null).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, call(participant, HttpMethod.GET, "/api/explore/games?q=" + "x".repeat(101), null).getStatusCode());
    }

    // ── public admission ────────────────────────────────────────────────

    @Test
    void publicJoinCreatesRecoversAndRespectsClosure() throws Exception {
        listedByOwner(game, falcons.getId());

        // New account joins the designated team; the row is linked to the account.
        ResponseEntity<String> joined = exploreJoin(participant, game, "phone-a");
        assertEquals(HttpStatus.OK, joined.getStatusCode(), joined.getBody());
        PlayerAuthResponse auth = json.readValue(joined.getBody(), PlayerAuthResponse.class);
        assertEquals(falcons.getId(), auth.team().id());
        assertFalse(joined.getBody().contains(falcons.getJoinCode()));
        Player row = playerRepository.findById(auth.player().id()).orElseThrow();
        assertEquals(participant.getId(), row.getUser().getId());
        JsonNode mine = node(call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null));
        assertTrue(mine.get("joined").asBoolean());
        assertEquals(auth.player().id().toString(), mine.get("playerId").asText());

        // Switching the admission team does not move anyone: a second phone recovers the same row.
        assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(owls.getId())).getStatusCode());
        ResponseEntity<String> again = exploreJoin(participant, game, "phone-b");
        assertEquals(HttpStatus.OK, again.getStatusCode(), again.getBody());
        PlayerAuthResponse recovered = json.readValue(again.getBody(), PlayerAuthResponse.class);
        assertEquals(auth.player().id(), recovered.player().id());
        assertEquals(falcons.getId(), recovered.team().id());
        assertEquals("phone-b", playerRepository.findById(auth.player().id()).orElseThrow().getDeviceId());
        assertEquals(1, playerRepository.findByUserIdOrderByCreatedAtDesc(participant.getId()).size());

        // Admission disabled: new accounts are refused, existing participations still recover.
        User bruno = userRepository.save(User.builder().email("bruno-" + UUID.randomUUID() + "@test.com").name("Bruno")
                .passwordHash(passwordEncoder.encode("Secret123")).role(UserRole.participant).build());
        assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(null)).getStatusCode());
        assertEquals("code", explore(bruno, "").get("items").get(0).get("admission").asText());
        ResponseEntity<String> closed = exploreJoin(bruno, game, "phone-c");
        assertEquals(HttpStatus.BAD_REQUEST, closed.getStatusCode());
        assertEquals("PUBLICATION_ADMISSION_CLOSED", node(closed).get("code").asText());
        assertEquals(HttpStatus.OK, exploreJoin(participant, game, "phone-a").getStatusCode());

        // A deleted admission team closes admission on its own.
        assertEquals(HttpStatus.OK, publicationPut(owner, game, summary(owls.getId())).getStatusCode());
        teamRepository.deleteById(owls.getId());
        assertNull(publicationRepository.findById(game.getId()).orElseThrow().getAdmissionTeam());
        assertEquals("PUBLICATION_ADMISSION_CLOSED", node(exploreJoin(bruno, game, "phone-c")).get("code").asText());

        // A setup game lists as upcoming but admits nobody new.
        Game upcoming = createGame(owner, "Upcoming " + UUID.randomUUID(), GameStatus.setup);
        Team early = createTeam(upcoming, "Early", "EARL" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        listedByOwner(upcoming, early.getId());
        JsonNode upcomingItem = node(call(bruno, HttpMethod.GET, "/api/explore/games/" + upcoming.getId(), null));
        assertEquals("open", upcomingItem.get("admission").asText());
        assertFalse(upcomingItem.get("joinable").asBoolean());
        assertEquals("PUBLICATION_ADMISSION_CLOSED", node(exploreJoin(bruno, upcoming, "phone-c")).get("code").asText());

        // Unpublished: the listing is gone for everyone, joins included.
        assertEquals(HttpStatus.OK, call(owner, HttpMethod.POST, "/api/games/" + game.getId() + "/publication/unpublish", null).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, exploreJoin(bruno, game, "phone-c").getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, exploreJoin(participant, game, "phone-a").getStatusCode());

        // Ended: drops off Explore without anyone touching the publication.
        Game endedLater = createGame(owner, "Ends " + UUID.randomUUID(), GameStatus.live);
        listedByOwner(endedLater, null);
        assertEquals(HttpStatus.OK, call(bruno, HttpMethod.GET, "/api/explore/games/" + endedLater.getId(), null).getStatusCode());
        endedLater.setStatus(GameStatus.ended);
        gameRepository.save(endedLater);
        assertEquals(HttpStatus.NOT_FOUND, call(bruno, HttpMethod.GET, "/api/explore/games/" + endedLater.getId(), null).getStatusCode());
        assertTrue(publicationRepository.findById(endedLater.getId()).orElseThrow().isListed());
    }

    @Test
    void publicJoinKeepsGuestDeviceRules() {
        listedByOwner(game, falcons.getId());
        // The phone already plays here as a guest on the other team: the account cannot take a second identity.
        createPlayer(owls, "Guest on Owls", "shared-phone");
        ResponseEntity<String> locked = exploreJoin(participant, game, "shared-phone");
        assertEquals(HttpStatus.BAD_REQUEST, locked.getStatusCode());
        assertEquals("DEVICE_ALREADY_IN_DIFFERENT_TEAM", node(locked).get("code").asText());
        assertEquals(0, playerRepository.findByUserIdOrderByCreatedAtDesc(participant.getId()).size());
    }
}
