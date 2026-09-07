package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.TutorialStatus;
import com.prayer.pointfinder.entity.UserTutorialProgress;
import com.prayer.pointfinder.entity.UserTutorialProgressId;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * The rules practice games share between the create dialog path
 * ({@link GameService#createGame}) and the practice endpoint
 * ({@link PracticeGameService}). Static so neither service depends on the other.
 */
public final class PracticeGames {

    public static final String FIRST_GAME = "first-game";

    /** How long a practice game lives before the scheduler ends it. */
    public static final Duration LIFETIME = Duration.ofHours(24);

    private PracticeGames() {
    }

    public static Instant expiry() {
        return Instant.now().plus(LIFETIME).truncatedTo(ChronoUnit.MICROS);
    }

    /** True only for {@code first-game} while the caller's row for it is in progress. */
    public static boolean isFirstGameRun(UserTutorialProgressRepository progressRepository, UUID userId, String scenario) {
        if (!FIRST_GAME.equals(scenario)) return false;
        return progressRepository.findById(new UserTutorialProgressId(userId, FIRST_GAME))
                .map(row -> row.getStatus() == TutorialStatus.IN_PROGRESS)
                .orElse(false);
    }

    /** One practice game at a time: delete or keep the current one first. */
    public static void ensureNoActivePracticeGame(GameRepository gameRepository, UUID userId) {
        if (gameRepository.existsByCreatedByIdAndTutorialScenarioIsNotNullAndStatusNot(userId, GameStatus.ended)) {
            throw new ConflictException(
                    "You already have a practice game; delete or keep it first",
                    ErrorCode.TUTORIAL_PRACTICE_GAME_EXISTS);
        }
    }

    /** Points the scenario's progress row at the practice game and restarts the run. */
    public static void bindProgressRow(
            UserTutorialProgressRepository progressRepository, UUID userId, String scenarioId, UUID gameId) {
        UserTutorialProgressId id = new UserTutorialProgressId(userId, scenarioId);
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        UserTutorialProgress row = progressRepository.findById(id)
                .orElseGet(() -> UserTutorialProgress.builder().id(id).startedAt(now).build());
        row.setStatus(TutorialStatus.IN_PROGRESS);
        row.setCurrentStep(null);
        row.setGameId(gameId);
        row.setCompletedAt(null);
        row.setUpdatedAt(now);
        progressRepository.save(row);
    }
}
