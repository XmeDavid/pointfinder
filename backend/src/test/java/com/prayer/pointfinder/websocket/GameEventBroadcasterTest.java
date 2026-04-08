package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.GameRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GameEventBroadcasterTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private MobileRealtimeHub mobileRealtimeHub;

    @Mock
    private GameRepository gameRepository;

    private GameEventBroadcaster broadcaster;

    private UUID gameId;

    @BeforeEach
    void setUp() {
        broadcaster = new GameEventBroadcaster(messagingTemplate, mobileRealtimeHub, gameRepository);
        gameId = UUID.randomUUID();
        // Default: increment returns a monotonic value; individual tests can
        // override with a specific value where the assertion needs it.
        when(gameRepository.incrementStateVersion(any(UUID.class))).thenReturn(1L);
    }

    @Test
    @SuppressWarnings("unchecked")
    void broadcastActivityEventSendsCorrectPayloadShape() {
        UUID teamId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();

        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.live).build();
        Team team = Team.builder().id(teamId).game(game).name("T").joinCode("J").color("#000").build();
        Base base = Base.builder().id(baseId).game(game).name("B").description("").lat(0.0).lng(0.0).nfcLinked(true).build();
        Challenge challenge = Challenge.builder().id(challengeId).game(game).title("C").description("").content("").completionContent("").answerType(AnswerType.text).autoValidate(false).points(10).locationBound(false).build();

        ActivityEvent event = ActivityEvent.builder()
                .id(eventId)
                .game(game)
                .type(ActivityEventType.submission)
                .team(team)
                .base(base)
                .challenge(challenge)
                .message("Team T submitted answer")
                .timestamp(Instant.now())
                .build();

        // No active transaction -> dispatches immediately
        broadcaster.broadcastActivityEvent(gameId, event);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), payloadCaptor.capture());
        verify(mobileRealtimeHub).broadcast(eq(gameId), any());

        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals(1, payload.get("version"));
        assertEquals("activity", payload.get("type"));
        assertEquals(gameId, payload.get("gameId"));
        assertNotNull(payload.get("emittedAt"));

        Map<String, Object> data = (Map<String, Object>) payload.get("data");
        assertEquals(eventId, data.get("id"));
        assertEquals(teamId, data.get("teamId"));
        assertEquals(baseId, data.get("baseId"));
        assertEquals(challengeId, data.get("challengeId"));
        assertEquals("submission", data.get("type"));
        assertEquals("Team T submitted answer", data.get("message"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void broadcastSubmissionStatusIncludesAllRequiredFields() {
        UUID submissionId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID reviewerId = UUID.randomUUID();

        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.live).build();
        Team team = Team.builder().id(teamId).game(game).name("T").joinCode("J").color("#000").build();
        Challenge challenge = Challenge.builder().id(challengeId).game(game).title("C").description("").content("").completionContent("").answerType(AnswerType.text).autoValidate(false).points(50).locationBound(false).build();
        Base base = Base.builder().id(baseId).game(game).name("B").description("").lat(0.0).lng(0.0).nfcLinked(true).build();
        User reviewer = User.builder().id(reviewerId).email("r@t.com").name("R").passwordHash("h").role(UserRole.operator).build();

        Submission submission = Submission.builder()
                .id(submissionId)
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer("42")
                .status(SubmissionStatus.approved)
                .submittedAt(Instant.now())
                .reviewedBy(reviewer)
                .feedback("Good job")
                .points(50)
                .build();

        broadcaster.broadcastSubmissionStatus(gameId, submission);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), payloadCaptor.capture());

        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals("submission_status", payload.get("type"));

        Map<String, Object> data = (Map<String, Object>) payload.get("data");
        assertEquals(submissionId, data.get("id"));
        assertEquals(teamId, data.get("teamId"));
        assertEquals(challengeId, data.get("challengeId"));
        assertEquals("approved", data.get("status"));
        assertEquals(50, data.get("points"));
        assertEquals(reviewerId, data.get("reviewedBy"));
        assertEquals("Good job", data.get("feedback"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void broadcastGameStatusWrapsStatusStringInPayload() {
        broadcaster.broadcastGameStatus(gameId, "live");

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), payloadCaptor.capture());

        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals("game_status", payload.get("type"));

        Map<String, Object> data = (Map<String, Object>) payload.get("data");
        assertEquals("live", data.get("status"));
    }

    @Test
    void insideTransactionDefersToAfterCommit() {
        // Simulate an active transaction
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        try {
            broadcaster.broadcastGameStatus(gameId, "ended");

            // Should NOT have dispatched yet
            verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
            verify(mobileRealtimeHub, never()).broadcast(any(), any());

            // Simulate transaction commit
            for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
                sync.afterCommit();
            }

            // Now it should have dispatched
            verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), any(Object.class));
            verify(mobileRealtimeHub).broadcast(eq(gameId), any(Map.class));
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false);
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void outsideTransactionDispatchesImmediately() {
        // Ensure no active transaction synchronization
        assertFalse(TransactionSynchronizationManager.isSynchronizationActive());

        broadcaster.broadcastGameStatus(gameId, "setup");

        // Should dispatch immediately
        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), any(Object.class));
        verify(mobileRealtimeHub).broadcast(eq(gameId), any(Map.class));
    }

    // ── State version bump contract (P0 Track 2 Slice 1) ───────────────
    //
    // Realtime is invalidation; snapshot is canonical. The state_version bump
    // is the invalidation signal. Every state-mutating, snapshot-relevant
    // event MUST bump; transient events (location, presence) MUST NOT.

    @Test
    @SuppressWarnings("unchecked")
    void broadcastGameStatusBumpsStateVersionAndIncludesItInPayload() {
        when(gameRepository.incrementStateVersion(gameId)).thenReturn(42L);

        broadcaster.broadcastGameStatus(gameId, "live");

        verify(gameRepository).incrementStateVersion(gameId);
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), payloadCaptor.capture());
        assertEquals(42L, payloadCaptor.getValue().get("stateVersion"));
    }

    @Test
    void broadcastGameConfigBumpsStateVersion() {
        broadcaster.broadcastGameConfig(gameId, "base", "create");
        verify(gameRepository).incrementStateVersion(gameId);
    }

    @Test
    void broadcastLeaderboardUpdateBumpsStateVersion() {
        broadcaster.broadcastLeaderboardUpdate(gameId, Map.of("ranked", true));
        verify(gameRepository).incrementStateVersion(gameId);
    }

    @Test
    void broadcastNotificationBumpsStateVersion() {
        broadcaster.broadcastNotification(gameId, null);
        verify(gameRepository).incrementStateVersion(gameId);
    }

    @Test
    void broadcastActivityEventBumpsStateVersion() {
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.live).build();
        Team team = Team.builder().id(UUID.randomUUID()).game(game).name("T").joinCode("J").color("#000").build();
        ActivityEvent event = ActivityEvent.builder()
                .id(UUID.randomUUID())
                .game(game)
                .type(ActivityEventType.check_in)
                .team(team)
                .message("checked in")
                .timestamp(Instant.now())
                .build();
        broadcaster.broadcastActivityEvent(gameId, event);
        verify(gameRepository).incrementStateVersion(gameId);
    }

    @Test
    void broadcastSubmissionStatusBumpsStateVersion() {
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.live).build();
        Team team = Team.builder().id(UUID.randomUUID()).game(game).name("T").joinCode("J").color("#000").build();
        Challenge challenge = Challenge.builder().id(UUID.randomUUID()).game(game).title("C").description("").content("").completionContent("").answerType(AnswerType.text).autoValidate(false).points(10).locationBound(false).build();
        Base base = Base.builder().id(UUID.randomUUID()).game(game).name("B").description("").lat(0.0).lng(0.0).nfcLinked(true).build();
        Submission submission = Submission.builder()
                .id(UUID.randomUUID())
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer("x")
                .status(SubmissionStatus.pending)
                .submittedAt(Instant.now())
                .build();
        broadcaster.broadcastSubmissionStatus(gameId, submission);
        verify(gameRepository).incrementStateVersion(gameId);
    }

    @Test
    @SuppressWarnings("unchecked")
    void broadcastLocationUpdateDoesNotBumpStateVersion() {
        broadcaster.broadcastLocationUpdate(gameId, Map.of("lat", 47.0, "lng", 8.0));
        verify(gameRepository, never()).incrementStateVersion(any(UUID.class));

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), payloadCaptor.capture());
        assertFalse(payloadCaptor.getValue().containsKey("stateVersion"),
                "location events must not carry stateVersion");
    }

    @Test
    @SuppressWarnings("unchecked")
    void broadcastPresenceDoesNotBumpStateVersion() {
        broadcaster.broadcastPresence(gameId, Map.of("online", 2));
        verify(gameRepository, never()).incrementStateVersion(any(UUID.class));

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), payloadCaptor.capture());
        assertFalse(payloadCaptor.getValue().containsKey("stateVersion"),
                "presence events must not carry stateVersion");
    }

    @Test
    void bumpFailureDoesNotPreventBroadcast() {
        // If the database hiccups during the state_version bump, we still
        // need to broadcast the underlying event — honest realtime beats
        // version-correct silence.
        when(gameRepository.incrementStateVersion(gameId))
                .thenThrow(new RuntimeException("boom"));

        broadcaster.broadcastGameStatus(gameId, "live");

        verify(messagingTemplate).convertAndSend(eq("/topic/games/" + gameId), any(Object.class));
        verify(mobileRealtimeHub).broadcast(eq(gameId), any(Map.class));
    }
}
