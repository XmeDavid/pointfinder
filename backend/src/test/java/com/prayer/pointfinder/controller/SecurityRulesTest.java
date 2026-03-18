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
import org.springframework.boot.test.mock.mockito.MockBean;
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
    PlayerController.class
})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class})
@TestPropertySource(properties = {
    "app.cors.allowed-origins=http://localhost:5173",
    "management.endpoints.web.exposure.include=health,info,metrics,prometheus"
})
class SecurityRulesTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtTokenProvider tokenProvider;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private PlayerRepository playerRepository;

    // MockBeans needed by the loaded controllers
    @MockBean
    private com.prayer.pointfinder.service.AuthService authService;

    @MockBean
    private com.prayer.pointfinder.repository.OperatorInviteRepository inviteRepository;

    @MockBean
    private com.prayer.pointfinder.service.GameService gameService;

    @MockBean
    private com.prayer.pointfinder.service.PlayerService playerService;

    @MockBean
    private com.prayer.pointfinder.service.ChunkedUploadService chunkedUploadService;

    @MockBean
    private com.prayer.pointfinder.service.FileStorageService fileStorageService;

    private static final String OPERATOR_TOKEN = "operator-jwt";
    private static final String PLAYER_TOKEN = "player-jwt";
    private static final String ADMIN_TOKEN = "admin-jwt";

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

        // Player token setup
        when(tokenProvider.validateToken(PLAYER_TOKEN)).thenReturn(true);
        when(tokenProvider.getTokenType(PLAYER_TOKEN)).thenReturn("player");
        when(tokenProvider.getUserIdFromToken(PLAYER_TOKEN)).thenReturn(playerId);
        when(playerRepository.findAuthPlayerById(playerId)).thenReturn(Optional.of(player));
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
}
