package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.OperatorNotificationSettingsRepository;
import com.prayer.pointfinder.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class OperatorPushNotificationService {

    private final UserRepository userRepository;
    private final OperatorNotificationSettingsRepository settingsRepository;
    private final ApnsPushService apnsPushService;
    private final FcmPushService fcmPushService;

    @Transactional(readOnly = true)
    public void notifyOperatorsForSubmission(Submission submission) {
        UUID gameId = submission.getTeam().getGame().getId();
        SubmissionStatus status = submission.getStatus();

        List<User> targets = resolveTargets(gameId, settings -> {
            if (settings.notifyAllSubmissions()) {
                return true;
            }
            return status == SubmissionStatus.pending && settings.notifyPendingSubmissions();
        });

        if (targets.isEmpty()) {
            return;
        }

        String title = submission.getTeam().getGame().getName();
        String body = submission.getTeam().getName()
                + " submitted at " + submission.getBase().getName()
                + " (" + submission.getChallenge().getTitle() + ")";

        Map<String, String> customData = new HashMap<>();
        customData.put("gameId", gameId.toString());
        customData.put("eventType", "operator_submission");
        customData.put("submissionId", submission.getId().toString());
        customData.put("submissionStatus", status.name());
        customData.put("teamId", submission.getTeam().getId().toString());
        customData.put("baseId", submission.getBase().getId().toString());

        sendByPlatform(targets, title, body, customData);
    }

    @Transactional(readOnly = true)
    public void notifyOperatorsForCheckIn(Game game, Team team, Base base) {
        UUID gameId = game.getId();
        List<User> targets = resolveTargets(gameId, OperatorNotificationPreference::notifyCheckIns);
        if (targets.isEmpty()) {
            return;
        }

        String title = game.getName();
        String body = team.getName() + " checked in at " + base.getName();

        Map<String, String> customData = new HashMap<>();
        customData.put("gameId", gameId.toString());
        customData.put("eventType", "operator_check_in");
        customData.put("teamId", team.getId().toString());
        customData.put("baseId", base.getId().toString());

        sendByPlatform(targets, title, body, customData);
    }

    private List<User> resolveTargets(UUID gameId, Predicate<OperatorNotificationPreference> shouldNotify) {
        List<User> operators = userRepository.findGameOperatorsWithPushToken(gameId);
        if (operators.isEmpty()) {
            return List.of();
        }

        List<UUID> operatorIds = operators.stream()
                .map(User::getId)
                .toList();

        Map<UUID, OperatorNotificationSettings> settingsByUserId = settingsRepository
                .findByGameIdAndUserIdIn(gameId, operatorIds)
                .stream()
                .collect(Collectors.toMap(
                        s -> s.getUser().getId(),
                        s -> s
                ));

        List<User> targets = new ArrayList<>();
        for (User operator : operators) {
            OperatorNotificationPreference preference = OperatorNotificationPreference.from(
                    settingsByUserId.get(operator.getId())
            );
            if (shouldNotify.test(preference)) {
                targets.add(operator);
            }
        }
        return targets;
    }

    private void sendByPlatform(List<User> targets, String title, String body, Map<String, String> customData) {
        List<String> apnsTokens = targets.stream()
                .filter(u -> u.getPushPlatform() == null || u.getPushPlatform() == PushPlatform.ios)
                .map(User::getPushToken)
                .filter(Objects::nonNull)
                .toList();
        List<String> fcmTokens = targets.stream()
                .filter(u -> u.getPushPlatform() == PushPlatform.android)
                .map(User::getPushToken)
                .filter(Objects::nonNull)
                .toList();

        if (!apnsTokens.isEmpty()) {
            apnsPushService.sendPush(apnsTokens, title, body, customData);
        }
        if (!fcmTokens.isEmpty()) {
            fcmPushService.sendPush(fcmTokens, title, body, customData);
        }
    }

    private record OperatorNotificationPreference(
            boolean notifyPendingSubmissions,
            boolean notifyAllSubmissions,
            boolean notifyCheckIns
    ) {
        static OperatorNotificationPreference from(OperatorNotificationSettings settings) {
            if (settings == null) {
                return new OperatorNotificationPreference(true, false, false);
            }
            return new OperatorNotificationPreference(
                    Boolean.TRUE.equals(settings.getNotifyPendingSubmissions()),
                    Boolean.TRUE.equals(settings.getNotifyAllSubmissions()),
                    Boolean.TRUE.equals(settings.getNotifyCheckIns())
            );
        }
    }
}

