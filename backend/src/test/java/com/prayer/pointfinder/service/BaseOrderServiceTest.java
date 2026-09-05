package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.*;
import com.prayer.pointfinder.repository.*;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BaseOrderServiceTest {
    BaseRepository bases = mock(BaseRepository.class);
    CheckInRepository checkIns = mock(CheckInRepository.class);
    BaseOrderService service = new BaseOrderService(bases, checkIns);
    Game game = Game.builder().id(UUID.randomUUID()).enforceBaseOrder(true).build();
    Base first = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(8).hidden(true)
            .stageId(UUID.randomUUID()).build();
    Base second = Base.builder().id(UUID.randomUUID()).game(game).orderIndex(20).build();
    UUID team = UUID.randomUUID();

    @BeforeEach void route() {
        when(bases.findByGameIdOrderByOrderIndexAscCreatedAtAsc(game.getId())).thenReturn(List.of(second, first));
    }

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
        when(checkIns.findByGameIdAndTeamId(game.getId(), team)).thenReturn(List.of(
                CheckIn.builder().base(first).build()));
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, second.getId()));
        assertEquals(2, service.nextRequiredBaseNumber(game, team));
        assertEquals(1, service.nextRequiredBaseNumber(game, UUID.randomUUID()));
    }

    @Test void earliestGapSurvivesManualRescueOfALaterBase() {
        when(checkIns.findByGameIdAndTeamId(game.getId(), team)).thenReturn(List.of(
                CheckIn.builder().base(second).build()));
        assertEquals(1, service.nextRequiredBaseNumber(game, team));
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, first.getId()));
    }

    @Test void disabledModeDoesNotReadProgressOrExposeNumbers() {
        game.setEnforceBaseOrder(false);
        assertDoesNotThrow(() -> service.requirePreviousBases(game, team, second.getId()));
        assertNull(service.nextRequiredBaseNumber(game, team));
        assertTrue(service.sequenceNumbers(game).isEmpty());
        verifyNoInteractions(checkIns);
    }

    @Test void finishedRouteHasNoNextBase() {
        when(checkIns.findByGameIdAndTeamId(game.getId(), team)).thenReturn(List.of(
                CheckIn.builder().base(first).build(), CheckIn.builder().base(second).build()));
        assertNull(service.nextRequiredBaseNumber(game, team));
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

    @Test void inactiveStageCannotDependOnLaterBase() {
        Stage stage = Stage.builder().id(first.getStageId()).transitionType(TransitionType.trigger)
                .triggerBaseId(second.getId()).build();
        assertThrows(BadRequestException.class, () -> BaseOrderService.validateDependencies(game,
                List.of(first, second), List.of(), List.of(stage), List.of()));
        stage.setIsActive(true);
        assertDoesNotThrow(() -> BaseOrderService.validateDependencies(game,
                List.of(first, second), List.of(), List.of(stage), List.of()));
    }
}
