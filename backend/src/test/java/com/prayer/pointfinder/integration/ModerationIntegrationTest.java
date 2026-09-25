package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.service.EmailService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Owner decisions of 2026-09-24: an admin removal holds a listing until an
 * admin allows it again; the first open report on a game emails the
 * moderation recipients; admins can block an abusive account, which signs it
 * out everywhere, refuses new sign-ins and takes its listings down.
 */
class ModerationIntegrationTest extends IntegrationTestBase {

    @MockitoBean private EmailService emailService;
    @Autowired private PlayerJoinRateLimiter joinRateLimiter;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private User owner;
    private User participant;
    private User otherParticipant;
    private User admin;
    private Game game;

    @BeforeEach
    void setUpModeration() {
        joinRateLimiter.clear();
        String tag = UUID.randomUUID().toString().substring(0, 8);
        owner = createOperator("owner-" + tag + "@test.com", "Password1");
        admin = createAdmin("admin-" + tag + "@test.com", "Password1");
        participant = participant("ana-" + tag + "@test.com", "Ana");
        otherParticipant = participant("rui-" + tag + "@test.com", "Rui");
        game = listedGame("Harbour trail " + tag);
    }

    private User participant(String email, String name) {
        return userRepository.save(User.builder()
                .email(email).name(name).passwordHash(passwordEncoder.encode("Secret123"))
                .role(UserRole.participant).build());
    }

    private Game listedGame(String name) {
        Game g = createGame(owner, name, GameStatus.live);
        Team team = createTeam(g, "Falcons", "F" + UUID.randomUUID().toString().substring(0, 6).toUpperCase());
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("summary", "A walk along the harbour.");
        summary.put("place", "Nazaré");
        summary.put("category", "coast");
        summary.put("admissionTeamId", team.getId());
        assertEquals(HttpStatus.OK, call(owner, HttpMethod.PUT, "/api/games/" + g.getId() + "/publication", summary).getStatusCode());
        assertEquals(HttpStatus.OK, publish(owner, g).getStatusCode());
        return g;
    }

