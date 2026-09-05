package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Assignment;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.AssignmentRepository;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Validates that a game meets all prerequisites before transitioning to
 * the {@code live} status: bases, NFC links, teams, challenges, team
 * variables, and location-bound assignment coverage.
 */
@Service
@RequiredArgsConstructor
public class GameReadinessValidator {

    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final TeamRepository teamRepository;
    private final AssignmentRepository assignmentRepository;
    private final TeamVariableService teamVariableService;
    private final com.prayer.pointfinder.repository.StageRepository stageRepository;

    /**
     * Throws {@link BadRequestException} if the game cannot go live.
     */
    public void validateGoLivePrerequisites(Game game) {
        if (game.getStartDate() != null && game.getStartDate().isAfter(Instant.now())) {
            throw new BadRequestException("Cannot go live before the scheduled start date");
        }

        long baseCount = baseRepository.countByGameId(game.getId());
        if (baseCount == 0) {
            throw new BadRequestException("Game must have at least one base before going live");
        }

        long nfcLinkedCount = baseRepository.countByGameIdAndNfcLinkedTrue(game.getId());
        if (nfcLinkedCount < baseCount) {
            throw new BadRequestException(
                    String.format("All bases must have NFC tags linked before going live. %d of %d bases linked",
                            nfcLinkedCount, baseCount));
        }

        long teamCount = teamRepository.countByGameId(game.getId());
        if (teamCount == 0) {
            throw new BadRequestException("Game must have at least one team before going live");
        }

        long challengeCount = challengeRepository.countByGameId(game.getId());
        if (challengeCount < baseCount) {
            throw new BadRequestException(
                    String.format("Need at least %d challenges (one per base), but only %d available.",
                            baseCount, challengeCount));
        }

        if (Boolean.TRUE.equals(game.getEnforceBaseOrder())) {
            BaseOrderService.validateDependencies(game, baseRepository.findByGameId(game.getId()),
                    challengeRepository.findByGameId(game.getId()),
                    stageRepository.findByGameIdOrderByOrderIndexAsc(game.getId()),
                    assignmentRepository.findByGameId(game.getId()));
        }

        // Ensure all team variables have values for every team and every
        // {{key}} reference in challenge content/completionContent/correctAnswer
        // resolves for every team (scanned by TeamVariableService).
        List<String> variableErrors = teamVariableService.validateVariableCompleteness(game.getId());
        if (!variableErrors.isEmpty()) {
            throw new BadRequestException(
                    "Team variables incomplete: " + variableErrors.get(0),
                    ErrorCode.VARIABLE_REFERENCE_UNDEFINED);
        }

        // Ensure all location-bound challenges are assigned (via fixedChallengeId or assignment record)
        List<Challenge> locationBoundChallenges = challengeRepository.findByGameId(game.getId()).stream()
                .filter(c -> Boolean.TRUE.equals(c.getLocationBound()))
                .toList();
        if (!locationBoundChallenges.isEmpty()) {
            List<Base> bases = baseRepository.findByGameId(game.getId());
            Set<UUID> fixedChallengeIds = bases.stream()
                    .map(Base::getFixedChallenge)
                    .filter(Objects::nonNull)
                    .map(Challenge::getId)
                    .collect(Collectors.toSet());
            List<Assignment> assignments = assignmentRepository.findByGameId(game.getId());
            Set<UUID> assignedChallengeIds = assignments.stream()
                    .map(a -> a.getChallenge().getId())
                    .collect(Collectors.toSet());

            long unassignedCount = locationBoundChallenges.stream()
                    .filter(c -> !fixedChallengeIds.contains(c.getId()) && !assignedChallengeIds.contains(c.getId()))
                    .count();
            if (unassignedCount > 0) {
                throw new BadRequestException(
                        String.format("%d location-bound challenge(s) not assigned to any base", unassignedCount));
            }
        }
    }
}
