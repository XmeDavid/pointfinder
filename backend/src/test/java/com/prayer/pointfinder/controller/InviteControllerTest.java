package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CreateInviteRequest;
import com.prayer.pointfinder.dto.response.InviteResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.InviteService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(InviteController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class InviteControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private InviteService inviteService;

    @MockBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private static final UUID INVITE_ID = UUID.randomUUID();
    private static final UUID GAME_ID = UUID.randomUUID();
    private static final UUID INVITER_ID = UUID.randomUUID();

    // ── GET /api/invites ──────────────────────────────────────────────

    @Test
    void getGlobalInvitesReturns200WithList() throws Exception {
        InviteResponse invite = InviteResponse.builder()
                .id(INVITE_ID)
                .email("scout@test.com")
                .status("pending")
                .invitedBy(INVITER_ID)
                .inviterName("Admin")
                .createdAt(Instant.now())
                .build();

        when(inviteService.getGlobalInvites()).thenReturn(List.of(invite));

        mockMvc.perform(get("/api/invites"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(INVITE_ID.toString()))
                .andExpect(jsonPath("$[0].email").value("scout@test.com"))
                .andExpect(jsonPath("$[0].status").value("pending"));
    }

    @Test
    void getGlobalInvitesReturnsEmptyList() throws Exception {
        when(inviteService.getGlobalInvites()).thenReturn(List.of());

        mockMvc.perform(get("/api/invites"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ── GET /api/games/{gameId}/invites ───────────────────────────────

    @Test
    void getGameInvitesReturns200() throws Exception {
        InviteResponse invite = InviteResponse.builder()
                .id(INVITE_ID)
                .gameId(GAME_ID)
                .gameName("Scout Rally")
                .email("scout@test.com")
                .status("pending")
                .invitedBy(INVITER_ID)
                .inviterName("Admin")
                .createdAt(Instant.now())
                .build();

        when(inviteService.getGameInvites(GAME_ID)).thenReturn(List.of(invite));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/invites"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].gameId").value(GAME_ID.toString()))
                .andExpect(jsonPath("$[0].gameName").value("Scout Rally"));
    }

    // ── GET /api/invites/my ───────────────────────────────────────────

    @Test
    void getMyInvitesReturns200() throws Exception {
        InviteResponse invite = InviteResponse.builder()
                .id(INVITE_ID)
                .gameId(GAME_ID)
                .gameName("Scout Rally")
                .email("me@test.com")
                .status("pending")
                .invitedBy(INVITER_ID)
                .inviterName("Admin")
                .createdAt(Instant.now())
                .build();

        when(inviteService.getMyInvites()).thenReturn(List.of(invite));

        mockMvc.perform(get("/api/invites/my"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].email").value("me@test.com"));
    }

    // ── POST /api/invites ─────────────────────────────────────────────

    @Test
    void createInviteWithValidBodyReturns201() throws Exception {
        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("new@test.com");

        InviteResponse response = InviteResponse.builder()
                .id(INVITE_ID)
                .email("new@test.com")
                .status("pending")
                .invitedBy(INVITER_ID)
                .inviterName("Admin")
                .createdAt(Instant.now())
                .build();

        when(inviteService.createInvite(any(CreateInviteRequest.class), nullable(String.class))).thenReturn(response);

        mockMvc.perform(post("/api/invites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(INVITE_ID.toString()))
                .andExpect(jsonPath("$.email").value("new@test.com"))
                .andExpect(jsonPath("$.status").value("pending"));
    }

    @Test
    void createInviteWithGameIdReturns201() throws Exception {
        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("scout@test.com");
        request.setGameId(GAME_ID);

        InviteResponse response = InviteResponse.builder()
                .id(INVITE_ID)
                .gameId(GAME_ID)
                .gameName("Scout Rally")
                .email("scout@test.com")
                .status("pending")
                .invitedBy(INVITER_ID)
                .inviterName("Admin")
                .createdAt(Instant.now())
                .build();

        when(inviteService.createInvite(any(CreateInviteRequest.class), nullable(String.class))).thenReturn(response);

        mockMvc.perform(post("/api/invites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.gameId").value(GAME_ID.toString()));
    }

    @Test
    void createInviteWithMissingEmailReturns400() throws Exception {
        CreateInviteRequest request = new CreateInviteRequest();
        // email not set - @NotBlank should reject

        mockMvc.perform(post("/api/invites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").exists());
    }

    @Test
    void createInviteWithInvalidEmailReturns400() throws Exception {
        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("not-an-email"); // @Email should reject

        mockMvc.perform(post("/api/invites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").exists());
    }

    @Test
    void createInviteDuplicateReturns400() throws Exception {
        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("existing@test.com");

        when(inviteService.createInvite(any(CreateInviteRequest.class), nullable(String.class)))
                .thenThrow(new BadRequestException("An invite for this email already exists"));

        mockMvc.perform(post("/api/invites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("An invite for this email already exists"));
    }

    // ── POST /api/invites/{inviteId}/accept ───────────────────────────

    @Test
    void acceptInviteReturns204() throws Exception {
        doNothing().when(inviteService).acceptInvite(INVITE_ID);

        mockMvc.perform(post("/api/invites/" + INVITE_ID + "/accept"))
                .andExpect(status().isNoContent());
    }

    @Test
    void acceptInviteNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException("Invite", INVITE_ID))
                .when(inviteService).acceptInvite(INVITE_ID);

        mockMvc.perform(post("/api/invites/" + INVITE_ID + "/accept"))
                .andExpect(status().isNotFound());
    }

    @Test
    void acceptInviteForbiddenReturns403() throws Exception {
        doThrow(new ForbiddenException("You cannot accept this invite"))
                .when(inviteService).acceptInvite(INVITE_ID);

        mockMvc.perform(post("/api/invites/" + INVITE_ID + "/accept"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You cannot accept this invite"));
    }

    // ── DELETE /api/invites/{inviteId} ────────────────────────────────

    @Test
    void deleteInviteReturns204() throws Exception {
        doNothing().when(inviteService).deleteInvite(INVITE_ID);

        mockMvc.perform(delete("/api/invites/" + INVITE_ID))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteInviteNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException("Invite", INVITE_ID))
                .when(inviteService).deleteInvite(INVITE_ID);

        mockMvc.perform(delete("/api/invites/" + INVITE_ID))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteInviteForbiddenReturns403() throws Exception {
        doThrow(new ForbiddenException("You cannot delete this invite"))
                .when(inviteService).deleteInvite(INVITE_ID);

        mockMvc.perform(delete("/api/invites/" + INVITE_ID))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You cannot delete this invite"));
    }
}