    private ResponseEntity<String> call(User user, HttpMethod method, String path, Object body) {
        return restTemplate.exchange(path, method, new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), String.class);
    }

    private ResponseEntity<String> publish(User user, Game g) {
        return call(user, HttpMethod.POST, "/api/games/" + g.getId() + "/publication/publish", null);
    }

    private ResponseEntity<String> report(User user, Game g, String reason) {
        return call(user, HttpMethod.POST, "/api/explore/games/" + g.getId() + "/report", Map.of("reason", reason));
    }

    private ResponseEntity<String> login(User user, String password) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange("/api/auth/login", HttpMethod.POST,
                new HttpEntity<>(Map.of("email", user.getEmail(), "password", password), headers), String.class);
    }

    private JsonNode node(ResponseEntity<String> response) {
        try {
            return json.readTree(response.getBody());
        } catch (Exception e) {
            throw new AssertionError("Not JSON: " + response.getBody(), e);
        }
    }

    // ── moderation hold ─────────────────────────────────────────────────

    @Test
    void anAdminRemovalHoldsTheListingUntilAnAdminAllowsItAgain() {
        ResponseEntity<String> removed = call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/remove", null);
        assertEquals(HttpStatus.OK, removed.getStatusCode(), removed.getBody());
        assertFalse(node(removed).get("listed").asBoolean());
        assertTrue(node(removed).get("moderationHold").asBoolean());

        // The publisher sees why, may still edit the summary, but cannot list it again.
        JsonNode mine = node(call(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null));
        assertTrue(mine.get("moderationHold").asBoolean());
        ResponseEntity<String> republish = publish(owner, game);
        assertEquals(HttpStatus.BAD_REQUEST, republish.getStatusCode());
        assertEquals("PUBLICATION_ON_HOLD", node(republish).get("code").asText());
        Map<String, Object> summary = Map.of("summary", "Fixed summary.", "place", "Nazaré", "category", "coast");
        assertEquals(HttpStatus.OK, call(owner, HttpMethod.PUT, "/api/games/" + game.getId() + "/publication", summary).getStatusCode());

        ResponseEntity<String> released = call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/release", null);
        assertEquals(HttpStatus.OK, released.getStatusCode(), released.getBody());
        assertFalse(node(released).get("moderationHold").asBoolean());
        // Releasing does not relist: the publisher decides that.
        assertFalse(node(released).get("listed").asBoolean());
        assertEquals(HttpStatus.OK, publish(owner, game).getStatusCode());
    }

    @Test
    void removingAReportedListingAlsoHoldsIt() {
        report(participant, game, "unsafe");
        ResponseEntity<String> removed = call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/reports/remove", null);
        assertEquals(HttpStatus.OK, removed.getStatusCode(), removed.getBody());
        assertTrue(node(removed).get("moderationHold").asBoolean());
        assertEquals(HttpStatus.BAD_REQUEST, publish(owner, game).getStatusCode());
    }

    @Test
    void onlyPlatformAdminsRemoveOrRelease() {
        assertEquals(HttpStatus.FORBIDDEN, call(owner, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/remove", null).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(owner, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/release", null).getStatusCode());
    }

    // ── report alerts ───────────────────────────────────────────────────

    @Test
    void theFirstOpenReportOnAGameAlertsTheModerators() {
        report(participant, game, "misleading");
        verify(emailService, times(1)).sendModerationAlert(eq(List.of("dev@davidsbatista.com")), eq(game.getName()), eq("misleading"), any(), eq("Ana"));

        // More reports while that one is open do not send more mail.
        report(otherParticipant, game, "spam");
        verify(emailService, times(1)).sendModerationAlert(any(), anyString(), anyString(), any(), anyString());

        // Once resolved, the next report alerts again.
        call(admin, HttpMethod.POST, "/api/admin/publications/" + game.getId() + "/reports/dismiss", null);
        clearInvocations(emailService);
        report(participant, game, "other");
        verify(emailService, times(1)).sendModerationAlert(any(), eq(game.getName()), eq("other"), any(), eq("Ana"));
    }

    @Test
    void aRepeatedReportFromTheSameAccountSendsNothing() {
        report(participant, game, "spam");
        clearInvocations(emailService);
        report(participant, game, "spam");
        verify(emailService, never()).sendModerationAlert(any(), anyString(), anyString(), any(), anyString());
    }

    // ── blocking accounts ───────────────────────────────────────────────

    @Test
    void aBlockedAccountIsSignedOutRefusedAndItsListingsComeDown() {
        String staleToken = operatorAuthHeader(owner);
        ResponseEntity<String> blocked = call(admin, HttpMethod.POST, "/api/admin/users/" + owner.getId() + "/block", Map.of("reason", "Offensive listings"));
        assertEquals(HttpStatus.OK, blocked.getStatusCode(), blocked.getBody());
        assertNotNull(node(blocked).get("blockedAt").asText(null));
        assertEquals("Offensive listings", node(blocked).get("blockedReason").asText());

        // Signed out everywhere: a token minted before the block no longer works.
        ResponseEntity<String> withOldToken = restTemplate.exchange("/api/games", HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(staleToken)), String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, withOldToken.getStatusCode());
        // And cannot sign in again.
        ResponseEntity<String> signIn = login(owner, "Password1");
        assertEquals(HttpStatus.FORBIDDEN, signIn.getStatusCode(), signIn.getBody());
        assertEquals("ACCOUNT_BLOCKED", node(signIn).get("code").asText());
        // A wrong password still reads as wrong credentials, so blocking is not revealed to strangers.
        assertEquals(HttpStatus.UNAUTHORIZED, login(owner, "WrongPassword1").getStatusCode());

        // Their public listings are taken down and held.
        assertEquals(HttpStatus.NOT_FOUND, call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null).getStatusCode());
        JsonNode publications = node(call(admin, HttpMethod.GET, "/api/admin/publications", null));
        JsonNode held = null;
        for (JsonNode p : publications) if (p.get("gameId").asText().equals(game.getId().toString())) held = p;
        assertNotNull(held);
        assertTrue(held.get("moderationHold").asBoolean());

        JsonNode detail = node(call(admin, HttpMethod.GET, "/api/admin/users/" + owner.getId(), null));
        assertEquals("Offensive listings", detail.get("blockedReason").asText());
    }

    @Test
    void unblockingRestoresSignInButNotTheListings() {
        call(admin, HttpMethod.POST, "/api/admin/users/" + owner.getId() + "/block", Map.of("reason", "Spam"));
        ResponseEntity<String> unblocked = call(admin, HttpMethod.POST, "/api/admin/users/" + owner.getId() + "/unblock", null);
        assertEquals(HttpStatus.OK, unblocked.getStatusCode(), unblocked.getBody());
        assertTrue(node(unblocked).get("blockedAt").isNull());
        assertEquals(HttpStatus.OK, login(owner, "Password1").getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, call(participant, HttpMethod.GET, "/api/explore/games/" + game.getId(), null).getStatusCode());
    }

    @Test
    void adminsCannotBeBlockedAndOnlyAdminsBlock() {
        User otherAdmin = createAdmin("admin2-" + UUID.randomUUID().toString().substring(0, 8) + "@test.com", "Password1");
        assertEquals(HttpStatus.BAD_REQUEST, call(admin, HttpMethod.POST, "/api/admin/users/" + otherAdmin.getId() + "/block", Map.of("reason", "x")).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, call(owner, HttpMethod.POST, "/api/admin/users/" + participant.getId() + "/block", Map.of("reason", "x")).getStatusCode());
        assertEquals(HttpStatus.OK, login(participant, "Secret123").getStatusCode());
    }

    @Test
    void aBlockedAccountCannotReport() {
        call(admin, HttpMethod.POST, "/api/admin/users/" + participant.getId() + "/block", Map.of("reason", "Report spam"));
        // Its old token is revoked, so the request never reaches the report rules.
        assertEquals(HttpStatus.UNAUTHORIZED, report(participant, game, "spam").getStatusCode());
    }
}
