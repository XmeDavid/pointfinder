package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.RouteStatusResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Stage;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.StageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Base routes, one per stage (OW-40). A stage's bases are numbered from 1
 * and gated only among themselves; stages are sequenced by activation, not
 * by route position. Bases without a stage form the default route, governed
 * by the game-level flag, which is also the only route of a game without
 * stages. Team challenge assignments never participate in progression.
 */
@Service
@RequiredArgsConstructor
public class BaseOrderService {

    public static final Comparator<Base> ROUTE_ORDER = Comparator.comparing(Base::getOrderIndex)
            .thenComparing(Base::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Base::getId);

    private final BaseRepository baseRepository;
    private final CheckInRepository checkInRepository;
    private final StageRepository stageRepository;

    /**
     * Everything a player-facing response needs about routes, computed once
     * per request: numbers per base, one status per visible route, and the
     * single-number summary older clients read.
     */
    public record RouteView(boolean anyEnforced, Map<UUID, Integer> sequenceNumbers, List<RouteStatusResponse> routes) {
        /**
         * The legacy pair only describes a game with exactly one enforced route;
         * with several, an old client comparing numbers across routes would block
         * wrongly, so it is told the game is unrestricted instead.
         */
        public boolean legacyEnforced() {
            return routes.stream().filter(RouteStatusResponse::enforceBaseOrder).count() == 1;
        }

        public Integer legacyNextRequiredBaseNumber() {
            if (!legacyEnforced()) return null;
            for (RouteStatusResponse route : routes) {
                if (route.enforceBaseOrder()) return route.nextRequiredBaseNumber(); // null once that route is done
            }
            return null;
        }
    }

    /** Route key of a base: its stage, or null for the default route. */
    private static UUID scopeOf(Base base) {
        return base.getStageId();
    }

    /** Whether any route of the game is enforced, so callers know to show route state at all. */
    public boolean anyRouteEnforced(Game game) {
        return anyRouteEnforced(game, stageRepository.findByGameIdOrderByOrderIndexAsc(game.getId()));
    }

    public static boolean anyRouteEnforced(Game game, List<Stage> stages) {
        return Boolean.TRUE.equals(game.getEnforceBaseOrder())
                || stages.stream().anyMatch(s -> Boolean.TRUE.equals(s.getEnforceBaseOrder()));
    }

    /** Which routes are enforced: stage id → flag, plus null for the default route. */
    private static Map<UUID, Boolean> enforcement(Game game, List<Stage> stages) {
        Map<UUID, Boolean> enforced = new HashMap<>();
        enforced.put(null, Boolean.TRUE.equals(game.getEnforceBaseOrder()));
        for (Stage stage : stages) enforced.put(stage.getId(), Boolean.TRUE.equals(stage.getEnforceBaseOrder()));
        return enforced;
    }

    /** One-based number of every base of an enforced route, keyed by base id; empty when nothing is enforced. */
    public Map<UUID, Integer> sequenceNumbers(Game game) {
        List<Stage> stages = stageRepository.findByGameIdOrderByOrderIndexAsc(game.getId());
        if (!anyRouteEnforced(game, stages)) return Map.of();
        return numberRoutes(orderedBases(game.getId()), enforcement(game, stages));
    }

    static Map<UUID, Integer> numberRoutes(List<Base> orderedBases, Map<UUID, Boolean> enforced) {
        Map<UUID, Integer> numbers = new LinkedHashMap<>();
        Map<UUID, Integer> counters = new HashMap<>();
        for (Base base : orderedBases) {
            UUID scope = scopeOf(base);
            if (!Boolean.TRUE.equals(enforced.getOrDefault(scope, false))) continue;
            int n = counters.merge(scope, 1, Integer::sum);
            numbers.put(base.getId(), n);
        }
        return numbers;
    }

    public List<Base> orderedBases(UUID gameId) {
        // UUID resolves legacy ties deterministically, including imports with equal timestamps.
        return baseRepository.findByGameIdOrderByOrderIndexAscCreatedAtAsc(gameId).stream()
                .sorted(ROUTE_ORDER)
                .toList();
    }

    /** The routes a team can see and where it stands on each; three queries, whatever the caller then reads. */
    public RouteView view(Game game, UUID teamId) {
        List<Stage> stages = stageRepository.findByGameIdOrderByOrderIndexAsc(game.getId());
        boolean any = anyRouteEnforced(game, stages);
        if (!any) return new RouteView(false, Map.of(), List.of());
        List<Base> bases = orderedBases(game.getId());
        Map<UUID, Boolean> enforced = enforcement(game, stages);
        Map<UUID, Integer> numbers = numberRoutes(bases, enforced);
        Set<UUID> checkedIn = checkedInBases(game, teamId);
        List<RouteStatusResponse> routes = new ArrayList<>();
        // Only active stages: a player is not told that a closed stage exists or is ordered.
        for (Stage stage : stages) {
            if (Boolean.TRUE.equals(stage.getIsActive())) routes.add(routeStatus(stage.getId(), enforced, bases, numbers, checkedIn));
        }
        boolean hasDefaultBases = bases.stream().anyMatch(b -> b.getStageId() == null);
        if (stages.isEmpty() || hasDefaultBases) {
            routes.add(routeStatus(null, enforced, bases, numbers, checkedIn));
        }
        return new RouteView(true, numbers, routes);
    }

    /** Every visible route of the game with the team's next required number. */
    public List<RouteStatusResponse> routes(Game game, UUID teamId) {
        return view(game, teamId).routes();
    }

