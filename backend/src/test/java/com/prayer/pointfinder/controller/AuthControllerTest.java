package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.dto.response.InviteTokenResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.AuthService;
import com.prayer.pointfinder.service.InviteService;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private InviteService inviteService;

    @MockitoBean
    private PlayerService playerService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    // ── Player Join tests ─────────────────────────────────────────────

    @Test
    void joinWithValidCodeReturnsPlayerAuth() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        UUID playerId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID gameId = UUID.randomUUID();

        PlayerAuthResponse response = PlayerAuthResponse.builder()
                .token("player-jwt-token")
                .player(PlayerAuthResponse.PlayerInfo.builder()
                        .id(playerId)
                        .displayName("Scout")
                        .deviceId("device-123")
                        .build())
                .team(PlayerAuthResponse.TeamInfo.builder()
                        .id(teamId)
                        .name("Pathfinders")
                        .color("#FF0000")
                        .build())
                .game(PlayerAuthResponse.GameInfo.builder()
                        .id(gameId)
                        .name("Test Game")
                        .description("desc")
                        .status("live")
                        .tileSource("osm-classic")
                        .build())
                .build();

        when(playerService.joinTeam(any(PlayerJoinRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("player-jwt-token"))
                .andExpect(jsonPath("$.player.displayName").value("Scout"))
                .andExpect(jsonPath("$.player.deviceId").value("device-123"))
                .andExpect(jsonPath("$.team.name").value("Pathfinders"))
                .andExpect(jsonPath("$.team.color").value("#FF0000"))
                .andExpect(jsonPath("$.game.status").value("live"))
                .andExpect(jsonPath("$.game.tileSource").value("osm-classic"));
    }

    @Test
    void joinPassesRequestFieldsToService() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("CAMP42");
        request.setDisplayName("Eagle");
        request.setDeviceId("dev-abc");

        UUID playerId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID gameId = UUID.randomUUID();
        when(playerService.joinTeam(any(PlayerJoinRequest.class))).thenReturn(
                PlayerAuthResponse.builder()
                        .token("t")
                        .player(PlayerAuthResponse.PlayerInfo.builder().id(playerId).displayName("Eagle").deviceId("dev-abc").build())
                        .team(PlayerAuthResponse.TeamInfo.builder().id(teamId).name("T").color("#000").build())
                        .game(PlayerAuthResponse.GameInfo.builder().id(gameId).name("G").description("").status("live").tileSource("osm-classic").build())
                        .build());

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        ArgumentCaptor<PlayerJoinRequest> captor = ArgumentCaptor.forClass(PlayerJoinRequest.class);
        verify(playerService).joinTeam(captor.capture());
        assertThat(captor.getValue().getJoinCode()).isEqualTo("CAMP42");
        assertThat(captor.getValue().getDisplayName()).isEqualTo("Eagle");
        assertThat(captor.getValue().getDeviceId()).isEqualTo("dev-abc");
    }

    @Test
    void joinWithInvalidCodeReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("INVALID");
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        when(playerService.joinTeam(any(PlayerJoinRequest.class)))
                .thenThrow(new BadRequestException("Invalid join code"));

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid join code"));
    }

    @Test
    void joinWhenGameNotLiveReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        when(playerService.joinTeam(any(PlayerJoinRequest.class)))
                .thenThrow(new BadRequestException("Game is not currently accepting players"));

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Game is not currently accepting players"));
    }

    @Test
    void joinWithMissingDisplayNameReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        // displayName not set
        request.setDeviceId("device-123");

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.displayName").exists());
    }

    @Test
    void joinWithMissingJoinCodeReturns400() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        // joinCode not set
        request.setDisplayName("Scout");
        request.setDeviceId("device-123");

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.joinCode").exists());
    }

    @Test
    void joinWithDeviceAlreadyInTeamReturns409() throws Exception {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("TEST01");
        request.setDisplayName("Scout");
        request.setDeviceId("device-already-joined");

        when(playerService.joinTeam(any(PlayerJoinRequest.class)))
                .thenThrow(new ConflictException("This device has already joined a team"));

        mockMvc.perform(post("/api/auth/player/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This device has already joined a team"));
    }

    // ── Login tests ─────────────────────────────────────────────────

    @Test
    void loginWithValidCredentialsReturns200() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setEmail("op@test.com");
        request.setPassword("password123");

        AuthResponse response = AuthResponse.builder()
                .accessToken("access-jwt")
                .refreshToken("refresh-uuid")
                .user(UserResponse.builder()
                        .id(UUID.randomUUID())
                        .email("op@test.com")
                        .name("Operator")
                        .role("operator")
                        .build())
                .build();

        when(authService.login(any(LoginRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("access-jwt"))
                .andExpect(jsonPath("$.refreshToken").value("refresh-uuid"))
                .andExpect(jsonPath("$.user.email").value("op@test.com"))
                .andExpect(jsonPath("$.user.role").value("operator"))
                .andExpect(jsonPath("$.user.id").exists());
    }

    @Test
    void loginPassesCorrectEmailAndPasswordToService() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setEmail("op@test.com");
        request.setPassword("myS3cretPass");

        when(authService.login(any(LoginRequest.class))).thenReturn(AuthResponse.builder()
                .accessToken("tok").refreshToken("ref")
                .user(UserResponse.builder().id(UUID.randomUUID()).email("op@test.com")
                        .name("Op").role("operator").build())
                .build());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        ArgumentCaptor<LoginRequest> captor = ArgumentCaptor.forClass(LoginRequest.class);
        verify(authService).login(captor.capture());
        assertThat(captor.getValue().getEmail()).isEqualTo("op@test.com");
        assertThat(captor.getValue().getPassword()).isEqualTo("myS3cretPass");
    }

    @Test
    void loginWithMissingEmailReturns400() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setPassword("password123");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginWithMissingPasswordReturns400() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setEmail("op@test.com");
        // password omitted

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginWithInvalidEmailFormatReturns400() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setEmail("not-an-email");
        request.setPassword("password123");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginWithBadCredentialsReturns401() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setEmail("op@test.com");
        request.setPassword("wrong");

        when(authService.login(any(LoginRequest.class)))
                .thenThrow(new BadCredentialsException("Invalid credentials"));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    // ── Refresh token tests ─────────────────────────────────────────

    @Test
    void refreshWithValidTokenReturnsNewTokens() throws Exception {
        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("valid-refresh");

        AuthResponse response = AuthResponse.builder()
                .accessToken("new-access-jwt")
                .refreshToken("new-refresh-uuid")
                .user(UserResponse.builder()
                        .id(UUID.randomUUID())
                        .email("op@test.com")
                        .name("Operator")
                        .role("operator")
                        .build())
                .build();

        when(authService.refreshToken("valid-refresh")).thenReturn(response);

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-access-jwt"))
                .andExpect(jsonPath("$.refreshToken").value("new-refresh-uuid"))
                .andExpect(jsonPath("$.user.email").value("op@test.com"));
    }

    @Test
    void refreshPassesTokenStringToService() throws Exception {
        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("exact-token-value");

        when(authService.refreshToken("exact-token-value")).thenReturn(AuthResponse.builder()
                .accessToken("a").refreshToken("b")
                .user(UserResponse.builder().id(UUID.randomUUID()).email("x@y.com")
                        .name("X").role("operator").build())
                .build());

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        verify(authService).refreshToken("exact-token-value");
    }

    @Test
    void refreshWithExpiredTokenReturns400() throws Exception {
        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("expired-refresh");

        when(authService.refreshToken("expired-refresh"))
                .thenThrow(new BadRequestException("Refresh token expired"));

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Refresh token expired"));
    }

    @Test
    void refreshWithMissingTokenFieldReturns400() throws Exception {
        // refreshToken field is missing entirely
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    // ── Forgot password tests ───────────────────────────────────────

    @Test
    void forgotPasswordAlwaysReturns200() throws Exception {
        ForgotPasswordRequest request = new ForgotPasswordRequest();
        request.setEmail("anyone@test.com");

        doNothing().when(authService).requestPasswordReset(eq("anyone@test.com"), any());

        mockMvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void forgotPasswordAlwaysReturns200EvenWhenEmailUnknown() throws Exception {
        // Security: must not reveal whether email exists
        ForgotPasswordRequest request = new ForgotPasswordRequest();
        request.setEmail("nobody@test.com");

        // Service does nothing (email not found is silently swallowed)
        doNothing().when(authService).requestPasswordReset(eq("nobody@test.com"), any());

        mockMvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").exists());
    }

    // ── Register tests ──────────────────────────────────────────────

    @Test
    void registerWithValidInviteReturns200() throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setName("New Operator");
        request.setEmail("new@test.com");
        request.setPassword("password123");

        AuthResponse response = AuthResponse.builder()
                .accessToken("access-jwt")
                .refreshToken("refresh-uuid")
                .user(UserResponse.builder()
                        .id(UUID.randomUUID())
                        .email("new@test.com")
                        .name("New Operator")
                        .role("operator")
                        .build())
                .build();

        when(authService.register(eq("valid-token"), any(RegisterRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/register/valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("access-jwt"))
                .andExpect(jsonPath("$.user.email").value("new@test.com"))
                .andExpect(jsonPath("$.user.name").value("New Operator"));
    }

    @Test
    void registerPassesTokenAndRequestToService() throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setName("Scout Leader");
        request.setEmail("leader@scout.org");
        request.setPassword("securePass1");

        when(authService.register(eq("abc-xyz"), any(RegisterRequest.class))).thenReturn(
                AuthResponse.builder().accessToken("t").refreshToken("r")
                        .user(UserResponse.builder().id(UUID.randomUUID()).email("leader@scout.org")
                                .name("Scout Leader").role("operator").build()).build());

        mockMvc.perform(post("/api/auth/register/abc-xyz")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());

        ArgumentCaptor<RegisterRequest> captor = ArgumentCaptor.forClass(RegisterRequest.class);
        verify(authService).register(eq("abc-xyz"), captor.capture());
        assertThat(captor.getValue().getEmail()).isEqualTo("leader@scout.org");
        assertThat(captor.getValue().getName()).isEqualTo("Scout Leader");
    }

    @Test
    void registerWithShortPasswordReturns400() throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setName("New Operator");
        request.setEmail("new@test.com");
        request.setPassword("short"); // < 8 chars

        mockMvc.perform(post("/api/auth/register/valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.password").exists());
    }

    @Test
    void registerWithInvalidEmailReturns400() throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setName("New Operator");
        request.setEmail("not-valid-email");
        request.setPassword("validPass123");

        mockMvc.perform(post("/api/auth/register/valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").exists());
    }

    @Test
    void registerWithConflictEmailReturns409() throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setName("Duplicate");
        request.setEmail("taken@test.com");
        request.setPassword("password123");

        when(authService.register(eq("some-token"), any(RegisterRequest.class)))
                .thenThrow(new ConflictException("A user with this email already exists"));

        mockMvc.perform(post("/api/auth/register/some-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A user with this email already exists"));
    }

    @Test
    void registerWithExpiredInviteReturns400() throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setName("New Operator");
        request.setEmail("new@test.com");
        request.setPassword("password123");

        when(authService.register(eq("expired-token"), any(RegisterRequest.class)))
                .thenThrow(new BadRequestException("Invite has already been used or expired"));

        mockMvc.perform(post("/api/auth/register/expired-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invite has already been used or expired"));
    }

    // ── Invite tests ────────────────────────────────────────────────

    @Test
    void getUsedInviteReturns400() throws Exception {
        when(inviteService.getInviteByToken("used-token"))
                .thenThrow(new BadRequestException("Invite has already been used or expired"));

        mockMvc.perform(get("/api/auth/invite/used-token"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invite has already been used or expired"));
    }

    @Test
    void getPendingInviteReturns200WithEmail() throws Exception {
        when(inviteService.getInviteByToken("pending-token"))
                .thenReturn(new InviteTokenResponse("invited@test.com"));

        mockMvc.perform(get("/api/auth/invite/pending-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("invited@test.com"));
    }

    @Test
    void getUnknownInviteReturns404() throws Exception {
        when(inviteService.getInviteByToken("unknown-token"))
                .thenThrow(new ResourceNotFoundException("Invite not found"));

        mockMvc.perform(get("/api/auth/invite/unknown-token"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Invite not found"));
    }

    // ── Logout tests ────────────────────────────────────────────────

    @Test
    void logoutWithValidTokenReturns204() throws Exception {
        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("valid-refresh");

        doNothing().when(authService).logout("valid-refresh");

        mockMvc.perform(post("/api/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNoContent());

        verify(authService).logout("valid-refresh");
    }
}
