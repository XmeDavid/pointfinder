package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GamePublicationEvent;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.PublicationReport;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.repository.GamePublicationEventRepository;
import com.prayer.pointfinder.repository.PublicationReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-06: a signed-in account can report a listed game; platform admins read
 * the open reports and either dismiss them or remove the listing from
 * Explore. Publishers never see who reported them.
 */
class PublicationReportIntegrationTest extends IntegrationTestBase {

    @Autowired private PublicationReportRepository reportRepository;
    @Autowired private GamePublicationEventRepository publicationEventRepository;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private User owner;
    private User participant;
    private User otherParticipant;
    private User admin;
    private Game game;
    private Team falcons;

    @BeforeEach
    void setUpReports() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        owner = createOperator("owner-" + tag + "@test.com", "Password1");
        admin = createAdmin("admin-" + tag + "@test.com", "Password1");
        participant = participant("ana-" + tag + "@test.com", "Ana");
        otherParticipant = participant("rui-" + tag + "@test.com", "Rui");
        game = createGame(owner, "Harbour trail " + tag, GameStatus.live);
        falcons = createTeam(game, "Falcons", "FALC" + tag.substring(0, 4).toUpperCase());
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("summary", "A walk along the harbour.");
        summary.put("place", "Nazaré");
        summary.put("category", "coast");
        summary.put("admissionTeamId", falcons.getId());
        assertEquals(HttpStatus.OK, call(owner, HttpMethod.PUT, "/api/games/" + game.getId() + "/publication", summary).getStatusCode());
        assertEquals(HttpStatus.OK, call(owner, HttpMethod.POST, "/api/games/" + game.getId() + "/publication/publish", null).getStatusCode());
    }

    private User participant(String email, String name) {
        return userRepository.save(User.builder()
                .email(email).name(name).passwordHash(passwordEncoder.encode("Secret123"))
                .role(UserRole.participant).build());
    }

    private ResponseEntity<String> call(User user, HttpMethod method, String path, Object body) {
        return restTemplate.exchange(path, method, new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), String.class);
    }

    private ResponseEntity<String> report(User user, Game g, String reason, String details) {
        return report(user, g.getId(), reason, details);
    }

    private ResponseEntity<String> report(User user, UUID gameId, String reason, String details) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reason", reason);
        body.put("details", details);
        return call(user, HttpMethod.POST, "/api/explore/games/" + gameId + "/report", body);
    }

    private JsonNode node(ResponseEntity<String> response) {
        try {
            return json.readTree(response.getBody());
        } catch (Exception e) {
            throw new AssertionError("Not JSON: " + response.getBody(), e);
        }
    }

    private List<PublicationReport> reportsFor(Game g) {
        return reportRepository.findAll().stream().filter(r -> r.getGame().getId().equals(g.getId())).toList();
    }

    @Test
    void anAccountReportsAListedGameOnceWhileItsReportIsOpen() {
        assertEquals(HttpStatus.NO_CONTENT, report(participant, game, "misleading", "  The meeting point does not exist.  ").getStatusCode());
        // Reporting again while the first report is open keeps one report, not a pile of them.
        assertEquals(HttpStatus.NO_CONTENT, report(participant, game, "spam", null).getStatusCode());
        assertEquals(HttpStatus.NO_CONTENT, report(otherParticipant, game, "unsafe", null).getStatusCode());

        List<PublicationReport> reports = reportsFor(game);
        assertEquals(2, reports.size());
        PublicationReport first = reports.stream().filter(r -> r.getReporter().getId().equals(participant.getId())).findFirst().orElseThrow();
        assertEquals("misleading", first.getReason().name());
        assertEquals("The meeting point does not exist.", first.getDetails());
        assertEquals("open", first.getStatus().name());
    }

    @Test
    void reportsNeedAKnownReasonBoundedDetailsAndAListedGame() {
        assertEquals(HttpStatus.BAD_REQUEST, report(participant, game, "boring", null).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, report(participant, game, null, null).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, report(participant, game, "other", "x".repeat(1001)).getStatusCode());

        Game unlisted = createGame(owner, "Private rehearsal", GameStatus.live);
        assertEquals(HttpStatus.NOT_FOUND, report(participant, unlisted, "spam", null).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, report(participant, UUID.randomUUID(), "spam", null).getStatusCode());
        assertTrue(reportsFor(game).isEmpty());
        assertTrue(reportsFor(unlisted).isEmpty());
    }

    @Test
    void onlyPlatformAdminsReadAndResolveReports() {
        report(participant, game, "inappropriate", "Offensive words in the summary");
        assertEquals(HttpStatus.FORBIDDEN, call(owner, HttpMethod.GET, "/api/admin/publications/reports", null).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(participant, HttpMethod.GET, "/api/admin/publications/reports", null).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(owner, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/reports/dismiss", null).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(owner, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/reports/remove", null).getStatusCode());

        ResponseEntity<String> listed = call(admin, HttpMethod.GET, "/api/admin/publications/reports", null);
        assertEquals(HttpStatus.OK, listed.getStatusCode(), listed.getBody());
        JsonNode mine = null;
        for (JsonNode r : node(listed)) {
            if (r.get("gameId").asText().equals(game.getId().toString())) mine = r;
        }
        assertNotNull(mine, listed.getBody());
        assertEquals(game.getName(), mine.get("gameName").asText());
        assertEquals("inappropriate", mine.get("reason").asText());
        assertEquals("Offensive words in the summary", mine.get("details").asText());
        assertEquals("Ana", mine.get("reporterName").asText());
        assertTrue(mine.get("listed").asBoolean());
        assertNotNull(mine.get("createdAt").asText());
    }

    @Test
    void dismissingClosesTheOpenReportsAndKeepsTheListing() {
        report(participant, game, "spam", null);
        report(otherParticipant, game, "other", "Duplicate of another game");
        ResponseEntity<String> dismissed = call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/reports/dismiss", null);
        assertEquals(HttpStatus.NO_CONTENT, dismissed.getStatusCode(), dismissed.getBody());

        List<PublicationReport> reports = reportsFor(game);
        assertTrue(reports.stream().allMatch(r -> r.getStatus().name().equals("dismissed")));
        assertTrue(reports.stream().allMatch(r -> r.getResolvedBy() != null && r.getResolvedBy().getId().equals(admin.getId()) && r.getResolvedAt() != null));
        assertEquals(HttpStatus.OK, call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null).getStatusCode());
        assertFalse(node(call(admin, HttpMethod.GET, "/api/admin/publications/reports", null)).toString().contains(game.getId().toString()));

        // A closed report does not stop the same account reporting again later.
        assertEquals(HttpStatus.NO_CONTENT, report(participant, game, "spam", "Still wrong").getStatusCode());
        assertEquals(3, reportsFor(game).size());
    }

    @Test
    void removingDelistsTheGameClosesItsReportsAndIsAudited() {
        report(participant, game, "unsafe", "Crosses a motorway");
        ResponseEntity<String> removed = call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/reports/remove", null);
        assertEquals(HttpStatus.OK, removed.getStatusCode(), removed.getBody());
        assertFalse(node(removed).get("listed").asBoolean());

        assertEquals(HttpStatus.NOT_FOUND, call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null).getStatusCode());
        assertTrue(reportsFor(game).stream().allMatch(r -> r.getStatus().name().equals("removed")));
        // The game, its teams and the organizer's summary stay; only the listing is gone.
        assertTrue(gameRepository.findById(game.getId()).isPresent());
        JsonNode draft = node(call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null));
        assertEquals("A walk along the harbour.", draft.get("summary").asText());
        // Removal delists and holds the listing (owner decision 2026-09-24), both as the admin's own actions.
        List<GamePublicationEvent> events = publicationEventRepository.findByGameIdOrderByCreatedAtAsc(game.getId());
        List<String> lastTwo = events.subList(events.size() - 2, events.size()).stream().map(GamePublicationEvent::getOperation).toList();
        assertEquals(List.of("unpublish", "hold"), lastTwo);
        assertTrue(events.subList(events.size() - 2, events.size()).stream().allMatch(e -> e.getActorUser().getId().equals(admin.getId())));
    }

    @Test
    void theOrganizerNeverSeesWhoReportedThem() {
        report(participant, game, "misleading", null);
        String publication = call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null).getBody();
        assertFalse(publication.contains("Ana"), publication);
        assertFalse(publication.contains("misleading"), publication);
    }
}
