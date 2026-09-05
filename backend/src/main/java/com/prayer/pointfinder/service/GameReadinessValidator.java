package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Assignment;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
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

        List<Base> allBases = baseRepository.findByGameId(game.getId());

        // Only NFC bases need a written tag. A QR base is printed from the
        // same token and is always ready; a location base has no tag at all.
        long nfcBaseCount = allBases.stream()
                .filter(b -> b.getCheckInMethod() == CheckInMethod.NFC)
                .count();
        long nfcLinkedCount = allBases.stream()
                .filter(b -> b.getCheckInMethod() == CheckInMethod.NFC)
                .filter(b -> Boolean.TRUE.equals(b.getNfcLinked()))
                .count();
        if (nfcLinkedCount < nfcBaseCount) {
            throw new BadRequestException(
                    String.format("All NFC bases must have tags linked before going live. %d of %d bases linked",
                            nfcLinkedCount, nfcBaseCount));
        }

        validateLocationBases(allBases);

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
            List<Base> bases = allBases;
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

    /**
     * Location bases carry the whole burden of proof themselves, so a
     * misconfigured one is not a cosmetic problem — it is a base nobody can
     * ever reach, or two bases that unlock from one spot. Both are caught
     * here rather than discovered by a team standing in a field.
     */
    private void validateLocationBases(List<Base> allBases) {
        List<Base> locationBases = allBases.stream()
                .filter(b -> b.getCheckInMethod() == CheckInMethod.LOCATION)
                .toList();
        if (locationBases.isEmpty()) {
            return;
        }

        for (Base base : locationBases) {
            if (base.getLat() == null || base.getLng() == null
                    || (base.getLat() == 0.0 && base.getLng() == 0.0)) {
                throw new BadRequestException(String.format(
                        "Location base \"%s\" needs real coordinates before going live", base.getName()));
            }
            int radiusM = base.resolvedCheckInRadiusM();
            if (radiusM < CheckInVerificationService.MIN_RADIUS_M
                    || radiusM > CheckInVerificationService.MAX_RADIUS_M) {
                throw new BadRequestException(String.format(
                        "Location base \"%s\" has a check-in radius of %d m; it must be between %d and %d m",
                        base.getName(), radiusM,
                        CheckInVerificationService.MIN_RADIUS_M, CheckInVerificationService.MAX_RADIUS_M));
            }
        }

        for (int i = 0; i < locationBases.size(); i++) {
            for (int j = i + 1; j < locationBases.size(); j++) {
                Base a = locationBases.get(i);
                Base b = locationBases.get(j);
                double distanceM = CheckInVerificationService.haversineMeters(
                        a.getLat(), a.getLng(), b.getLat(), b.getLng());
                double combinedRadiiM = a.resolvedCheckInRadiusM() + b.resolvedCheckInRadiusM();
                if (distanceM < combinedRadiiM) {
                    throw new BadRequestException(String.format(
                            "Location bases \"%s\" and \"%s\" have overlapping rings (%.0f m apart, %.0f m combined radius)",
                            a.getName(), b.getName(), distanceM, combinedRadiiM));
                }
            }
        }
    }
}
