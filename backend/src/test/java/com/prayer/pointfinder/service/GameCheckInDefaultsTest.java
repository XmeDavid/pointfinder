package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CreateGameRequest;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The game-level check-in default: what new bases inherit at creation.
 * Changing it later must not rewrite bases that already exist.
 */
class GameCheckInDefaultsTest extends IntegrationTestBase {

    @Autowired
    private GameService gameService;

    private void authenticate(String email) {
        User operator = createOperator(email, "password");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
    }

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void newGamesDefaultToNfcAtFifteenMetres() {
        authenticate("gamedefault-a@test.com");
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Plain Game");

        GameResponse created = gameService.createGame(request);

        assertEquals("NFC", created.defaultCheckInMethod());
        assertEquals(15, created.defaultCheckInRadiusM());
    }

    @Test
    void createAcceptsAnExplicitDefault() {
        authenticate("gamedefault-b@test.com");
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Trail Game");
        request.setDefaultCheckInMethod("location");
        request.setDefaultCheckInRadiusM(45);

        GameResponse created = gameService.createGame(request);

        assertEquals("LOCATION", created.defaultCheckInMethod());
        assertEquals(45, created.defaultCheckInRadiusM());
    }

    @Test
    void updateChangesTheDefaultAndClampsTheRadius() {
        authenticate("gamedefault-c@test.com");
        CreateGameRequest create = new CreateGameRequest();
        create.setName("Editable Game");
        GameResponse created = gameService.createGame(create);

        UpdateGameRequest update = new UpdateGameRequest();
        update.setName("Editable Game");
        update.setDefaultCheckInMethod("QR");
        update.setDefaultCheckInRadiusM(500);

        GameResponse updated = gameService.updateGame(created.id(), update);

        assertEquals("QR", updated.defaultCheckInMethod());
        assertEquals(200, updated.defaultCheckInRadiusM());
    }

    @Test
    void omittedFieldsOnUpdateLeaveTheDefaultAlone() {
        authenticate("gamedefault-d@test.com");
        CreateGameRequest create = new CreateGameRequest();
        create.setName("Stable Game");
        create.setDefaultCheckInMethod("LOCATION");
        create.setDefaultCheckInRadiusM(30);
        GameResponse created = gameService.createGame(create);

        UpdateGameRequest update = new UpdateGameRequest();
        update.setName("Stable Game renamed");

        GameResponse updated = gameService.updateGame(created.id(), update);

        assertEquals("LOCATION", updated.defaultCheckInMethod());
        assertEquals(30, updated.defaultCheckInRadiusM());
    }

    @Test
    void defaultsAreLockedOnceTheGameIsLive() {
        authenticate("gamedefault-f@test.com");
        CreateGameRequest create = new CreateGameRequest();
        create.setName("Live Game");
        create.setDefaultCheckInMethod("QR");
        GameResponse created = gameService.createGame(create);
        com.prayer.pointfinder.entity.Game game = gameRepository.findById(created.id()).orElseThrow();
        game.setStatus(com.prayer.pointfinder.entity.GameStatus.live);
        gameRepository.save(game);

        UpdateGameRequest update = new UpdateGameRequest();
        update.setName("Live Game");
        update.setDefaultCheckInMethod("LOCATION");
        assertThrows(BadRequestException.class, () -> gameService.updateGame(created.id(), update));

        // Re-sending the current value is not a change and stays allowed.
        UpdateGameRequest same = new UpdateGameRequest();
        same.setName("Live Game renamed");
        same.setDefaultCheckInMethod("QR");
        assertEquals("QR", gameService.updateGame(created.id(), same).defaultCheckInMethod());
    }

    @Test
    void anUnknownDefaultMethodIsRejected() {
        authenticate("gamedefault-e@test.com");
        CreateGameRequest request = new CreateGameRequest();
        request.setName("Bad Game");
        request.setDefaultCheckInMethod("beacon");

        assertThrows(BadRequestException.class, () -> gameService.createGame(request));
    }
}
