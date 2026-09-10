package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.config.SecurityConfig;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.security.JwtTokenProvider;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests that the URL-level security rules in SecurityConfig are enforced correctly.
 * Uses @WebMvcTest with the real SecurityConfig and JwtAuthenticationFilter,
 * but with mocked JWT and repository dependencies.
 * No database is needed because all data access is mocked.
 */
@WebMvcTest({
    AuthController.class,
    GameController.class,
    PlayerController.class,
    PlayerAccountController.class,
    AdminOrgController.class
})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, com.prayer.pointfinder.security.FrozenAccountFilter.class})
@TestPropertySource(properties = {
    "app.cors.allowed-origins=http://localhost:5173",
    "management.endpoints.web.exposure.include=health,info,metrics,prometheus"
})
class SecurityRulesTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private com.prayer.pointfinder.service.PushTokenService pushTokenService;

    @MockitoBean
    private com.prayer.pointfinder.service.GameImportExportService gameImportExportService;

    @MockitoBean
    private com.prayer.pointfinder.service.PracticeGameService practiceGameService;

    @MockitoBean
    private JwtTokenProvider tokenProvider;
    @MockitoBean
    private com.prayer.pointfinder.service.PlayerAccountService playerAccountService;

    @MockitoBean
    private com.prayer.pointfinder.repository.UserSubscriptionRepository userSubscriptionRepository;

    // FrozenAccountFilter also resolves the org a request acts inside, so the
    // slice has to mock the repository that answers that.
    @MockitoBean
    private com.prayer.pointfinder.repository.OrganizationRepository organizationRepository;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private PlayerRepository playerRepository;

    // MockBeans needed by the loaded controllers
    @MockitoBean
    private com.prayer.pointfinder.service.AuthService authService;

    @MockitoBean
    private com.prayer.pointfinder.service.InviteService inviteService;

    @MockitoBean
    private com.prayer.pointfinder.service.GameService gameService;

    @MockitoBean
    private com.prayer.pointfinder.service.PlayerService playerService;

    @MockitoBean
    private com.prayer.pointfinder.service.PlayerJoinRateLimiter playerJoinRateLimiter;

    @MockitoBean
    private com.prayer.pointfinder.service.ChunkedUploadService chunkedUploadService;

    @MockitoBean
    private com.prayer.pointfinder.service.FileStorageService fileStorageService;

    // PlayerController now checks the plan's per-file cap before storing a
    // media submission, so the slice has to supply the service that answers it.
    @MockitoBean
    private com.prayer.pointfinder.service.QuotaService quotaService;

    // Added by the audit-findings wave to PlayerController; the slice must mock them too.

    @MockitoBean

    private com.prayer.pointfinder.service.PlayerLocationService playerLocationService;

    @MockitoBean

    private com.prayer.pointfinder.service.PlayerPushTokenService playerPushTokenService;

    @MockitoBean
    private com.prayer.pointfinder.service.AdminOrgService adminOrgService;

    @MockitoBean
    private com.prayer.pointfinder.service.OrgInvoiceService orgInvoiceService;

    private static final String OPERATOR_TOKEN = "operator-jwt";
    private static final String PLAYER_TOKEN = "player-jwt";
    private static final String ADMIN_TOKEN = "admin-jwt";
    private static final String PARTICIPANT_TOKEN = "participant-jwt";

    @BeforeEach
    void setUp() {
        UUID operatorId = UUID.randomUUID();
        User operator = User.builder()
                .id(operatorId)
                .email("op@test.com")
                .name("Operator")
                .passwordHash("hash")
                .role(UserRole.operator)
                .build();

        UUID adminId = UUID.randomUUID();
        User admin = User.builder()
                .id(adminId)
                .email("admin@test.com")
                .name("Admin")
                .passwordHash("hash")
                .role(UserRole.admin)
                .build();

        UUID playerId = UUID.randomUUID();
        Team team = Team.builder()
                .id(UUID.randomUUID())
                .name("TestTeam")
                .joinCode("TEST01")
                .color("#FF0000")
                .build();
        Player player = Player.builder()
                .id(playerId)
                .team(team)
                .displayName("Scout")
                .deviceId("device-1")
                .build();

        // Operator token setup
        when(tokenProvider.validateToken(OPERATOR_TOKEN)).thenReturn(true);
        when(tokenProvider.getTokenType(OPERATOR_TOKEN)).thenReturn("user");
        when(tokenProvider.getUserIdFromToken(OPERATOR_TOKEN)).thenReturn(operatorId);
        when(userRepository.findById(operatorId)).thenReturn(Optional.of(operator));

        // Admin token setup
        when(tokenProvider.validateToken(ADMIN_TOKEN)).thenReturn(true);
        when(tokenProvider.getTokenType(ADMIN_TOKEN)).thenReturn("user");
        when(tokenProvider.getUserIdFromToken(ADMIN_TOKEN)).thenReturn(adminId);
        when(userRepository.findById(adminId)).thenReturn(Optional.of(admin));

        // Participant (registered player) account token setup
        UUID participantId = UUID.randomUUID();
        User participant = User.builder()
                .id(participantId)
                .email("ana@test.com")
                .name("Ana")
                .passwordHash("hash")
                .role(UserRole.participant)
                .build();
        when(tokenProvider.validateToken(PARTICIPANT_TOKEN)).thenReturn(true);
        when(tokenProvider.getTokenType(PARTICIPANT_TOKEN)).thenReturn("user");
        when(tokenProvider.getUserIdFromToken(PARTICIPANT_TOKEN)).thenReturn(participantId);
        when(userRepository.findById(participantId)).thenReturn(Optional.of(participant));

        // Player token setup
        when(tokenProvider.validateToken(PLAYER_TOKEN)).thenReturn(true);
        when(tokenProvider.getTokenType(PLAYER_TOKEN)).thenReturn("player");
        when(tokenProvider.getUserIdFromToken(PLAYER_TOKEN)).thenReturn(playerId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(player));
    }

    // ── PF-01 account routes ──────────────────────────────────────────

    @Test
    void playerAccountRequiresAPlayerToken() throws Exception {
        mockMvc.perform(get("/api/player/account"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/player/account")
                        .header("Authorization", "Bearer " + OPERATOR_TOKEN))
                .andExpect(status().isForbidden());
        org.mockito.Mockito.when(playerAccountService.account(org.mockito.ArgumentMatchers.any()))
                .thenReturn(com.prayer.pointfinder.dto.response.PlayerAccountResponse.guest());
        mockMvc.perform(get("/api/player/account")
                        .header("Authorization", "Bearer " + PLAYER_TOKEN))
                .andExpect(status().isOk());
    }

    @Test
    void participantAccountsReachNothingButAuth() throws Exception {
        // A registered player is not an operator: games, orgs, billing, workspaces and the
        // player routes themselves are all closed to its user token.
        for (String path : new String[] {"/api/games", "/api/orgs", "/api/billing/status", "/api/workspaces", "/api/org-invites/my", "/api/users/me", "/api/player/account", "/api/admin/orgs"}) {
            mockMvc.perform(get(path).header("Authorization", "Bearer " + PARTICIPANT_TOKEN))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void unmatchedRoutesAreClosedToPlayersAndOpenToOperators() throws Exception {
        // The default is operator-only, so a future controller cannot leak to a player token.
        mockMvc.perform(get("/api/orgs").header("Authorization", "Bearer " + PLAYER_TOKEN))
                .andExpect(status().isForbidden());
        // The org controller is not part of this slice, so the operator gets past the filter
        // chain and fails later; the point is that it is not the 403 a player token gets.
        mockMvc.perform(get("/api/orgs").header("Authorization", "Bearer " + OPERATOR_TOKEN))
                .andExpect(result -> org.junit.jupiter.api.Assertions.assertNotEquals(403, result.getResponse().getStatus()));
    }

    @Test
    void playerRecoverIsReachableWithoutASession() throws Exception {
        // Like join: the body carries the credentials, so no bearer token is needed to reach it.
        // An empty body is rejected by validation, which proves the route was reached, not the filter chain.
        mockMvc.perform(post("/api/auth/player/recover")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unauthenticatedAccessToGamesReturns401() throws Exception {
        mockMvc.perform(get("/api/games"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void playerTokenAccessToGamesReturns403() throws Exception {
        mockMvc.perform(get("/api/games")
                        .header("Authorization", "Bearer " + PLAYER_TOKEN))
                .andExpect(status().isForbidden());
    }

    @Test
    void operatorTokenAccessToGamesPassesSecurity() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/games")
                        .header("Authorization", "Bearer " + OPERATOR_TOKEN))
                .andReturn();
        int statusCode = result.getResponse().getStatus();
        assertNotEquals(401, statusCode, "Should not be unauthorized");
        assertNotEquals(403, statusCode, "Should not be forbidden");
    }

    @Test
    void operatorTokenAccessToAdminTreeReturns403() throws Exception {
        // Club creation, deal terms and invoicing sit behind /api/admin/**,
        // gated at the filter chain rather than per controller method.
        mockMvc.perform(get("/api/admin/orgs/" + UUID.randomUUID() + "/invoices")
                        .header("Authorization", "Bearer " + OPERATOR_TOKEN))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminTokenAccessToAdminTreePassesSecurity() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/admin/orgs/" + UUID.randomUUID() + "/invoices")
                        .header("Authorization", "Bearer " + ADMIN_TOKEN))
                .andReturn();
        int statusCode = result.getResponse().getStatus();
        assertNotEquals(401, statusCode, "Should not be unauthorized");
        assertNotEquals(403, statusCode, "Should not be forbidden");
    }

    @Test
    void operatorTokenAccessToPlayerEndpointReturns403() throws Exception {
        mockMvc.perform(get("/api/player/games/" + UUID.randomUUID() + "/progress")
                        .header("Authorization", "Bearer " + OPERATOR_TOKEN))
                .andExpect(status().isForbidden());
    }

    @Test
    void playerTokenAccessToCheckInEndpointPassesSecurity() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/player/games/" + UUID.randomUUID()
                        + "/bases/" + UUID.randomUUID() + "/check-in")
                        .header("Authorization", "Bearer " + PLAYER_TOKEN))
                .andReturn();
        int statusCode = result.getResponse().getStatus();
        assertNotEquals(401, statusCode, "Should not be unauthorized");
        assertNotEquals(403, statusCode, "Should not be forbidden");
    }

    @Test
    void unauthenticatedAccessToLoginIsPermitted() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"email\":\"test@test.com\",\"password\":\"secret\"}"))
                .andReturn();
        int statusCode = result.getResponse().getStatus();
        assertNotEquals(403, statusCode, "Auth endpoint should not be forbidden");
        // Note: may return 401 from the AuthService (business logic) or 200/400,
        // but security should not block it. We verify it's not 403.
    }

    @Test
    void unauthenticatedAccessToPlayerEndpointReturns401() throws Exception {
        mockMvc.perform(get("/api/player/games/" + UUID.randomUUID() + "/progress"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unauthenticatedWebSocketNativeHandshakeIsNotBlockedByHttpSecurity() throws Exception {
        MvcResult result = mockMvc.perform(get("/ws-native"))
                .andReturn();
        int statusCode = result.getResponse().getStatus();
        assertNotEquals(401, statusCode, "WebSocket handshake should reach the STOMP handler");
        assertNotEquals(403, statusCode, "WebSocket handshake should not be forbidden by HTTP security");
    }
}