    private static RouteStatusResponse routeStatus(UUID scope, Map<UUID, Boolean> enforced, List<Base> bases,
            Map<UUID, Integer> numbers, Set<UUID> checkedIn) {
        boolean on = Boolean.TRUE.equals(enforced.getOrDefault(scope, false));
        return new RouteStatusResponse(scope, on, on ? nextIn(scope, bases, numbers, checkedIn) : null);
    }

    private static Integer nextIn(UUID scope, List<Base> bases, Map<UUID, Integer> numbers, Set<UUID> checkedIn) {
        return bases.stream()
                .filter(b -> Objects.equals(scopeOf(b), scope) && numbers.containsKey(b.getId()) && !checkedIn.contains(b.getId()))
                .map(b -> numbers.get(b.getId()))
                .findFirst().orElse(null);
    }

    private Set<UUID> checkedInBases(Game game, UUID teamId) {
        return checkInRepository.findByGameIdAndTeamId(game.getId(), teamId).stream()
                .map(ci -> ci.getBase().getId()).collect(Collectors.toSet());
    }

    /**
     * The one number older clients read: the next required base of the only
     * enforced route. Null when nothing is enforced, when that route is done,
     * or when several routes are enforced (see {@link RouteView#legacyEnforced()}).
     */
    public Integer nextRequiredBaseNumber(Game game, UUID teamId) {
        return view(game, teamId).legacyNextRequiredBaseNumber();
    }

    /** Call only after membership/NFC checks and the existing-check-in idempotency lookup. */
    public void requirePreviousBases(Game game, UUID teamId, UUID baseId) {
        List<Stage> stages = stageRepository.findByGameIdOrderByOrderIndexAsc(game.getId());
        if (!anyRouteEnforced(game, stages)) return;
        List<Base> bases = orderedBases(game.getId());
        Map<UUID, Boolean> enforced = enforcement(game, stages);
        Map<UUID, Integer> numbers = numberRoutes(bases, enforced);
        Integer target = numbers.get(baseId);
        Base targetBase = bases.stream().filter(b -> b.getId().equals(baseId)).findFirst().orElse(null);
        if (target == null || targetBase == null) return; // this base's route is not enforced
        Integer next = nextIn(scopeOf(targetBase), bases, numbers, checkedInBases(game, teamId));
        if (next != null && target > next) {
            throw new BadRequestException("Visit Base " + next + " first", ErrorCode.PREVIOUS_BASE_REQUIRED,
                    Map.of("nextRequiredBaseNumber", next.toString()));
        }
    }

    /**
     * Reject explicit unlock rules that require reaching the same or a later
     * base. Within a route that means a later number; across routes it means
     * a source in a stage that comes after the target's, since a later stage
     * is not open yet when the team reaches the hidden base. Bases without a
     * stage are always open, so they can unlock anything and are unlocked by
     * nothing outside their own route.
     */
    public static void validateDependencies(Game game, List<Base> bases,
            List<com.prayer.pointfinder.entity.Challenge> challenges,
            List<Stage> stages,
            List<com.prayer.pointfinder.entity.Assignment> assignments) {
        if (!anyRouteEnforced(game, stages)) return;
        List<Base> route = bases.stream().sorted(ROUTE_ORDER).toList();
        Map<UUID, Integer> numbers = numberRoutes(route, enforcement(game, stages));
        Map<UUID, UUID> scopeByBase = new HashMap<>();
        for (Base base : route) scopeByBase.put(base.getId(), scopeOf(base));
        Map<UUID, Integer> stageOrder = new HashMap<>();
        for (Stage stage : stages) stageOrder.put(stage.getId(), stage.getOrderIndex());
        for (var challenge : challenges) {
            for (Base target : challenge.getUnlocksBases()) {
                if (!Boolean.TRUE.equals(target.getHidden()) || !numbers.containsKey(target.getId())) continue;
                int targetNumber = numbers.get(target.getId());
                UUID targetScope = scopeByBase.get(target.getId());
                boolean reachable = route.stream().anyMatch(source -> providesChallenge(source, challenge, assignments, game)
                        && (Objects.equals(scopeByBase.get(source.getId()), targetScope)
                                ? numbers.containsKey(source.getId()) && numbers.get(source.getId()) < targetNumber
                                : routeComesBefore(scopeByBase.get(source.getId()), targetScope, stageOrder)));
                if (!reachable) {
                    throw dependencyConflict(targetNumber);
                }
            }
        }
    }

    /** Default route first (always open), then stages by their order. */
    private static boolean routeComesBefore(UUID source, UUID target, Map<UUID, Integer> stageOrder) {
        int s = source == null ? Integer.MIN_VALUE : stageOrder.getOrDefault(source, Integer.MAX_VALUE);
        int t = target == null ? Integer.MIN_VALUE : stageOrder.getOrDefault(target, Integer.MAX_VALUE);
        return s < t;
    }

    private static boolean providesChallenge(Base source, com.prayer.pointfinder.entity.Challenge challenge,
            List<com.prayer.pointfinder.entity.Assignment> assignments, Game game) {
        if (source.getFixedChallenge() != null && source.getFixedChallenge().getId().equals(challenge.getId())) return true;
        // Submission/completion unlocks may come from a team-specific assignment.
        if (game.getUnlockTrigger() == com.prayer.pointfinder.entity.UnlockTrigger.CHECK_IN) return false;
        return assignments.stream().anyMatch(a -> a.getChallenge().getId().equals(challenge.getId())
                && a.getBase().getId().equals(source.getId()));
    }

    private static BadRequestException dependencyConflict(int number) {
        return new BadRequestException("Base " + number
                + " must be unlocked by an earlier base in its route. Update its unlock rule or route order.",
                ErrorCode.BASE_ORDER_DEPENDENCY_CONFLICT,
                Map.of("sequenceNumber", Integer.toString(number)));
    }
}
