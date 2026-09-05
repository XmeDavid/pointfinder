package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/** One shared base route; team challenge assignments never participate in progression. */
@Service
@RequiredArgsConstructor
public class BaseOrderService {
    public static final Comparator<Base> ROUTE_ORDER = Comparator.comparing(Base::getOrderIndex)
            .thenComparing(Base::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Base::getId);
    private final BaseRepository baseRepository;
    private final CheckInRepository checkInRepository;

    public Map<UUID, Integer> sequenceNumbers(Game game) {
        if (!Boolean.TRUE.equals(game.getEnforceBaseOrder())) return Map.of();
        Map<UUID, Integer> numbers = new LinkedHashMap<>();
        for (Base base : orderedBases(game.getId())) numbers.put(base.getId(), numbers.size() + 1);
        return numbers;
    }

    public List<Base> orderedBases(UUID gameId) {
        // UUID resolves legacy ties deterministically, including imports with equal timestamps.
        return baseRepository.findByGameIdOrderByOrderIndexAscCreatedAtAsc(gameId).stream()
                .sorted(ROUTE_ORDER)
                .toList();
    }

    public Integer nextRequiredBaseNumber(Game game, UUID teamId) {
        return nextRequiredBaseNumber(game, teamId, sequenceNumbers(game));
    }

    private Integer nextRequiredBaseNumber(Game game, UUID teamId, Map<UUID, Integer> numbers) {
        if (!Boolean.TRUE.equals(game.getEnforceBaseOrder())) return null;
        Set<UUID> checkedIn = checkInRepository.findByGameIdAndTeamId(game.getId(), teamId).stream()
                .map(ci -> ci.getBase().getId()).collect(Collectors.toSet());
        return numbers.entrySet().stream().filter(e -> !checkedIn.contains(e.getKey()))
                .map(Map.Entry::getValue).findFirst().orElse(null);
    }

    /** Call only after membership/NFC checks and the existing-check-in idempotency lookup. */
    public void requirePreviousBases(Game game, UUID teamId, UUID baseId) {
        if (!Boolean.TRUE.equals(game.getEnforceBaseOrder())) return;
        Map<UUID, Integer> numbers = sequenceNumbers(game);
        Integer next = nextRequiredBaseNumber(game, teamId, numbers);
        Integer target = numbers.get(baseId);
        if (next != null && target != null && target > next) {
            throw new BadRequestException("Visit Base " + next + " first", ErrorCode.PREVIOUS_BASE_REQUIRED,
                    Map.of("nextRequiredBaseNumber", next.toString()));
        }
    }
    /** Reject explicit unlock rules that require reaching the same or a later route base. */
    public static void validateDependencies(Game game, List<Base> bases,
            List<com.prayer.pointfinder.entity.Challenge> challenges,
            List<com.prayer.pointfinder.entity.Stage> stages,
            List<com.prayer.pointfinder.entity.Assignment> assignments) {
        if (!Boolean.TRUE.equals(game.getEnforceBaseOrder())) return;
        List<Base> route = bases.stream().sorted(ROUTE_ORDER).toList();
        Map<UUID, Integer> numbers = new HashMap<>();
        for (int i = 0; i < route.size(); i++) numbers.put(route.get(i).getId(), i + 1);
        for (var challenge : challenges) {
            for (Base target : challenge.getUnlocksBases()) {
                if (!Boolean.TRUE.equals(target.getHidden()) || !numbers.containsKey(target.getId())) continue;
                int targetNumber = numbers.get(target.getId());
                boolean earlierSource = route.stream().anyMatch(source -> source.getFixedChallenge() != null
                        && source.getFixedChallenge().getId().equals(challenge.getId())
                        && numbers.get(source.getId()) < targetNumber);
                // Submission/completion unlocks may come from a team-specific assignment.
                // Only reject when no earlier base can provide the unlocking challenge.
                if (game.getUnlockTrigger() != com.prayer.pointfinder.entity.UnlockTrigger.CHECK_IN) {
                    earlierSource |= assignments.stream().anyMatch(assignment ->
                            assignment.getChallenge().getId().equals(challenge.getId())
                            && numbers.containsKey(assignment.getBase().getId())
                            && numbers.get(assignment.getBase().getId()) < targetNumber);
                }
                if (!earlierSource) {
                    throw dependencyConflict(targetNumber);
                }
            }
        }
        for (var stage : stages) {
            if (Boolean.TRUE.equals(stage.getIsActive())
                    || stage.getTransitionType() != com.prayer.pointfinder.entity.TransitionType.trigger) continue;
            Integer triggerNumber = numbers.get(stage.getTriggerBaseId());
            for (Base base : route) {
                if (stage.getId().equals(base.getStageId())
                        && (triggerNumber == null || triggerNumber >= numbers.get(base.getId()))) {
                    throw dependencyConflict(numbers.get(base.getId()));
                }
            }
        }
    }

    private static BadRequestException dependencyConflict(int number) {
        return new BadRequestException("Base " + number
                + " must be unlocked by an earlier base in the route. Update its unlock rule or route order.",
                ErrorCode.BASE_ORDER_DEPENDENCY_CONFLICT,
                Map.of("sequenceNumber", Integer.toString(number)));
    }
}
