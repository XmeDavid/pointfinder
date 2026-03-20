package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.ForgotPasswordRequest;
import com.prayer.pointfinder.dto.request.LoginRequest;
import com.prayer.pointfinder.dto.request.RefreshTokenRequest;
import com.prayer.pointfinder.dto.request.RegisterRequest;
import com.prayer.pointfinder.dto.response.AuthResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.dto.response.InviteTokenResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.AuthService;
import com.prayer.pointfinder.service.InviteService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

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

    @MockBean
    private AuthService authService;

    @MockBean
    private InviteService inviteService;

    @MockBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

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
                .andExpect(jsonPath("$.user.email").value("op@test.com"));
    }

    @Test
    void loginWithMissingEmailReturns400() throws Exception {
        LoginRequest request = new LoginRequest();
        request.setPassword("password123");
        // email is null

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
                .andExpect(status().isUnauthorized());
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
                .andExpect(jsonPath("$.refreshToken").value("new-refresh-uuid"));
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
                .andExpect(jsonPath("$.accessToken").value("access-jwt"));
    }

    // ── Invite tests ────────────────────────────────────────────────

    @Test
    void getUsedInviteReturns400() throws Exception {
        when(inviteService.getInviteByToken("used-token"))
                .thenThrow(new BadRequestException("Invite has already been used or expired"));

        mockMvc.perform(get("/api/auth/invite/used-token"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getPendingInviteReturns200WithEmail() throws Exception {
        when(inviteService.getInviteByToken("pending-token"))
                .thenReturn(new InviteTokenResponse("invited@test.com"));

        mockMvc.perform(get("/api/auth/invite/pending-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("invited@test.com"));
    }
}
