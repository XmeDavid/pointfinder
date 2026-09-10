package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.PlayerAccountLinkRequest;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerRecoverRequest;
import com.prayer.pointfinder.dto.response.PlayerAccountResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.repository.EmailChangeTokenRepository;
import com.prayer.pointfinder.service.EmailService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

/**
 * PF-01/PF-02 end to end against Postgres: a guest joins, saves progress to a
 * new account without the player row or token changing, and recovers the same
 * participation from a second device. Conflicts answer with typed codes.
 */
class AccountParticipationIntegrationTest extends IntegrationTestBase {

    @Autowired private PlayerJoinRateLimiter rateLimiter;
    @Autowired private EmailChangeTokenRepository emailChangeTokenRepository;
    @MockitoBean private EmailService emailService;
    @Autowired private com.prayer.pointfinder.service.AuthService authService;

    private Game game;
    private Team falcons;
    private Team owls;

    @BeforeEach
    void setUpGame() {
        rateLimiter.clear();
        User operator = createOperator("acct-op-" + UUID.randomUUID() + "@test.com", "Password1");
        game = createGame(operator, "Account Camp " + UUID.randomUUID(), GameStatus.live);
        falcons = createTeam(game, "Falcons", "FALC" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        owls = createTeam(game, "Owls", "OWLS" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
    }

    private PlayerAuthResponse join(Team team, String name, String deviceId) {
        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode(team.getJoinCode());
        join.setDisplayName(name);
        join.setDeviceId(deviceId);
        ResponseEntity<PlayerAuthResponse> resp = restTemplate.postForEntity("/api/auth/player/join", join, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        return resp.getBody();
    }

    private HttpHeaders bearer(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("Content-Type", "application/json");
        return headers;
    }

    private <T> ResponseEntity<T> link(String token, PlayerAccountLinkRequest body, Class<T> type) {
        return restTemplate.exchange("/api/player/account/link", HttpMethod.POST, new HttpEntity<>(body, bearer(token)), type);
    }

    private static PlayerAccountLinkRequest signup(String email, String name) {
        PlayerAccountLinkRequest r = new PlayerAccountLinkRequest();
        r.setEmail(email); r.setName(name); r.setPassword("Secret123"); r.setCreateAccount(true);
        return r;
    }

    private static PlayerAccountLinkRequest signin(String email, String password) {
        PlayerAccountLinkRequest r = new PlayerAccountLinkRequest();
        r.setEmail(email); r.setPassword(password); r.setCreateAccount(false);
        return r;
    }

    private static PlayerRecoverRequest recover(String email, String joinCode, String deviceId) {
        PlayerRecoverRequest r = new PlayerRecoverRequest();
        r.setEmail(email); r.setPassword("Secret123"); r.setJoinCode(joinCode); r.setDeviceId(deviceId);
        return r;
    }

    @Test
    void guestSavesProgressThenRecoversOnASecondDevice() {
        String email = "ana-" + UUID.randomUUID() + "@example.com";
        PlayerAuthResponse guest = join(falcons, "Ana", "device-a");

        // Nothing is linked yet.
        ResponseEntity<PlayerAccountResponse> before = restTemplate.exchange("/api/player/account", HttpMethod.GET, new HttpEntity<>(bearer(guest.token())), PlayerAccountResponse.class);
        assertEquals(HttpStatus.OK, before.getStatusCode());
        assertFalse(before.getBody().linked());

        // Create the account from inside the game.
        ResponseEntity<PlayerAccountResponse> linked = link(guest.token(), signup(email, "Ana"), PlayerAccountResponse.class);
        assertEquals(HttpStatus.OK, linked.getStatusCode());
        assertTrue(linked.getBody().linked());
        assertEquals(email, linked.getBody().email());
        assertFalse(linked.getBody().emailVerified());
        verify(emailService).sendParticipantVerification(eq(email), any(), any());

        // The row is the same one, now owned by a participant account.
        Player row = playerRepository.findById(guest.player().id()).orElseThrow();
        assertNotNull(row.getUser());
        // Outside a session only the proxy's id is safe to read; load the account for the rest.
        User account = userRepository.findById(row.getUser().getId()).orElseThrow();
        assertEquals(UserRole.participant, account.getRole());
        assertEquals(1, playerRepository.countByTeamId(falcons.getId()));

        // The original token keeps working: the session never changed principal.
        ResponseEntity<String> stillPlaying = restTemplate.exchange("/api/player/games/" + game.getId() + "/data", HttpMethod.GET, new HttpEntity<>(bearer(guest.token())), String.class);
        assertEquals(HttpStatus.OK, stillPlaying.getStatusCode());

        // The verification link marks the address verified without changing it.
        String token = emailChangeTokenRepository.findAll().stream()
                .filter(t -> t.getUser().getId().equals(account.getId())).findFirst().orElseThrow().getToken();
        // The endpoint answers with a redirect to the web app; exercise the service directly.
        authService.confirmEmailChange(token);
        assertEquals(Boolean.TRUE, userRepository.findById(account.getId()).orElseThrow().getEmailVerified());

        // A second device recovers the same participation with any code of that game.
        ResponseEntity<PlayerAuthResponse> recovered = restTemplate.postForEntity("/api/auth/player/recover", recover(email, owls.getJoinCode(), "device-b"), PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, recovered.getStatusCode());
        assertEquals(guest.player().id(), recovered.getBody().player().id());
        assertEquals(falcons.getId(), recovered.getBody().team().id());
        assertEquals("device-b", recovered.getBody().player().deviceId());
        assertEquals(1, playerRepository.countByTeamId(falcons.getId()), "no second competitor");

        // Both devices hold a working token for the one participation.
        ResponseEntity<PlayerAccountResponse> fromB = restTemplate.exchange("/api/player/account", HttpMethod.GET, new HttpEntity<>(bearer(recovered.getBody().token())), PlayerAccountResponse.class);
        assertEquals(HttpStatus.OK, fromB.getStatusCode());
        assertEquals(email, fromB.getBody().email());
        ResponseEntity<PlayerAccountResponse> fromA = restTemplate.exchange("/api/player/account", HttpMethod.GET, new HttpEntity<>(bearer(guest.token())), PlayerAccountResponse.class);
        assertEquals(HttpStatus.OK, fromA.getStatusCode());
    }

    @Test
    void claimingAnAccountThatAlreadyPlaysHereIsRefusedWithWhereItPlays() {
        String email = "ana-" + UUID.randomUUID() + "@example.com";
        PlayerAuthResponse first = join(falcons, "Ana", "device-a");
        assertEquals(HttpStatus.OK, link(first.token(), signup(email, "Ana"), PlayerAccountResponse.class).getStatusCode());

        PlayerAuthResponse second = join(owls, "Ana again", "device-c");
        ResponseEntity<Map> conflict = link(second.token(), signin(email, "Secret123"), Map.class);

        assertEquals(HttpStatus.CONFLICT, conflict.getStatusCode());
        assertEquals("ACCOUNT_ALREADY_IN_GAME", conflict.getBody().get("code"));
        Map<?, ?> details = (Map<?, ?>) conflict.getBody().get("errors");
        assertEquals(falcons.getId().toString(), details.get("teamId"));
        assertEquals("Falcons", details.get("teamName"));
        assertEquals("false", details.get("sameTeam"));
        assertEquals(2, playerRepository.countByGameId(game.getId()), "nothing merged or deleted");
    }

    @Test
    void switchingAPhoneToTheAccountRetiresThatPhonesGuestRow() {
        String email = "ana-" + UUID.randomUUID() + "@example.com";
        PlayerAuthResponse falcon = join(falcons, "Ana", "device-a");
        assertEquals(HttpStatus.OK, link(falcon.token(), signup(email, "Ana"), PlayerAccountResponse.class).getStatusCode());

        // Phone C joined the Owls as a guest, checked in somewhere, then Ana signs in there and chooses to switch.
        PlayerAuthResponse ghost = join(owls, "Ana again", "device-c");
        assertEquals(2, playerRepository.countByGameId(game.getId()));
        com.prayer.pointfinder.entity.Base mill = createBase(game, "Mill");
        checkInRepository.save(com.prayer.pointfinder.entity.CheckIn.builder()
                .game(game).team(owls).base(mill).player(playerRepository.findById(ghost.player().id()).orElseThrow())
                .checkedInAt(java.time.Instant.now()).build());
        PlayerRecoverRequest byGame = recover(email, null, "device-c");
        byGame.setGameId(game.getId());
        ResponseEntity<PlayerAuthResponse> recovered = restTemplate.postForEntity("/api/auth/player/recover", byGame, PlayerAuthResponse.class);

        assertEquals(HttpStatus.OK, recovered.getStatusCode());
        assertEquals(falcon.player().id(), recovered.getBody().player().id());
        // The guest row is retired, not deleted: the Owls keep the check-in it made.
        Player retired = playerRepository.findById(ghost.player().id()).orElseThrow();
        assertTrue(retired.getDeviceId().startsWith("retired:"));
        assertEquals(1, checkInRepository.findByGameIdAndTeamId(game.getId(), owls.getId()).size(), "the team's check-in survives the switch");
        assertEquals(HttpStatus.OK, restTemplate.exchange("/api/player/account", HttpMethod.GET, new HttpEntity<>(bearer(recovered.getBody().token())), String.class).getStatusCode());
        // A guest rejoin from phone C now resolves to the recovered participation.
        PlayerAuthResponse rejoin = join(falcons, "Ana", "device-c");
        assertEquals(falcon.player().id(), rejoin.player().id());
    }

    @Test
    void participantAccountsSignInButReachNothingOperatorsHave() {
        String email = "ana-" + UUID.randomUUID() + "@example.com";
        PlayerAuthResponse guest = join(falcons, "Ana", "device-a");
        assertEquals(HttpStatus.OK, link(guest.token(), signup(email, "Ana"), PlayerAccountResponse.class).getStatusCode());

        ResponseEntity<Map> login = restTemplate.postForEntity("/api/auth/login", Map.of("email", email, "password", "Secret123"), Map.class);
        assertEquals(HttpStatus.OK, login.getStatusCode());
        String accessToken = (String) login.getBody().get("accessToken");
        HttpHeaders asAccount = bearer(accessToken);
        assertEquals(HttpStatus.FORBIDDEN, restTemplate.exchange("/api/games", HttpMethod.GET, new HttpEntity<>(asAccount), String.class).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, restTemplate.exchange("/api/orgs", HttpMethod.GET, new HttpEntity<>(asAccount), String.class).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, restTemplate.exchange("/api/billing/status", HttpMethod.GET, new HttpEntity<>(asAccount), String.class).getStatusCode());
        assertEquals(HttpStatus.OK, restTemplate.exchange("/api/account/me", HttpMethod.GET, new HttpEntity<>(asAccount), String.class).getStatusCode());
    }

    private HttpHeaders account(String email) {
        ResponseEntity<Map> login = restTemplate.postForEntity("/api/auth/login", Map.of("email", email, "password", "Secret123"), Map.class);
        assertEquals(HttpStatus.OK, login.getStatusCode());
        return bearer((String) login.getBody().get("accessToken"));
    }

    @Test
    void aSignedInPhoneNeverBecomesASecondCompetitor() {
        String email = "ana-" + UUID.randomUUID() + "@example.com";
        // Create the account first, from the app, without any game.
        ResponseEntity<Map> registered = restTemplate.postForEntity("/api/auth/participant/register",
                Map.of("email", email, "name", "Ana", "password", "Secret123", "deviceId", "device-a"), Map.class);
        assertEquals(HttpStatus.OK, registered.getStatusCode());
        HttpHeaders asAna = bearer((String) registered.getBody().get("accessToken"));

        // Joining while signed in creates a linked row.
        ResponseEntity<PlayerAuthResponse> first = restTemplate.exchange("/api/account/join", HttpMethod.POST,
                new HttpEntity<>(Map.of("joinCode", falcons.getJoinCode(), "displayName", "Ana", "deviceId", "device-a"), asAna), PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, first.getStatusCode());
        assertNotNull(playerRepository.findById(first.getBody().player().id()).orElseThrow().getUser());

        // The same account on another phone, with a different team's code, gets the same row back.
        ResponseEntity<PlayerAuthResponse> second = restTemplate.exchange("/api/account/join", HttpMethod.POST,
                new HttpEntity<>(Map.of("joinCode", owls.getJoinCode(), "displayName", "Ana", "deviceId", "device-b"), asAna), PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, second.getStatusCode());
        assertEquals(first.getBody().player().id(), second.getBody().player().id());
        assertEquals(falcons.getId(), second.getBody().team().id());
        assertEquals(1, playerRepository.countByGameId(game.getId()));

        // /me lists the participation without any score.
        ResponseEntity<Map> me = restTemplate.exchange("/api/account/me", HttpMethod.GET, new HttpEntity<>(asAna), Map.class);
        assertEquals(HttpStatus.OK, me.getStatusCode());
        java.util.List<Map<String, Object>> parts = (java.util.List<Map<String, Object>>) me.getBody().get("participations");
        assertEquals(1, parts.size());
        assertEquals("Falcons", parts.get(0).get("teamName"));
        assertEquals(Boolean.FALSE, me.getBody().get("emailVerified"));

        // Recover by session, no password.
        ResponseEntity<PlayerAuthResponse> recovered = restTemplate.exchange("/api/account/participations/" + game.getId() + "/recover", HttpMethod.POST,
                new HttpEntity<>(Map.of("deviceId", "device-c"), asAna), PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, recovered.getStatusCode());
        assertEquals(first.getBody().player().id(), recovered.getBody().player().id());

        // Unlink from the phone, then the row is a guest again and /me is empty.
        ResponseEntity<PlayerAccountResponse> unlinked = restTemplate.exchange("/api/player/account/link", HttpMethod.DELETE, new HttpEntity<>(bearer(recovered.getBody().token())), PlayerAccountResponse.class);
        assertEquals(HttpStatus.OK, unlinked.getStatusCode());
        assertFalse(unlinked.getBody().linked());
        me = restTemplate.exchange("/api/account/me", HttpMethod.GET, new HttpEntity<>(asAna), Map.class);
        assertEquals(0, ((java.util.List<?>) me.getBody().get("participations")).size());

        // Link it back through the session token in the body, no password.
        ResponseEntity<PlayerAccountResponse> relinked = restTemplate.exchange("/api/player/account/link", HttpMethod.POST,
                new HttpEntity<>(Map.of("accountAccessToken", asAna.getFirst("Authorization").substring(7), "createAccount", false), bearer(recovered.getBody().token())), PlayerAccountResponse.class);
        assertEquals(HttpStatus.OK, relinked.getStatusCode());
        assertEquals(email, relinked.getBody().email());

        // Deleting the account leaves the participation behind as a guest.
        assertEquals(HttpStatus.NO_CONTENT, restTemplate.exchange("/api/account", HttpMethod.DELETE, new HttpEntity<>(asAna), Void.class).getStatusCode());
        Player left = playerRepository.findById(first.getBody().player().id()).orElseThrow();
        assertEquals(null, left.getUser());
        assertTrue(userRepository.findByEmailIgnoreCase(email).isEmpty());
    }

    @Test
    void wrongPasswordAndUnknownGameAnswerWithTypedFailures() {
        String email = "ana-" + UUID.randomUUID() + "@example.com";
        PlayerAuthResponse guest = join(falcons, "Ana", "device-a");
        assertEquals(HttpStatus.OK, link(guest.token(), signup(email, "Ana"), PlayerAccountResponse.class).getStatusCode());

        PlayerRecoverRequest bad = recover(email, falcons.getJoinCode(), "device-b");
        bad.setPassword("Wrong1234");
        ResponseEntity<Map> wrong = restTemplate.postForEntity("/api/auth/player/recover", bad, Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, wrong.getStatusCode());
        assertEquals("INVALID_CREDENTIALS", wrong.getBody().get("code"));

        User operator = createOperator("other-op-" + UUID.randomUUID() + "@test.com", "Password1");
        Game other = createGame(operator, "Elsewhere " + UUID.randomUUID(), GameStatus.live);
        Team elsewhere = createTeam(other, "Bears", "BEAR" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        ResponseEntity<Map> none = restTemplate.postForEntity("/api/auth/player/recover", recover(email, elsewhere.getJoinCode(), "device-b"), Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, none.getStatusCode());
        assertEquals("NO_PARTICIPATION_FOUND", none.getBody().get("code"));

        ResponseEntity<Map> taken = link(join(owls, "Bob", "device-d").token(), signup(email, "Bob"), Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, taken.getStatusCode());
        assertEquals("EMAIL_ALREADY_TAKEN", taken.getBody().get("code"));
    }
}
