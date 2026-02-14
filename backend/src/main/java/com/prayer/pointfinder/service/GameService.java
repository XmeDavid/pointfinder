package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.request.CreateGameRequest;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Core game lifecycle service: CRUD, status transitions, operator management.
 * Import/export logic is delegated to {@link GameImportExportService}.
 * Challenge assignment logic is delegated to {@link ChallengeAssignmentService}.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class GameService {

    private final GameRepository gameRepository;
    private final UserRepository userRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final TeamRepository teamRepository;
    private final AssignmentRepository assignmentRepository;
    private final CheckInRepository checkInRepository;
    private final SubmissionRepository submissionRepository;
    private final TeamLocationRepository teamLocationRepository;
    private final ActivityEventRepository activityEventRepository;
    private final GameAccessService gameAccessService;
    private final FileStorageService fileStorageService;
    private final GameEventBroadcaster eventBroadcaster;
    private final ChallengeAssignmentService challengeAssignmentService;
    private final GameImportExportService gameImportExportService;

    // ── Read ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<GameResponse> getAllGames() {
        User currentUser = SecurityUtils.getCurrentUser();
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
        Game game = gameAccessService.getAccessibleGame(id);
        return toResponse(game);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getGameOperators(UUID gameId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        return game.getOperators().stream()
                .map(user -> UserResponse.builder()
                        .id(user.getId())
                        .email(user.getEmail())
                        .name(user.getName())
                        .role(user.getRole().name())
                        .createdAt(user.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    // ── Create / Update / Delete ─────────────────────────────────────

    @Transactional
    public GameResponse createGame(CreateGameRequest request) {
        User currentUser = SecurityUtils.getCurrentUser();
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        Game game = Game.builder()
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .uniformAssignment(request.getUniformAssignment() != null ? request.getUniformAssignment() : false)
                .status(GameStatus.setup)
                .createdBy(currentUser)
                .build();
        game.getOperators().add(currentUser);

        game = gameRepository.save(game);
        return toResponse(game);
    }

    @Transactional
    public GameResponse updateGame(UUID id, UpdateGameRequest request) {
        Game game = gameAccessService.getAccessibleGame(id);

        game.setName(request.getName());
        game.setDescription(request.getDescription() != null ? request.getDescription() : "");
        game.setStartDate(request.getStartDate());
        game.setEndDate(request.getEndDate());
        if (request.getUniformAssignment() != null) {
            game.setUniformAssignment(request.getUniformAssignment());
        }

        game = gameRepository.save(game);
        return toResponse(game);
    }

    @Transactional
    public void deleteGame(UUID id) {
        gameAccessService.ensureCurrentUserCanAccessGame(id);
        gameRepository.deleteById(id);
        try {
            fileStorageService.deleteGameFiles(id);
        } catch (Exception e) {
            log.warn("Failed to clean up files for deleted game {}: {}", id, e.getMessage());
        }
    }

    // ── Status transitions ───────────────────────────────────────────

    @Transactional
    public GameResponse updateStatus(UUID id, String newStatus, boolean resetProgress) {
        Game game = gameAccessService.getAccessibleGame(id);

        GameStatus target;
        try {
            target = GameStatus.valueOf(newStatus);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + newStatus);
        }

        validateStatusTransition(game.getStatus(), target);

        if (target == GameStatus.setup) {
            if (resetProgress) {
                submissionRepository.deleteByGameId(id);
                checkInRepository.deleteByGameId(id);
                teamLocationRepository.deleteByGameId(id);
                activityEventRepository.deleteByGameId(id);
            }
            assignmentRepository.deleteByGameId(id);
        }

        if (target == GameStatus.live) {
            validateGoLivePrerequisites(game);

            if (game.getStartDate() == null) {
                game.setStartDate(Instant.now());
            }
            challengeAssignmentService.autoAssignChallenges(game);
        }

        game.setStatus(target);
        game = gameRepository.save(game);
        eventBroadcaster.broadcastGameStatus(game.getId(), game.getStatus().name());
        return toResponse(game);
    }

    // ── Operator management ──────────────────────────────────────────

    @Transactional
    public void addOperator(UUID gameId, UUID userId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        game.getOperators().add(user);
        gameRepository.save(game);
    }

    @Transactional
    public void removeOperator(UUID gameId, UUID userId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        User currentUser = SecurityUtils.getCurrentUser();

        if (currentUser.getRole() != UserRole.admin
                && !game.getCreatedBy().getId().equals(currentUser.getId())) {
            throw new ForbiddenException("Only the game owner or an admin can remove operators");
        }

        if (game.getCreatedBy().getId().equals(userId)) {
            throw new BadRequestException("Cannot remove the game creator as operator");
        }
        game.getOperators().removeIf(u -> u.getId().equals(userId));
        gameRepository.save(game);
    }

    // ── Import / Export (delegated) ──────────────────────────────────

    @Transactional(readOnly = true)
    public GameExportDto exportGame(UUID gameId) {
        return gameImportExportService.exportGame(gameId);
    }

    @Transactional
    public GameResponse importGame(GameImportRequest request) {
        return gameImportExportService.importGame(request);
    }

    // ── Private helpers ──────────────────────────────────────────────

    private void validateStatusTransition(GameStatus current, GameStatus target) {
        if (current == target) {
            throw new BadRequestException("Game is already in " + current + " state");
        }
        boolean valid = switch (current) {
            case setup -> target == GameStatus.live;
            case live -> target == GameStatus.ended || target == GameStatus.setup;
            case ended -> target == GameStatus.live || target == GameStatus.setup;
        };
        if (!valid) {
            throw new BadRequestException("Cannot transition from " + current + " to " + target);
        }
    }

    private void validateGoLivePrerequisites(Game game) {
        if (game.getStartDate() != null && game.getStartDate().isAfter(Instant.now())) {
            throw new BadRequestException("Cannot go live before the scheduled start date");
        }

        long baseCount = baseRepository.countByGameId(game.getId());
        if (baseCount == 0) {
            throw new BadRequestException("Game must have at least one base before going live");
        }

        long nfcLinkedCount = baseRepository.countByGameIdAndNfcLinkedTrue(game.getId());
        if (nfcLinkedCount < baseCount) {
            throw new BadRequestException(
                    String.format("All bases must have NFC tags linked before going live. %d of %d bases linked",
                            nfcLinkedCount, baseCount));
        }

        long teamCount = teamRepository.countByGameId(game.getId());
        if (teamCount == 0) {
            throw new BadRequestException("Game must have at least one team before going live");
        }

        long challengeCount = challengeRepository.countByGameId(game.getId());
        if (baseCount > challengeCount) {
            throw new BadRequestException(
                    String.format("Not enough challenges for unique assignment. %d bases but only %d challenges. " +
                            "Each team must have a unique challenge at every base.", baseCount, challengeCount));
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
                .uniformAssignment(game.getUniformAssignment())
                .build();
    }
}
