package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Stage;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.StageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BaseOrderServiceTest {

    BaseRepository bases = mock(BaseRepository.class);
    CheckInRepository checkIns = mock(CheckInRepository.class);
    StageRepository stages = mock(StageRepository.class);
    BaseOrderService service = new BaseOrderService(bases, checkIns, stages);

    Game game = Game.builder().id(UUID.randomUUID()).enforceBaseOrder(true).build();
    Base first = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(8).hidden(true).build();
    Base second = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(20).build();
    UUID team = UUID.randomUUID();

    @BeforeEach void route() {
        when(bases.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(second, first));
        when(stages.findByGameIdOrderByOrderIndexAsc(game.getId())).thenReturn(List.of());
    }

    // ── one default route (no stages): unchanged behaviour ───────────────

    @Test void hiddenInactiveEarlierBaseStillBlocksAndOnlyNumberIsReturned() {
        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> service.requirePreviousBases(game, team, second.getId()));
        assertEquals(ErrorCode.PREVIOUS_BASE_REQUIRED, ex.getErrorCode());
        assertEquals(Map.of("nextRequiredBaseNumber", "1"), ex.getErrors());
        assertFalse(ex.getMessage().contains(first.getId().toString()));
        assertEquals(Map.of(first.getId(), 1, second.getId(), 2), service.sequenceNumbers(game));
    }

    @Test void checkInAloneAdvancesOnlyThatTeamRegardlessOfChallenges() {
        first.setFixedChallenge(Challenge.builder().id(UUID.randomUUID()).build());
        second.setFixedChallenge(Challenge.builder().id(UUID.randomUUID()).build());
        when(checkIns.findByGameIdAndTeamId(game.getId(), team)).thenReturn(List.of(CheckIn.builder().base(first).build()));
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, second.getId()));
        assertEquals(2, service.nextRequiredBaseNumber(game, team));
        assertEquals(1, service.nextRequiredBaseNumber(game, UUID.randomUUID()));
    }

    @Test void earliestGapSurvivesManualRescueOfALaterBase() {
        when(checkIns.findByGameIdAndTeamId(game.getId(), team)).thenReturn(List.of(CheckIn.builder().base(second).build()));
        assertEquals(1, service.nextRequiredBaseNumber(game, team));
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, first.getId()));
    }

    @Test void disabledModeDoesNotReadProgressOrExposeNumbers() {
        game.setEnforceBaseOrder(false);
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, second.getId()));
        assertNull(service.nextRequiredBaseNumber(game, team));
        assertTrue(service.sequenceNumbers(game).isEmpty());
        assertFalse(service.anyRouteEnforced(game));
        verifyNoInteractions(checkIns);
    }

    @Test void finishedRouteHasNoNextBase() {
        when(checkIns.findByGameIdAndTeamId(game.getId(), team)).thenReturn(List.of(
                CheckIn.builder().base(first).build(), CheckIn.builder().base(second).build()));
        assertNull(service.nextRequiredBaseNumber(game, team));
        assertEquals(List.of(new com.prayer.pointfinder.dto.response.RouteStatusResponse(null, true, null)),
                service.routes(game, team));
    }

    @Test void backwardsHiddenUnlockDependencyRejectedBeforeLaunch() {
        Challenge unlock = Challenge.builder().id(UUID.randomUUID()).unlocksBases(new HashSet<>(Set.of(first))).build();
        second.setFixedChallenge(unlock);
        assertEquals(ErrorCode.BASE_ORDER_DEPENDENCY_CONFLICT, assertThrows(BadRequestException.class,
                () -> BaseOrderService.validateDependencies(game, List.of(first, second), List.of(unlock), List.of(), List.of())).getErrorCode());
        first.setHidden(false);
        second.setHidden(true);
        first.setFixedChallenge(unlock);
        second.setFixedChallenge(null);
        unlock.setUnlocksBases(new HashSet<>(Set.of(second)));
        assertDoesNotThrow(() -> BaseOrderService.validateDependencies(game, List.of(first, second), List.of(unlock), List.of(), List.of()));
    }

    // ── routes per stage (OW-40) ─────────────────────────────────────────

    Stage explore = Stage.builder().id(UUID.randomUUID()).game(game).name("Explore").orderIndex(0).isActive(true).enforceBaseOrder(false).build();
    Stage race = Stage.builder().id(UUID.randomUUID()).game(game).name("Race").orderIndex(1).isActive(false).enforceBaseOrder(true).build();

    private void stagedGame() {
        game.setEnforceBaseOrder(false);
        first.setStageId(explore.getId());
        second.setStageId(explore.getId());
        when(stages.findByGameIdOrderByOrderIndexAsc(game.getId())).thenReturn(List.of(explore, race));
    }

    @Test void aFreeStageNextToAnOrderedOneNumbersOnlyTheOrderedRoute() {
        stagedGame();
        race.setIsActive(true);
        Base r1 = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(1).stageId(race.getId()).build();
        Base r2 = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(2).stageId(race.getId()).build();
        when(bases.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(r1, r2, second, first));

        assertTrue(service.anyRouteEnforced(game));
        assertEquals(Map.of(r1.getId(), 1, r2.getId(), 2), service.sequenceNumbers(game), "the free stage has no numbers");
        // Exploring in any order is fine; the race must be run in order.
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, second.getId()));
        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.requirePreviousBases(game, team, r2.getId()));
        assertEquals(Map.of("nextRequiredBaseNumber", "1"), ex.getErrors());
        assertEquals(List.of(
                new com.prayer.pointfinder.dto.response.RouteStatusResponse(explore.getId(), false, null),
                new com.prayer.pointfinder.dto.response.RouteStatusResponse(race.getId(), true, 1)),
                service.routes(game, team));
        assertEquals(1, service.nextRequiredBaseNumber(game, team));
    }

    @Test void eachOrderedStageCountsFromOneAndGatesOnlyItself() {
        stagedGame();
        race.setIsActive(true);
        explore.setEnforceBaseOrder(true);
        Base r1 = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(1).stageId(race.getId()).build();
        when(bases.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(r1, second, first));
        when(checkIns.findByGameIdAndTeamId(game.getId(), team)).thenReturn(List.of(CheckIn.builder().base(first).build()));

        assertEquals(Map.of(r1.getId(), 1, first.getId(), 1, second.getId(), 2), service.sequenceNumbers(game));
        // Nothing of the explore route is needed before the race route's first base.
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, r1.getId()));
        assertEquals(List.of(
                new com.prayer.pointfinder.dto.response.RouteStatusResponse(explore.getId(), true, 2),
                new com.prayer.pointfinder.dto.response.RouteStatusResponse(race.getId(), true, 1)),
                service.routes(game, team));
        assertNull(service.nextRequiredBaseNumber(game, team), "two enforced routes: no single legacy number");
    }

    @Test void basesOutsideAnyStageKeepTheGameLevelDefaultRoute() {
        stagedGame();
        game.setEnforceBaseOrder(true);
        Base loose = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(3).build();
        when(bases.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(loose, second, first));

        assertEquals(Map.of(loose.getId(), 1), service.sequenceNumbers(game));
        assertEquals(2, service.routes(game, team).size(), "the open explore stage and the default route; the closed race stage is not announced");
        assertEquals(new com.prayer.pointfinder.dto.response.RouteStatusResponse(null, true, 1), service.routes(game, team).get(1));
    }

    @Test void anUnlockFromALaterStageIsRejectedAndFromAnEarlierOneAccepted() {
        stagedGame();
        race.setEnforceBaseOrder(true);
        explore.setEnforceBaseOrder(true);
        Base r1 = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(1).stageId(race.getId()).build();
        Challenge unlock = Challenge.builder().id(UUID.randomUUID()).unlocksBases(new HashSet<>(Set.of(first))).build();
        first.setHidden(true);
        r1.setFixedChallenge(unlock); // a race base (later stage) would unlock an explore base: never reachable in time
        assertEquals(ErrorCode.BASE_ORDER_DEPENDENCY_CONFLICT, assertThrows(BadRequestException.class, () ->
                BaseOrderService.validateDependencies(game, List.of(first, second, r1), List.of(unlock), List.of(explore, race), List.of())).getErrorCode());
        r1.setFixedChallenge(null);
        r1.setHidden(true);
        unlock.setUnlocksBases(new HashSet<>(Set.of(r1)));
        first.setFixedChallenge(unlock); // an explore base unlocks a race base: fine
        assertDoesNotThrow(() -> BaseOrderService.validateDependencies(game, List.of(first, second, r1), List.of(unlock), List.of(explore, race), List.of()));
    }

    @Test void theLegacyPairDescribesOnlyASingleEnforcedRoute() {
        stagedGame();
        explore.setEnforceBaseOrder(true);
        race.setIsActive(true);
        Base r1 = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(1).stageId(race.getId()).build();
        when(bases.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(r1, second, first));

        BaseOrderService.RouteView two = service.view(game, team);
        assertTrue(two.anyEnforced());
        assertEquals(2, two.routes().stream().filter(com.prayer.pointfinder.dto.response.RouteStatusResponse::enforceBaseOrder).count());
        assertFalse(two.legacyEnforced(), "an old client would compare numbers across routes; tell it the game is unrestricted");
        assertNull(two.legacyNextRequiredBaseNumber());

        race.setEnforceBaseOrder(false);
        BaseOrderService.RouteView one = service.view(game, team);
        assertTrue(one.legacyEnforced());
        assertEquals(1, one.legacyNextRequiredBaseNumber());
    }

    @Test void inactiveStagesAreNotReportedAsRoutes() {
        stagedGame();
        Base r1 = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(1).stageId(race.getId()).build();
        when(bases.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(r1, second, first));
        List<com.prayer.pointfinder.dto.response.RouteStatusResponse> routes = service.routes(game, team);
        assertEquals(1, routes.size(), "the closed race stage is not announced");
        assertEquals(explore.getId(), routes.get(0).stageId());
        assertEquals(Map.of(r1.getId(), 1), service.sequenceNumbers(game), "its bases are still numbered for when it opens");
    }

    @Test void anUnlockFromAnotherRouteIsNeverBlockedByPosition() {
        stagedGame();
        race.setEnforceBaseOrder(true);
        Base r1 = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(1).stageId(race.getId()).hidden(true).build();
        Challenge unlock = Challenge.builder().id(UUID.randomUUID()).unlocksBases(new HashSet<>(Set.of(r1))).build();
        second.setFixedChallenge(unlock); // an explore base unlocks the first race base
        assertDoesNotThrow(() -> BaseOrderService.validateDependencies(game, List.of(first, second, r1), List.of(unlock), List.of(explore, race), List.of()));
    }
}
