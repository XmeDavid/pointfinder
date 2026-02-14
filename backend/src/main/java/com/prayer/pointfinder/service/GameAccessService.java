package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
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

        boolean isOperator = game.getOperators().stream()
                .anyMatch(operator -> operator.getId().equals(currentUserId));
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
}
