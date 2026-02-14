package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.HashSet;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GameAccessServiceTest {

    @Mock private GameRepository gameRepository;
    @InjectMocks private GameAccessService gameAccessService;

    private User admin;
    private User operator;
    private User otherOperator;

    @BeforeEach
    void setUp() {
        admin = User.builder().id(UUID.randomUUID()).email("admin@test.com").name("Admin").passwordHash("h").role(UserRole.admin).build();
        operator = User.builder().id(UUID.randomUUID()).email("op@test.com").name("Op").passwordHash("h").role(UserRole.operator).build();
        otherOperator = User.builder().id(UUID.randomUUID()).email("other@test.com").name("Other").passwordHash("h").role(UserRole.operator).build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticate(User user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null));
    }

    @Test
    void adminCanAccessAnyGame() {
        authenticate(admin);
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.setup)
                .createdBy(operator).operators(new HashSet<>()).build();

        when(gameRepository.findById(gameId)).thenReturn(Optional.of(game));

        Game result = gameAccessService.getAccessibleGame(gameId);
        assertEquals(gameId, result.getId());
    }

    @Test
    void creatorCanAccessOwnGame() {
        authenticate(operator);
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.setup)
                .createdBy(operator).operators(new HashSet<>()).build();

        when(gameRepository.findById(gameId)).thenReturn(Optional.of(game));

        Game result = gameAccessService.getAccessibleGame(gameId);
        assertEquals(gameId, result.getId());
    }

    @Test
    void assignedOperatorCanAccessGame() {
        authenticate(otherOperator);
        UUID gameId = UUID.randomUUID();
        HashSet<User> operators = new HashSet<>();
        operators.add(otherOperator);
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.setup)
                .createdBy(operator).operators(operators).build();

        when(gameRepository.findById(gameId)).thenReturn(Optional.of(game));

        Game result = gameAccessService.getAccessibleGame(gameId);
        assertEquals(gameId, result.getId());
    }

    @Test
    void unrelatedOperatorIsDenied() {
        authenticate(otherOperator);
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.setup)
                .createdBy(operator).operators(new HashSet<>()).build();

        when(gameRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThrows(ForbiddenException.class, () -> gameAccessService.getAccessibleGame(gameId));
    }

    @Test
    void nonexistentGameThrowsNotFound() {
        authenticate(admin);
        UUID gameId = UUID.randomUUID();
        when(gameRepository.findById(gameId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> gameAccessService.getAccessibleGame(gameId));
    }

    @Test
    void ensurePlayerBelongsToGameRejectsWrongGame() {
        UUID gameId = UUID.randomUUID();
        UUID otherGameId = UUID.randomUUID();

        Game game = Game.builder().id(otherGameId).name("Other").description("").status(GameStatus.live).build();
        Team team = Team.builder().id(UUID.randomUUID()).game(game).name("T").joinCode("ABC").color("#000").build();
        Player player = Player.builder().id(UUID.randomUUID()).team(team).deviceId("d").displayName("P").build();

        assertThrows(ForbiddenException.class, () -> gameAccessService.ensurePlayerBelongsToGame(player, gameId));
    }
}

