package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
class GameEventBroadcasterTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private MobileRealtimeHub mobileRealtimeHub;

    private GameEventBroadcaster broadcaster;

    private UUID gameId;

    @BeforeEach
    void setUp() {
        broadcaster = new GameEventBroadcaster(messagingTemplate, mobileRealtimeHub);
        gameId = UUID.randomUUID();
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

        @SuppressWarnings("unchecked")
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

        @SuppressWarnings("unchecked")
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

        @SuppressWarnings("unchecked")
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
}
