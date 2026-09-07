package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateTutorialProgressRequest;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.entity.TutorialStatus;
import com.prayer.pointfinder.entity.UserTutorialProgress;
import com.prayer.pointfinder.entity.UserTutorialProgressId;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Per-account tutorial progress.
 *
 * <p>Deliberately unaudited: this is UI preference, not domain state. It never
 * touches a game, a team, or a score, so it carries no activity event.
 *
 * <p>Scenario ids are validated against a server-side allowlist rather than a
 * free-text column so a stale client can never fill the table with junk rows
 * that the library page would then have to filter out.
 */
@Service
@RequiredArgsConstructor
public class TutorialProgressService {

    /** Scenario ids the client may report progress for. Grows with each new scenario file. */
    public static final Set<String> KNOWN_SCENARIOS = Set.of("first-game", "fixed-route", "exploration");

    private final UserTutorialProgressRepository progressRepository;
    private final GameRepository gameRepository;

    @Transactional(readOnly = true)
    public List<TutorialProgressResponse> listForCurrentUser() {
        UUID userId = SecurityUtils.getCurrentUser().getId();
        return progressRepository.findAllByIdUserId(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public TutorialProgressResponse upsertForCurrentUser(
            String scenarioId,
            UpdateTutorialProgressRequest request
    ) {
        if (scenarioId == null || !KNOWN_SCENARIOS.contains(scenarioId)) {
            throw new BadRequestException(
                    "Unknown tutorial scenario: " + scenarioId,
                    ErrorCode.TUTORIAL_SCENARIO_UNKNOWN,
                    Map.of("scenarioId", String.valueOf(scenarioId)));
        }

        TutorialStatus status = TutorialStatus.fromWire(request.getStatus());
        if (status == null) {
            throw new BadRequestException(
                    "Unknown tutorial status: " + request.getStatus(),
                    ErrorCode.TUTORIAL_STATUS_UNKNOWN,
                    Map.of("status", String.valueOf(request.getStatus())));
        }

        UUID userId = SecurityUtils.getCurrentUser().getId();
        UserTutorialProgressId id = new UserTutorialProgressId(userId, scenarioId);
        // Postgres stores microseconds; truncating keeps the response equal to the stored row.
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);

        UserTutorialProgress row = progressRepository.findById(id).orElse(null);
        if (row == null) {
            row = UserTutorialProgress.builder().id(id).startedAt(now).build();
        } else if (status == TutorialStatus.IN_PROGRESS && request.getCurrentStep() == null) {
            // Restart: the library's Restart button, expressed without a DELETE endpoint.
            row.setStartedAt(now);
        }

        row.setStatus(status);
        row.setCurrentStep(request.getCurrentStep());
        // The bound game may already be gone: the closing card deletes a practice
        // game and the client's debounced write lands after. Storing null keeps
        // the row (and its completion) instead of failing the foreign key.
        UUID gameId = request.getGameId();
        row.setGameId(gameId != null && gameRepository.existsById(gameId) ? gameId : null);
        row.setCompletedAt(status == TutorialStatus.COMPLETED ? now : null);
        row.setUpdatedAt(now);

        return toResponse(progressRepository.save(row));
    }

    private TutorialProgressResponse toResponse(UserTutorialProgress row) {
        return new TutorialProgressResponse(
                row.getId().getScenarioId(),
                row.getStatus().wireName(),
                row.getCurrentStep(),
                row.getGameId(),
                row.getStartedAt(),
                row.getCompletedAt());
    }
}
