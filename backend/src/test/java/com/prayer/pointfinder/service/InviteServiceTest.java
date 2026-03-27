package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateInviteRequest;
import com.prayer.pointfinder.dto.response.InviteResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InviteServiceTest {

    @Mock
    private OperatorInviteRepository inviteRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private EmailService emailService;
    @Mock
    private GameAccessService gameAccessService;

    @InjectMocks
    private InviteService inviteService;

    private UUID userId;
    private UUID gameId;
    private User adminUser;
    private User operatorUser;
    private Game game;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        gameId = UUID.randomUUID();

        adminUser = User.builder()
                .id(userId)
                .email("admin@example.com")
                .name("Admin")
                .passwordHash("hash")
                .role(UserRole.admin)
                .build();

        operatorUser = User.builder()
                .id(UUID.randomUUID())
                .email("operator@example.com")
                .name("Operator")
                .passwordHash("hash")
                .role(UserRole.operator)
                .build();

        game = Game.builder()
                .id(gameId)
                .name("Test Game")
                .description("Desc")
                .status(GameStatus.setup)
                .operators(new HashSet<>())
                .build();

        setCurrentUser(adminUser);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void setCurrentUser(User user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null)
        );
    }

    // --- getGlobalInvites ---

    @Test
    void getGlobalInvitesReturnsInvitesWithoutGame() {
        OperatorInvite invite = buildInvite(null, "invitee@example.com", InviteStatus.pending);
        when(inviteRepository.findByGameIdIsNullAndStatus(InviteStatus.pending)).thenReturn(List.of(invite));

        List<InviteResponse> result = inviteService.getGlobalInvites();

        assertEquals(1, result.size());
        assertNull(result.get(0).getGameId());
        assertEquals("invitee@example.com", result.get(0).getEmail());
        verify(gameAccessService).ensureCurrentUserIsAdmin();
    }

    @Test
    void getGlobalInvitesEnforcesAdminRole() {
        doThrow(new ForbiddenException("Only administrators can perform this action"))
                .when(gameAccessService).ensureCurrentUserIsAdmin();

        assertThrows(ForbiddenException.class, () -> inviteService.getGlobalInvites());
    }

    // --- getGameInvites ---

    @Test
    void getGameInvitesReturnsInvitesForGame() {
        OperatorInvite invite = buildInvite(game, "invitee@example.com", InviteStatus.pending);
        when(inviteRepository.findByGameIdAndStatus(gameId, InviteStatus.pending)).thenReturn(List.of(invite));

        List<InviteResponse> result = inviteService.getGameInvites(gameId);

        assertEquals(1, result.size());
        assertEquals(gameId, result.get(0).getGameId());
        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
    }

    @Test
    void getGameInvitesEnforcesGameAccess() {
        doThrow(new ForbiddenException("You do not have access to this game"))
                .when(gameAccessService).ensureCurrentUserCanAccessGame(gameId);

        assertThrows(ForbiddenException.class, () -> inviteService.getGameInvites(gameId));
    }

    // --- getMyInvites ---

    @Test
    void getMyInvitesReturnsPendingGameInvitesForCurrentUser() {
        OperatorInvite invite = buildInvite(game, adminUser.getEmail(), InviteStatus.pending);
        when(inviteRepository.findByEmailAndStatusAndGameIdIsNotNull(adminUser.getEmail(), InviteStatus.pending))
                .thenReturn(List.of(invite));

        List<InviteResponse> result = inviteService.getMyInvites();

        assertEquals(1, result.size());
        assertEquals(adminUser.getEmail(), result.get(0).getEmail());
    }

    // --- createInvite (global) ---

    @Test
    void createGlobalInviteSendsRegistrationEmail() {
        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("new@example.com");
        request.setGameId(null);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(inviteRepository.saveAndFlush(any(OperatorInvite.class))).thenAnswer(invocation -> {
            OperatorInvite saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            saved.setCreatedAt(Instant.now());
            return saved;
        });

        InviteResponse response = inviteService.createInvite(request, "pointfinder.pt");

        assertNotNull(response.getId());
        assertEquals("new@example.com", response.getEmail());
        assertNull(response.getGameId());
        assertEquals("pending", response.getStatus());
        verify(gameAccessService).ensureCurrentUserIsAdmin();
        verify(emailService).sendRegistrationInvite(eq("new@example.com"), any(String.class), eq("Admin"), eq("pointfinder.pt"));
        verify(emailService, never()).sendGameInvite(any(), any(), any(), any());
    }

    @Test
    void createGlobalInviteRequiresAdmin() {
        setCurrentUser(operatorUser);
        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("new@example.com");
        request.setGameId(null);

        when(userRepository.findById(operatorUser.getId())).thenReturn(Optional.of(operatorUser));
        doThrow(new ForbiddenException("Only administrators can perform this action"))
                .when(gameAccessService).ensureCurrentUserIsAdmin();

        assertThrows(ForbiddenException.class, () -> inviteService.createInvite(request, null));
    }

    // --- createInvite (game) ---

    @Test
    void createGameInviteSendsGameInviteEmail() {
        User targetUser = User.builder()
                .id(UUID.randomUUID())
                .email("target@example.com")
                .name("Target")
                .passwordHash("hash")
                .role(UserRole.operator)
                .build();

        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("target@example.com");
        request.setGameId(gameId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findByEmail("target@example.com")).thenReturn(Optional.of(targetUser));
        when(inviteRepository.saveAndFlush(any(OperatorInvite.class))).thenAnswer(invocation -> {
            OperatorInvite saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            saved.setCreatedAt(Instant.now());
            return saved;
        });

        InviteResponse response = inviteService.createInvite(request, "pointfinder.pt");

        assertNotNull(response.getId());
        assertEquals(gameId, response.getGameId());
        assertEquals("target@example.com", response.getEmail());
        verify(emailService).sendGameInvite(eq("target@example.com"), eq("Test Game"), eq("Admin"), eq("pointfinder.pt"));
        verify(emailService, never()).sendRegistrationInvite(any(), any(), any(), any());
    }

    @Test
    void createGameInviteRejectsNonExistentUser() {
        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("noone@example.com");
        request.setGameId(gameId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findByEmail("noone@example.com")).thenReturn(Optional.empty());

        assertThrows(BadRequestException.class, () -> inviteService.createInvite(request, null));
    }

    @Test
    void createGameInviteRejectsAlreadyAssignedOperator() {
        game.getOperators().add(operatorUser);

        CreateInviteRequest request = new CreateInviteRequest();
        request.setEmail("operator@example.com");
        request.setGameId(gameId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findByEmail("operator@example.com")).thenReturn(Optional.of(operatorUser));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> inviteService.createInvite(request, null));
        assertTrue(ex.getMessage().contains("already"));
    }

    // --- acceptInvite ---

    @Test
    void acceptInviteAddsUserToGameOperators() {
        UUID inviteId = UUID.randomUUID();

        OperatorInvite invite = buildInvite(game, adminUser.getEmail(), InviteStatus.pending);
        invite.setId(inviteId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(inviteRepository.findById(inviteId)).thenReturn(Optional.of(invite));

        inviteService.acceptInvite(inviteId);

        assertEquals(InviteStatus.accepted, invite.getStatus());
        assertTrue(game.getOperators().contains(adminUser));
        verify(inviteRepository).save(invite);
    }

    @Test
    void acceptInviteRejectsWrongEmail() {
        UUID inviteId = UUID.randomUUID();

        OperatorInvite invite = buildInvite(game, "other@example.com", InviteStatus.pending);
        invite.setId(inviteId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(inviteRepository.findById(inviteId)).thenReturn(Optional.of(invite));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> inviteService.acceptInvite(inviteId));
        assertTrue(ex.getMessage().contains("not for you"));
    }

    @Test
    void acceptInviteRejectsAlreadyProcessedInvite() {
        UUID inviteId = UUID.randomUUID();

        OperatorInvite invite = buildInvite(game, adminUser.getEmail(), InviteStatus.accepted);
        invite.setId(inviteId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(inviteRepository.findById(inviteId)).thenReturn(Optional.of(invite));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> inviteService.acceptInvite(inviteId));
        assertTrue(ex.getMessage().contains("already been processed"));
    }

    @Test
    void acceptInviteRejectsRegistrationInvite() {
        UUID inviteId = UUID.randomUUID();

        OperatorInvite invite = buildInvite(null, adminUser.getEmail(), InviteStatus.pending);
        invite.setId(inviteId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(inviteRepository.findById(inviteId)).thenReturn(Optional.of(invite));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> inviteService.acceptInvite(inviteId));
        assertTrue(ex.getMessage().contains("registration invite"));
    }

    @Test
    void acceptInviteThrowsWhenInviteNotFound() {
        UUID inviteId = UUID.randomUUID();

        when(userRepository.findById(userId)).thenReturn(Optional.of(adminUser));
        when(inviteRepository.findById(inviteId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> inviteService.acceptInvite(inviteId));
    }

    // --- helper ---

    private OperatorInvite buildInvite(Game game, String email, InviteStatus status) {
        return OperatorInvite.builder()
                .id(UUID.randomUUID())
                .game(game)
                .email(email)
                .token(UUID.randomUUID().toString())
                .status(status)
                .invitedBy(adminUser)
                .createdAt(Instant.now())
                .build();
    }
}
