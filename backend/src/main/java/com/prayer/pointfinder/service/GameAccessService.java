package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GameAccessService {

    private final GameRepository gameRepository;

    @Transactional(readOnly = true)
    public Game getAccessibleGame(UUID gameId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        ensureCurrentUserCanAccessGame(game);
        return game;
    }

    @Transactional(readOnly = true)
    public void ensureCurrentUserCanAccessGame(UUID gameId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        ensureCurrentUserCanAccessGame(game);
    }

    public void ensureCurrentUserCanAccessGame(Game game) {
        User currentUser = SecurityUtils.getCurrentUser();
        if (currentUser.getRole() == UserRole.admin) {
            return;
        }

        UUID currentUserId = currentUser.getId();
        if (game.getCreatedBy() != null && game.getCreatedBy().getId().equals(currentUserId)) {
            return;
        }

        boolean isOperator = gameRepository.isUserOperator(game.getId(), currentUserId);
        if (!isOperator) {
            throw new ForbiddenException("You do not have access to this game");
        }
    }

    public void ensureCurrentUserIsAdmin() {
        User currentUser = SecurityUtils.getCurrentUser();
        if (currentUser.getRole() != UserRole.admin) {
            throw new ForbiddenException("Only administrators can perform this action");
        }
    }

    public void ensurePlayerBelongsToGame(Player player, UUID gameId) {
        UUID playerGameId = player.getTeam().getGame().getId();
        if (!playerGameId.equals(gameId)) {
            throw new ForbiddenException("Player does not belong to this game");
        }
    }

    /**
     * Generic guard: ensures the given entity's game ID matches the expected game ID.
     *
     * @param entityName   human-readable entity name for the error message (e.g. "Base", "Challenge")
     * @param entityGameId the game ID from the entity being checked
     * @param expectedGameId the game ID the entity should belong to
     * @throws BadRequestException if the IDs do not match
     */
    public void ensureBelongsToGame(String entityName, UUID entityGameId, UUID expectedGameId) {
        if (!entityGameId.equals(expectedGameId)) {
            throw new BadRequestException(entityName + " does not belong to this game");
        }
    }
}
