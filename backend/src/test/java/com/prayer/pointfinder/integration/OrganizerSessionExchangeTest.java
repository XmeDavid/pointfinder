package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.LoginRequest;
import com.prayer.pointfinder.dto.request.RefreshTokenRequest;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.AuthService;
import com.prayer.pointfinder.service.EmailService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-01: an operator or admin account signed in on the player app exchanges
 * its bearer for a separate operator session. The account's own refresh token
 * keeps working, participants are refused with a typed code, and the endpoint
 * is closed to anonymous callers and player tokens.
 */
class OrganizerSessionExchangeTest extends IntegrationTestBase {

    private static final String PASSWORD = "Password1";

    @Autowired private AuthService authService;
    @MockitoBean private EmailService emailService;

    private ResponseEntity<AuthResponse> exchange(String bearer) {
        HttpHeaders headers = new HttpHeaders();
        if (bearer != null) headers.set("Authorization", bearer);
        return restTemplate.exchange("/api/account/organizer-session", HttpMethod.POST,
                new HttpEntity<>(null, headers), AuthResponse.class);
    }

    private ResponseEntity<Map> exchangeRaw(String bearer) {
        HttpHeaders headers = new HttpHeaders();
        if (bearer != null) headers.set("Authorization", bearer);
        return restTemplate.exchange("/api/account/organizer-session", HttpMethod.POST,
                new HttpEntity<>(null, headers), Map.class);
    }

    private AuthResponse login(String email) {
        LoginRequest login = new LoginRequest();
        login.setEmail(email);
        login.setPassword(PASSWORD);
        ResponseEntity<AuthResponse> resp = restTemplate.postForEntity("/api/auth/login", login, AuthResponse.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        return resp.getBody();
    }

    private ResponseEntity<AuthResponse> refresh(String refreshToken) {
        RefreshTokenRequest body = new RefreshTokenRequest();
        body.setRefreshToken(refreshToken);
        return restTemplate.postForEntity("/api/auth/refresh", body, AuthResponse.class);
    }

    @Test
    void operatorAccountGetsAnIndependentOrganizerSession() {
        String email = "op-" + UUID.randomUUID() + "@test.com";
        User operator = createOperator(email, PASSWORD);
        AuthResponse account = login(email);

        ResponseEntity<AuthResponse> resp = exchange("Bearer " + account.accessToken());

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        AuthResponse organizer = resp.getBody();
        assertNotNull(organizer.accessToken());
        assertNotNull(organizer.refreshToken());
        assertNotEquals(account.refreshToken(), organizer.refreshToken());
        assertEquals("operator", organizer.user().role());
        assertEquals(operator.getId(), organizer.user().id());

        List<String> cookies = resp.getHeaders().get(HttpHeaders.SET_COOKIE);
        assertNotNull(cookies, "the organizer session sets the refresh cookie like login does");
        assertTrue(cookies.stream().anyMatch(c -> c.startsWith("pf_refresh=")), cookies.toString());

        // Both refresh tokens are independent rows: each refreshes on its own.
        ResponseEntity<AuthResponse> organizerRefresh = refresh(organizer.refreshToken());
        assertEquals(HttpStatus.OK, organizerRefresh.getStatusCode());
        assertNotNull(organizerRefresh.getBody().accessToken());

        ResponseEntity<AuthResponse> accountRefresh = refresh(account.refreshToken());
        assertEquals(HttpStatus.OK, accountRefresh.getStatusCode());
        assertNotNull(accountRefresh.getBody().accessToken());
    }

    @Test
    void adminAccountIsAdmitted() {
        String email = "admin-" + UUID.randomUUID() + "@test.com";
        User admin = createAdmin(email, PASSWORD);

        ResponseEntity<AuthResponse> resp = exchange(operatorAuthHeader(admin));

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("admin", resp.getBody().user().role());
        assertNotNull(resp.getBody().refreshToken());
    }

    @Test
    void participantAccountIsRefusedWithATypedCode() {
        String email = "part-" + UUID.randomUUID() + "@test.com";
        User participant = authService.createParticipant(email, "Ana", PASSWORD, null);

        ResponseEntity<Map> resp = exchangeRaw(operatorAuthHeader(participant));

        assertEquals(HttpStatus.FORBIDDEN, resp.getStatusCode());
        assertEquals("ORGANIZER_ROLE_REQUIRED", resp.getBody().get("code"));
    }

    @Test
    void anonymousAndPlayerTokensAreRefused() {
        ResponseEntity<AuthResponse> anonymous = exchange(null);
        assertNotEquals(HttpStatus.OK, anonymous.getStatusCode());
        assertTrue(anonymous.getStatusCode() == HttpStatus.UNAUTHORIZED || anonymous.getStatusCode() == HttpStatus.FORBIDDEN,
                "anonymous: " + anonymous.getStatusCode());

        User operator = createOperator("host-" + UUID.randomUUID() + "@test.com", PASSWORD);
        Game game = createGame(operator, "Camp " + UUID.randomUUID(), GameStatus.live);
        Team team = createTeam(game, "Falcons", "F" + UUID.randomUUID().toString().substring(0, 5).toUpperCase());
        Player player = createPlayer(team, "Ana", "device-" + UUID.randomUUID());

        ResponseEntity<AuthResponse> asPlayer = exchange(playerAuthHeader(player));
        assertNotEquals(HttpStatus.OK, asPlayer.getStatusCode());
        assertTrue(asPlayer.getStatusCode() == HttpStatus.UNAUTHORIZED || asPlayer.getStatusCode() == HttpStatus.FORBIDDEN,
                "player: " + asPlayer.getStatusCode());
    }
}
