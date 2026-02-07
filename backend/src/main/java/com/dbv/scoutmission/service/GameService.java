package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateGameRequest;
import com.dbv.scoutmission.dto.request.UpdateGameRequest;
import com.dbv.scoutmission.dto.response.GameResponse;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.GameStatus;
import com.dbv.scoutmission.entity.User;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.GameRepository;
import com.dbv.scoutmission.repository.UserRepository;
import com.dbv.scoutmission.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GameService {

    private final GameRepository gameRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<GameResponse> getAllGames() {
        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction to get fresh entity with proper session
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        List<Game> games;
        if (currentUser.getRole().name().equals("admin")) {
            games = gameRepository.findAll();
        } else {
            games = gameRepository.findByOperatorOrCreator(currentUser.getId());
        }
        return games.stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public GameResponse getGame(UUID id) {
        Game game = gameRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Game", id));
        return toResponse(game);
    }

    @Transactional
    public GameResponse createGame(CreateGameRequest request) {
        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction to get fresh entity with proper session
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        Game game = Game.builder()
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .status(GameStatus.draft)
                .createdBy(currentUser)
                .build();
        game.getOperators().add(currentUser);

        game = gameRepository.save(game);
        return toResponse(game);
    }

    @Transactional
    public GameResponse updateGame(UUID id, UpdateGameRequest request) {
        Game game = gameRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Game", id));

        game.setName(request.getName());
        game.setDescription(request.getDescription() != null ? request.getDescription() : "");
        game.setStartDate(request.getStartDate());
        game.setEndDate(request.getEndDate());

        game = gameRepository.save(game);
        return toResponse(game);
    }

    @Transactional
    public void deleteGame(UUID id) {
        if (!gameRepository.existsById(id)) {
            throw new ResourceNotFoundException("Game", id);
        }
        gameRepository.deleteById(id);
    }

    @Transactional
    public GameResponse updateStatus(UUID id, String newStatus) {
        Game game = gameRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Game", id));

        GameStatus target;
        try {
            target = GameStatus.valueOf(newStatus);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + newStatus);
        }

        validateStatusTransition(game.getStatus(), target);
        game.setStatus(target);
        game = gameRepository.save(game);
        return toResponse(game);
    }

    @Transactional
    public void addOperator(UUID gameId, UUID userId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        game.getOperators().add(user);
        gameRepository.save(game);
    }

    @Transactional
    public void removeOperator(UUID gameId, UUID userId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        if (game.getCreatedBy().getId().equals(userId)) {
            throw new BadRequestException("Cannot remove the game creator as operator");
        }
        game.getOperators().removeIf(u -> u.getId().equals(userId));
        gameRepository.save(game);
    }

    private void validateStatusTransition(GameStatus current, GameStatus target) {
        boolean valid = switch (current) {
            case draft -> target == GameStatus.setup;
            case setup -> target == GameStatus.live;
            case live -> target == GameStatus.ended;
            case ended -> false;
        };
        if (!valid) {
            throw new BadRequestException("Cannot transition from " + current + " to " + target);
        }
    }

    private GameResponse toResponse(Game game) {
        List<UUID> operatorIds = game.getOperators().stream()
                .map(User::getId)
                .collect(Collectors.toList());

        return GameResponse.builder()
                .id(game.getId())
                .name(game.getName())
                .description(game.getDescription())
                .startDate(game.getStartDate())
                .endDate(game.getEndDate())
                .status(game.getStatus().name())
                .createdBy(game.getCreatedBy().getId())
                .operatorIds(operatorIds)
                .build();
    }
}
