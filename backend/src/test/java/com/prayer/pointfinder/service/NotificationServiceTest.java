package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateNotificationRequest;
import com.prayer.pointfinder.dto.response.NotificationResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
class NotificationServiceTest {

    @Mock
    private GameNotificationRepository notificationRepository;
    @Mock
    private GameRepository gameRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private PlayerRepository playerRepository;
    @Mock
    private GameEventBroadcaster eventBroadcaster;
    @Mock
    private ApnsPushService apnsPushService;
    @Mock
    private FcmPushService fcmPushService;
    @Mock
    private GameAccessService gameAccessService;

    @InjectMocks
    private NotificationService notificationService;

    private UUID gameId;
    private UUID teamId;
    private UUID userId;
    private User operator;
    private Game game;
    private Team team;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        teamId = UUID.randomUUID();
        userId = UUID.randomUUID();

        operator = User.builder()
                .id(userId)
                .email("operator@example.com")
                .name("Operator")
                .passwordHash("hash")
                .role(UserRole.operator)
                .build();

        game = Game.builder()
                .id(gameId)
                .name("Test Game")
                .description("Desc")
                .status(GameStatus.live)
                .build();

        team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Pathfinders")
                .joinCode("ABC1234")
                .color("#123456")
                .build();

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null)
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // --- getNotificationsByGame ---

    @Test
    void getNotificationsByGameReturnsNotifications() {
        GameNotification notification = GameNotification.builder()
                .id(UUID.randomUUID())
                .game(game)
                .message("Hello teams!")
                .sentAt(Instant.now())
                .sentBy(operator)
                .build();

        when(notificationRepository.findByGameIdOrderBySentAtDesc(gameId))
                .thenReturn(List.of(notification));

        List<NotificationResponse> result = notificationService.getNotificationsByGame(gameId);

        assertEquals(1, result.size());
        assertEquals("Hello teams!", result.get(0).getMessage());
        assertEquals(gameId, result.get(0).getGameId());
        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
    }

    // --- createNotification: send to specific team ---

    @Test
    void createNotificationSendsToSpecificTeam() {
        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("Go to base 3!");
        request.setTargetTeamId(teamId);

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
        when(notificationRepository.save(any(GameNotification.class))).thenAnswer(invocation -> {
            GameNotification saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(playerRepository.findByTeamIdAndPushTokenIsNotNull(teamId)).thenReturn(List.of());

        NotificationResponse response = notificationService.createNotification(gameId, request);

        assertNotNull(response.getId());
        assertEquals("Go to base 3!", response.getMessage());
        assertEquals(teamId, response.getTargetTeamId());
        verify(eventBroadcaster).broadcastNotification(eq(gameId), any(NotificationResponse.class));
        verify(playerRepository).findByTeamIdAndPushTokenIsNotNull(teamId);
        verify(playerRepository, never()).findByTeamGameIdAndPushTokenIsNotNull(any());
    }

    // --- createNotification: send to all teams (broadcast) ---

    @Test
    void createNotificationBroadcastsToAllTeams() {
        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("Game starts now!");
        request.setTargetTeamId(null);

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(notificationRepository.save(any(GameNotification.class))).thenAnswer(invocation -> {
            GameNotification saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(playerRepository.findByTeamGameIdAndPushTokenIsNotNull(gameId)).thenReturn(List.of());

        NotificationResponse response = notificationService.createNotification(gameId, request);

        assertNotNull(response.getId());
        assertNull(response.getTargetTeamId());
        verify(eventBroadcaster).broadcastNotification(eq(gameId), any(NotificationResponse.class));
        verify(playerRepository).findByTeamGameIdAndPushTokenIsNotNull(gameId);
        verify(playerRepository, never()).findByTeamIdAndPushTokenIsNotNull(any());
    }

    // --- createNotification: push dispatch splits by platform ---

    @Test
    void createNotificationDispatchesPushByPlatform() {
        Player iosPlayer = Player.builder()
                .id(UUID.randomUUID())
                .team(team)
                .deviceId("ios-device")
                .displayName("iOS Scout")
                .pushToken("apns-token-123")
                .pushPlatform(PushPlatform.ios)
                .build();

        Player androidPlayer = Player.builder()
                .id(UUID.randomUUID())
                .team(team)
                .deviceId("android-device")
                .displayName("Android Scout")
                .pushToken("fcm-token-456")
                .pushPlatform(PushPlatform.android)
                .build();

        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("Alert!");
        request.setTargetTeamId(null);

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(notificationRepository.save(any(GameNotification.class))).thenAnswer(invocation -> {
            GameNotification saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(playerRepository.findByTeamGameIdAndPushTokenIsNotNull(gameId))
                .thenReturn(List.of(iosPlayer, androidPlayer));

        notificationService.createNotification(gameId, request);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> apnsCaptor = ArgumentCaptor.forClass(List.class);
        verify(apnsPushService).sendPush(apnsCaptor.capture(), eq("Test Game"), eq("Alert!"), any());
        assertEquals(List.of("apns-token-123"), apnsCaptor.getValue());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> fcmCaptor = ArgumentCaptor.forClass(List.class);
        verify(fcmPushService).sendPush(fcmCaptor.capture(), eq("Test Game"), eq("Alert!"), any());
        assertEquals(List.of("fcm-token-456"), fcmCaptor.getValue());
    }

    @Test
    void createNotificationSendsOnlyApnsWhenNoAndroidPlayers() {
        Player iosPlayer = Player.builder()
                .id(UUID.randomUUID())
                .team(team)
                .deviceId("ios-device")
                .displayName("iOS Scout")
                .pushToken("apns-token-123")
                .pushPlatform(PushPlatform.ios)
                .build();

        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("iOS only");
        request.setTargetTeamId(null);

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(notificationRepository.save(any(GameNotification.class))).thenAnswer(invocation -> {
            GameNotification saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(playerRepository.findByTeamGameIdAndPushTokenIsNotNull(gameId))
                .thenReturn(List.of(iosPlayer));

        notificationService.createNotification(gameId, request);

        verify(apnsPushService).sendPush(any(), eq("Test Game"), eq("iOS only"), any());
        verify(fcmPushService, never()).sendPush(any(), any(), any(), any());
    }

    @Test
    void createNotificationSkipsPushWhenNoPlayersHaveTokens() {
        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("No push");
        request.setTargetTeamId(null);

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(notificationRepository.save(any(GameNotification.class))).thenAnswer(invocation -> {
            GameNotification saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(playerRepository.findByTeamGameIdAndPushTokenIsNotNull(gameId))
                .thenReturn(List.of());

        notificationService.createNotification(gameId, request);

        verify(apnsPushService, never()).sendPush(any(), any(), any(), any());
        verify(fcmPushService, never()).sendPush(any(), any(), any(), any());
    }

    // --- createNotification: target team validation ---

    @Test
    void createNotificationRejectsTeamNotFound() {
        UUID nonExistentTeamId = UUID.randomUUID();

        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("Hello");
        request.setTargetTeamId(nonExistentTeamId);

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(teamRepository.findById(nonExistentTeamId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> notificationService.createNotification(gameId, request));
    }

    @Test
    void createNotificationRejectsTeamFromDifferentGame() {
        UUID otherGameId = UUID.randomUUID();
        Game otherGame = Game.builder()
                .id(otherGameId)
                .name("Other Game")
                .description("Desc")
                .status(GameStatus.live)
                .build();

        Team otherTeam = Team.builder()
                .id(UUID.randomUUID())
                .game(otherGame)
                .name("Other Team")
                .joinCode("XYZ9999")
                .color("#654321")
                .build();

        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("Hello");
        request.setTargetTeamId(otherTeam.getId());

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(teamRepository.findById(otherTeam.getId())).thenReturn(Optional.of(otherTeam));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> notificationService.createNotification(gameId, request));
        assertTrue(ex.getMessage().contains("does not belong"));
    }

    // --- createNotification: null pushPlatform defaults to iOS ---

    @Test
    void createNotificationTreatsNullPlatformAsIos() {
        Player nullPlatformPlayer = Player.builder()
                .id(UUID.randomUUID())
                .team(team)
                .deviceId("old-device")
                .displayName("Legacy Scout")
                .pushToken("apns-legacy-token")
                .pushPlatform(null)
                .build();

        CreateNotificationRequest request = new CreateNotificationRequest();
        request.setMessage("Legacy push");
        request.setTargetTeamId(null);

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(userRepository.findById(userId)).thenReturn(Optional.of(operator));
        when(notificationRepository.save(any(GameNotification.class))).thenAnswer(invocation -> {
            GameNotification saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(playerRepository.findByTeamGameIdAndPushTokenIsNotNull(gameId))
                .thenReturn(List.of(nullPlatformPlayer));

        notificationService.createNotification(gameId, request);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> apnsCaptor = ArgumentCaptor.forClass(List.class);
        verify(apnsPushService).sendPush(apnsCaptor.capture(), eq("Test Game"), eq("Legacy push"), any());
        assertEquals(List.of("apns-legacy-token"), apnsCaptor.getValue());
        verify(fcmPushService, never()).sendPush(any(), any(), any(), any());
    }
}
