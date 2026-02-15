package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.OperatorNotificationSettingsRepository;
import com.prayer.pointfinder.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OperatorPushNotificationServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private OperatorNotificationSettingsRepository settingsRepository;
    @Mock
    private ApnsPushService apnsPushService;
    @Mock
    private FcmPushService fcmPushService;

    @InjectMocks
    private OperatorPushNotificationService operatorPushNotificationService;

    @Test
    void pendingSubmissionUsesDefaultPreferenceAndNotifiesOperators() {
        Submission submission = buildSubmission(SubmissionStatus.pending);
        User operator = buildOperator(PushPlatform.ios, "ios-token");

        when(userRepository.findGameOperatorsWithPushToken(submission.getTeam().getGame().getId()))
                .thenReturn(List.of(operator));
        when(settingsRepository.findByGameIdAndUserIdIn(
                eq(submission.getTeam().getGame().getId()),
                any(List.class)
        )).thenReturn(List.of());

        operatorPushNotificationService.notifyOperatorsForSubmission(submission);

        verify(apnsPushService, times(1)).sendPush(any(List.class), any(String.class), any(String.class), anyMap());
        verifyNoInteractions(fcmPushService);
    }

    @Test
    void autoValidatedSubmissionDoesNotNotifyWithDefaultPreference() {
        Submission submission = buildSubmission(SubmissionStatus.correct);
        User operator = buildOperator(PushPlatform.ios, "ios-token");

        when(userRepository.findGameOperatorsWithPushToken(submission.getTeam().getGame().getId()))
                .thenReturn(List.of(operator));
        when(settingsRepository.findByGameIdAndUserIdIn(
                eq(submission.getTeam().getGame().getId()),
                any(List.class)
        )).thenReturn(List.of());

        operatorPushNotificationService.notifyOperatorsForSubmission(submission);

        verifyNoInteractions(apnsPushService, fcmPushService);
    }

    @Test
    void allSubmissionsPreferenceNotifiesForNonPendingSubmission() {
        Submission submission = buildSubmission(SubmissionStatus.correct);
        User operator = buildOperator(PushPlatform.android, "android-token");
        OperatorNotificationSettings settings = OperatorNotificationSettings.builder()
                .id(UUID.randomUUID())
                .game(submission.getTeam().getGame())
                .user(operator)
                .notifyPendingSubmissions(false)
                .notifyAllSubmissions(true)
                .notifyCheckIns(false)
                .build();

        when(userRepository.findGameOperatorsWithPushToken(submission.getTeam().getGame().getId()))
                .thenReturn(List.of(operator));
        when(settingsRepository.findByGameIdAndUserIdIn(
                eq(submission.getTeam().getGame().getId()),
                any(List.class)
        )).thenReturn(List.of(settings));

        operatorPushNotificationService.notifyOperatorsForSubmission(submission);

        verify(fcmPushService, times(1)).sendPush(any(List.class), any(String.class), any(String.class), anyMap());
        verifyNoInteractions(apnsPushService);
    }

    @Test
    void checkInNotificationRespectsPreferenceToggle() {
        Game game = buildGame();
        Team team = buildTeam(game);
        Base base = buildBase(game);
        User operator = buildOperator(PushPlatform.ios, "ios-token");
        OperatorNotificationSettings settings = OperatorNotificationSettings.builder()
                .id(UUID.randomUUID())
                .game(game)
                .user(operator)
                .notifyPendingSubmissions(true)
                .notifyAllSubmissions(false)
                .notifyCheckIns(true)
                .build();

        when(userRepository.findGameOperatorsWithPushToken(game.getId())).thenReturn(List.of(operator));
        when(settingsRepository.findByGameIdAndUserIdIn(eq(game.getId()), any(List.class)))
                .thenReturn(List.of(settings));

        operatorPushNotificationService.notifyOperatorsForCheckIn(game, team, base);

        verify(apnsPushService, times(1)).sendPush(any(List.class), any(String.class), any(String.class), anyMap());
        verifyNoInteractions(fcmPushService);
    }

    private Submission buildSubmission(SubmissionStatus status) {
        Game game = buildGame();
        Team team = buildTeam(game);
        Challenge challenge = Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .title("Photo proof")
                .description("desc")
                .content("content")
                .completionContent("done")
                .answerType(AnswerType.file)
                .autoValidate(false)
                .points(10)
                .locationBound(false)
                .build();
        Base base = buildBase(game);
        return Submission.builder()
                .id(UUID.randomUUID())
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer("")
                .status(status)
                .submittedAt(Instant.now())
                .build();
    }

    private Game buildGame() {
        return Game.builder()
                .id(UUID.randomUUID())
                .name("Live Camporee")
                .description("desc")
                .status(GameStatus.live)
                .build();
    }

    private Team buildTeam(Game game) {
        return Team.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Wolves")
                .joinCode("WOLF123")
                .color("#112233")
                .build();
    }

    private Base buildBase(Game game) {
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Base A")
                .description("desc")
                .lat(1.0)
                .lng(2.0)
                .nfcLinked(true)
                .requirePresenceToSubmit(false)
                .hidden(false)
                .build();
    }

    private User buildOperator(PushPlatform platform, String token) {
        return User.builder()
                .id(UUID.randomUUID())
                .email("operator@example.com")
                .name("Operator")
                .passwordHash("hash")
                .role(UserRole.operator)
                .pushPlatform(platform)
                .pushToken(token)
                .build();
    }
}

