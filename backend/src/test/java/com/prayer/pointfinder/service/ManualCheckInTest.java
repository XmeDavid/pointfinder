package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for operator manual check-in via TeamService#operatorCheckIn.
 * Uses Testcontainers PostgreSQL via IntegrationTestBase.
 */
class ManualCheckInTest extends IntegrationTestBase {

    @Autowired
    private TeamService teamService;

    // ── Successful manual check-in ────────────────────────────────────────────

    @Test
    void manualCheckIn_successCreatesEntry() {
        User operator = createOperator("op@checkin.com", "password");
        Game game = createGame(operator, "Scout Game", GameStatus.live);
        Team team = createTeam(game, "Eagles", "EGL001");
        Base base = createBase(game, "Base Alpha");

        // Authenticate as operator
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        operator, null, java.util.List.of());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        CheckInResponse response = teamService.operatorCheckIn(game.getId(), team.getId(), base.getId());

        assertNotNull(response);
        assertEquals(base.getId(), response.getBaseId());
        assertEquals(base.getName(), response.getBaseName());
        assertNotNull(response.getCheckedInAt());

        // Verify persisted
        assertTrue(checkInRepository.existsByTeamIdAndBaseId(team.getId(), base.getId()));

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    // ── Idempotency: second call returns existing ─────────────────────────────

    @Test
    void manualCheckIn_idempotentReturnsExisting() {
        User operator = createOperator("op2@checkin.com", "password");
        Game game = createGame(operator, "Scout Game 2", GameStatus.live);
        Team team = createTeam(game, "Hawks", "HWK001");
        Base base = createBase(game, "Base Beta");

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        operator, null, java.util.List.of());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        CheckInResponse first = teamService.operatorCheckIn(game.getId(), team.getId(), base.getId());
        CheckInResponse second = teamService.operatorCheckIn(game.getId(), team.getId(), base.getId());

        assertEquals(first.getCheckInId(), second.getCheckInId());
        assertEquals(1, checkInRepository.findByTeamId(team.getId()).size());

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    // ── Non-live game is rejected ─────────────────────────────────────────────

    @Test
    void manualCheckIn_nonLiveGameRejected() {
        User operator = createOperator("op3@checkin.com", "password");
        Game game = createGame(operator, "Setup Game", GameStatus.setup);
        Team team = createTeam(game, "Wolves", "WLF001");
        Base base = createBase(game, "Base Gamma");

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        operator, null, java.util.List.of());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        assertThrows(BadRequestException.class,
                () -> teamService.operatorCheckIn(game.getId(), team.getId(), base.getId()));

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    // ── Team from wrong game is rejected ─────────────────────────────────────

    @Test
    void manualCheckIn_teamFromWrongGameRejected() {
        User operator = createOperator("op4@checkin.com", "password");
        Game game1 = createGame(operator, "Game One", GameStatus.live);
        Game game2 = createGame(operator, "Game Two", GameStatus.live);
        Team teamInGame2 = createTeam(game2, "Falcons", "FLC001");
        Base baseInGame1 = createBase(game1, "Base Delta");

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        operator, null, java.util.List.of());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        assertThrows(BadRequestException.class,
                () -> teamService.operatorCheckIn(game1.getId(), teamInGame2.getId(), baseInGame1.getId()));

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    // ── Base from wrong game is rejected ─────────────────────────────────────

    @Test
    void manualCheckIn_baseFromWrongGameRejected() {
        User operator = createOperator("op5@checkin.com", "password");
        Game game1 = createGame(operator, "Game A", GameStatus.live);
        Game game2 = createGame(operator, "Game B", GameStatus.live);
        Team teamInGame1 = createTeam(game1, "Ravens", "RVN001");
        Base baseInGame2 = createBase(game2, "Base Epsilon");

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        operator, null, java.util.List.of());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        assertThrows(BadRequestException.class,
                () -> teamService.operatorCheckIn(game1.getId(), teamInGame1.getId(), baseInGame2.getId()));

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    // ── Non-operator is rejected ──────────────────────────────────────────────

    @Test
    void manualCheckIn_nonOperatorRejected() {
        User owner = createOperator("owner@checkin.com", "password");
        User stranger = createOperator("stranger@checkin.com", "password");
        Game game = createGame(owner, "Private Game", GameStatus.live);
        Team team = createTeam(game, "Owls", "OWL001");
        Base base = createBase(game, "Base Zeta");

        // Authenticate as stranger who has no access to this game
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        stranger, null, java.util.List.of());
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        assertThrows(ForbiddenException.class,
                () -> teamService.operatorCheckIn(game.getId(), team.getId(), base.getId()));

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
}
