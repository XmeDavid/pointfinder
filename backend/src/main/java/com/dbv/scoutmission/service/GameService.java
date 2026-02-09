package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.export.*;
import com.dbv.scoutmission.dto.request.CreateGameRequest;
import com.dbv.scoutmission.dto.request.GameImportRequest;
import com.dbv.scoutmission.dto.request.UpdateGameRequest;
import com.dbv.scoutmission.dto.response.GameResponse;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.*;
import com.dbv.scoutmission.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
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
    public GameResponse updateStatus(UUID id, String newStatus, boolean resetProgress) {
        Game game = gameRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Game", id));

        GameStatus target;
        try {
            target = GameStatus.valueOf(newStatus);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + newStatus);
        }

        validateStatusTransition(game.getStatus(), target);

        // Handle backward transition to draft
        if (target == GameStatus.draft) {
            if (resetProgress) {
                // Erase all progress data (order matters for FK constraints)
                submissionRepository.deleteByGameId(id);
                checkInRepository.deleteByGameId(id);
                teamLocationRepository.deleteByGameId(id);
                activityEventRepository.deleteByGameId(id);
            }
            // Always clear auto-assigned challenge assignments when going back to draft
            assignmentRepository.deleteByGameId(id);
        }

        // Handle transition to live
        if (target == GameStatus.live) {
            // Validate start date
            if (game.getStartDate() != null && game.getStartDate().isAfter(Instant.now())) {
                throw new BadRequestException("Cannot go live before the scheduled start date");
            }

            // Validate game has bases
            long baseCount = baseRepository.countByGameId(game.getId());
            if (baseCount == 0) {
                throw new BadRequestException("Game must have at least one base before going live");
            }

            // Validate all bases have NFC tags linked
            long nfcLinkedCount = baseRepository.countByGameIdAndNfcLinkedTrue(game.getId());
            if (nfcLinkedCount < baseCount) {
                throw new BadRequestException(
                        String.format("All bases must have NFC tags linked before going live. %d of %d bases linked",
                                nfcLinkedCount, baseCount));
            }

            // Validate game has teams
            long teamCount = teamRepository.countByGameId(game.getId());
            if (teamCount == 0) {
                throw new BadRequestException("Game must have at least one team before going live");
            }

            // Validate enough challenges for unique assignment per base
            long challengeCount = challengeRepository.countByGameId(game.getId());
            if (baseCount > challengeCount) {
                throw new BadRequestException(
                        String.format("Not enough challenges for unique assignment. %d bases but only %d challenges. " +
                                "Each team must have a unique challenge at every base.", baseCount, challengeCount));
            }

            // Set start date to now if not set
            if (game.getStartDate() == null) {
                game.setStartDate(Instant.now());
            }
            // Auto-assign challenges
            autoAssignChallenges(game);
        }

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

    private void autoAssignChallenges(Game game) {
        UUID gameId = game.getId();
        List<Base> bases = baseRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Assignment> existingAssignments = assignmentRepository.findByGameId(gameId);

        if (teams.isEmpty() || challenges.isEmpty()) {
            return; // Nothing to auto-assign
        }

        // Collect IDs of challenges used as fixed challenges on any base
        Set<UUID> fixedChallengeIds = bases.stream()
                .filter(b -> b.getFixedChallenge() != null)
                .map(b -> b.getFixedChallenge().getId())
                .collect(Collectors.toSet());

        // Build pool: non-location-bound and not already used as fixed challenges
        List<Challenge> randomPool = challenges.stream()
                .filter(c -> !c.getLocationBound())
                .filter(c -> !fixedChallengeIds.contains(c.getId()))
                .collect(Collectors.toList());

        Random random = new Random();

        // Initialize per-team tracking of assigned challenge IDs
        Map<UUID, Set<UUID>> teamAssignedChallenges = new HashMap<>();
        for (Team team : teams) {
            Set<UUID> usedChallenges = new HashSet<>();

            // Track challenges from existing manual assignments for this team
            for (Assignment a : existingAssignments) {
                if (a.getTeam() != null && a.getTeam().getId().equals(team.getId())) {
                    usedChallenges.add(a.getChallenge().getId());
                } else if (a.getTeam() == null) {
                    // Global assignment applies to all teams
                    usedChallenges.add(a.getChallenge().getId());
                }
            }

            teamAssignedChallenges.put(team.getId(), usedChallenges);
        }

        for (Base base : bases) {
            // Check if this base already has assignments
            boolean hasAssignments = existingAssignments.stream()
                    .anyMatch(a -> a.getBase().getId().equals(base.getId()));

            if (base.getFixedChallenge() != null) {
                // Base has a fixed challenge - create per-team assignments if none exist
                if (!hasAssignments) {
                    for (Team team : teams) {
                        Assignment assignment = Assignment.builder()
                                .game(game)
                                .base(base)
                                .challenge(base.getFixedChallenge())
                                .team(team)
                                .build();
                        assignmentRepository.save(assignment);
                        teamAssignedChallenges.get(team.getId()).add(base.getFixedChallenge().getId());
                    }
                }
            } else if (!hasAssignments) {
                // No fixed challenge, no existing assignments - assign random challenges per team
                for (Team team : teams) {
                    Set<UUID> usedByTeam = teamAssignedChallenges.get(team.getId());

                    // Filter pool: exclude challenges already assigned to this team
                    List<Challenge> teamPool = randomPool.stream()
                            .filter(c -> !usedByTeam.contains(c.getId()))
                            .collect(Collectors.toList());

                    if (!teamPool.isEmpty()) {
                        int idx = random.nextInt(teamPool.size());
                        Challenge selected = teamPool.get(idx);

                        Assignment assignment = Assignment.builder()
                                .game(game)
                                .base(base)
                                .challenge(selected)
                                .team(team)
                                .build();
                        assignmentRepository.save(assignment);
                        usedByTeam.add(selected.getId());
                    }
                }
            }
        }
    }

    private void validateStatusTransition(GameStatus current, GameStatus target) {
        if (current == target) {
            throw new BadRequestException("Game is already in " + current + " state");
        }
        // Forward transitions: draft -> live -> ended
        // Backward transitions: live -> draft, ended -> live, ended -> draft
        boolean valid = switch (current) {
            case draft -> target == GameStatus.live;
            case live -> target == GameStatus.ended || target == GameStatus.draft;
            case ended -> target == GameStatus.live || target == GameStatus.draft;
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

    @Transactional(readOnly = true)
    public GameExportDto exportGame(UUID gameId) {
        User currentUser = SecurityUtils.getCurrentUser();
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        // Authorization check: user must be admin or game operator
        if (!currentUser.getRole().name().equals("admin") &&
            !game.getOperators().contains(currentUser)) {
            throw new BadRequestException("You must be a game operator to export this game");
        }

        // Fetch all related entities
        List<Base> bases = baseRepository.findByGameId(gameId);
        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Assignment> assignments = assignmentRepository.findByGameId(gameId);

        // Create ID mapping for export (UUID -> tempId)
        Map<UUID, String> baseIdMap = new HashMap<>();
        Map<UUID, String> challengeIdMap = new HashMap<>();
        Map<UUID, String> teamIdMap = new HashMap<>();

        for (int i = 0; i < bases.size(); i++) {
            baseIdMap.put(bases.get(i).getId(), "base_" + (i + 1));
        }
        for (int i = 0; i < challenges.size(); i++) {
            challengeIdMap.put(challenges.get(i).getId(), "challenge_" + (i + 1));
        }
        for (int i = 0; i < teams.size(); i++) {
            teamIdMap.put(teams.get(i).getId(), "team_" + (i + 1));
        }

        // Convert entities to export DTOs
        GameMetadataDto gameMetadata = GameMetadataDto.builder()
                .name(game.getName())
                .description(game.getDescription())
                .build();

        List<BaseExportDto> baseExportDtos = bases.stream()
                .map(base -> BaseExportDto.builder()
                        .tempId(baseIdMap.get(base.getId()))
                        .name(base.getName())
                        .description(base.getDescription())
                        .lat(base.getLat())
                        .lng(base.getLng())
                        .fixedChallengeTempId(base.getFixedChallenge() != null ?
                                challengeIdMap.get(base.getFixedChallenge().getId()) : null)
                        .build())
                .collect(Collectors.toList());

        List<ChallengeExportDto> challengeExportDtos = challenges.stream()
                .map(challenge -> ChallengeExportDto.builder()
                        .tempId(challengeIdMap.get(challenge.getId()))
                        .title(challenge.getTitle())
                        .description(challenge.getDescription())
                        .content(challenge.getContent())
                        .answerType(challenge.getAnswerType())
                        .autoValidate(challenge.getAutoValidate())
                        .correctAnswer(challenge.getCorrectAnswer())
                        .points(challenge.getPoints())
                        .locationBound(challenge.getLocationBound())
                        .build())
                .collect(Collectors.toList());

        List<TeamExportDto> teamExportDtos = teams.stream()
                .map(team -> TeamExportDto.builder()
                        .tempId(teamIdMap.get(team.getId()))
                        .name(team.getName())
                        .color(team.getColor())
                        .build())
                .collect(Collectors.toList());

        List<AssignmentExportDto> assignmentExportDtos = assignments.stream()
                .map(assignment -> AssignmentExportDto.builder()
                        .baseTempId(baseIdMap.get(assignment.getBase().getId()))
                        .challengeTempId(challengeIdMap.get(assignment.getChallenge().getId()))
                        .teamTempId(assignment.getTeam() != null ?
                                teamIdMap.get(assignment.getTeam().getId()) : null)
                        .build())
                .collect(Collectors.toList());

        return GameExportDto.builder()
                .exportVersion("1.0")
                .exportedAt(Instant.now())
                .game(gameMetadata)
                .bases(baseExportDtos)
                .challenges(challengeExportDtos)
                .assignments(assignmentExportDtos)
                .teams(teamExportDtos)
                .build();
    }

    @Transactional
    public GameResponse importGame(GameImportRequest request) {
        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        GameExportDto data = request.getGameData();

        // Validate export version
        if (!"1.0".equals(data.getExportVersion())) {
            throw new BadRequestException("Unsupported export version: " + data.getExportVersion());
        }

        // Validate basic structure
        if (data.getGame() == null) {
            throw new BadRequestException("Game metadata is required");
        }
        if (data.getBases() == null) {
            throw new BadRequestException("Bases data is required");
        }
        if (data.getChallenges() == null) {
            throw new BadRequestException("Challenges data is required");
        }
        if (data.getAssignments() == null) {
            throw new BadRequestException("Assignments data is required");
        }

        // Validate date range if both dates are provided
        if (request.getStartDate() != null && request.getEndDate() != null
                && request.getEndDate().isBefore(request.getStartDate())) {
            throw new BadRequestException("End date must be after start date");
        }

        // Validate game name
        if (data.getGame().getName() == null || data.getGame().getName().isBlank()) {
            throw new BadRequestException("Game name is required");
        }

        // Collect tempIds for validation
        Set<String> baseTempIds = new HashSet<>();
        Set<String> challengeTempIds = new HashSet<>();
        Set<String> teamTempIds = new HashSet<>();

        // Validate base tempIds
        for (BaseExportDto base : data.getBases()) {
            if (base.getTempId() == null) {
                throw new BadRequestException("Base missing tempId");
            }
            if (!baseTempIds.add(base.getTempId())) {
                throw new BadRequestException("Duplicate base tempId: " + base.getTempId());
            }
        }

        // Validate challenge tempIds
        for (ChallengeExportDto challenge : data.getChallenges()) {
            if (challenge.getTempId() == null) {
                throw new BadRequestException("Challenge missing tempId");
            }
            if (!challengeTempIds.add(challenge.getTempId())) {
                throw new BadRequestException("Duplicate challenge tempId: " + challenge.getTempId());
            }
        }

        // Validate team tempIds if teams are included
        if (data.getTeams() != null) {
            for (TeamExportDto team : data.getTeams()) {
                if (team.getTempId() == null) {
                    throw new BadRequestException("Team missing tempId");
                }
                if (!teamTempIds.add(team.getTempId())) {
                    throw new BadRequestException("Duplicate team tempId: " + team.getTempId());
                }
            }
        }

        // Validate assignment references
        for (AssignmentExportDto assignment : data.getAssignments()) {
            if (!baseTempIds.contains(assignment.getBaseTempId())) {
                throw new BadRequestException("Assignment references non-existent base: " + assignment.getBaseTempId());
            }
            if (!challengeTempIds.contains(assignment.getChallengeTempId())) {
                throw new BadRequestException("Assignment references non-existent challenge: " + assignment.getChallengeTempId());
            }
            if (assignment.getTeamTempId() != null && !teamTempIds.contains(assignment.getTeamTempId())) {
                throw new BadRequestException("Assignment references non-existent team: " + assignment.getTeamTempId());
            }
        }

        // Validate fixed challenge references
        for (BaseExportDto base : data.getBases()) {
            if (base.getFixedChallengeTempId() != null &&
                !challengeTempIds.contains(base.getFixedChallengeTempId())) {
                throw new BadRequestException("Base references non-existent fixed challenge: " + base.getFixedChallengeTempId());
            }
        }

        // Create ID mapping tables
        Map<String, UUID> baseIdMap = new HashMap<>();
        Map<String, UUID> challengeIdMap = new HashMap<>();
        Map<String, UUID> teamIdMap = new HashMap<>();

        // Create game
        Game newGame = Game.builder()
                .name(data.getGame().getName())
                .description(data.getGame().getDescription() != null ? data.getGame().getDescription() : "")
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .status(GameStatus.draft)
                .createdBy(currentUser)
                .build();
        newGame.getOperators().add(currentUser);
        newGame = gameRepository.save(newGame);

        // Create challenges first (no dependencies)
        for (ChallengeExportDto chDto : data.getChallenges()) {
            Challenge challenge = Challenge.builder()
                    .game(newGame)
                    .title(chDto.getTitle())
                    .description(chDto.getDescription())
                    .content(chDto.getContent())
                    .answerType(chDto.getAnswerType())
                    .autoValidate(chDto.getAutoValidate())
                    .correctAnswer(chDto.getCorrectAnswer())
                    .points(chDto.getPoints())
                    .locationBound(chDto.getLocationBound())
                    .build();
            challenge = challengeRepository.save(challenge);
            challengeIdMap.put(chDto.getTempId(), challenge.getId());
        }

        // Create bases (may reference challenges via fixedChallengeId)
        for (BaseExportDto baseDto : data.getBases()) {
            Challenge fixedChallenge = null;
            if (baseDto.getFixedChallengeTempId() != null) {
                UUID challengeId = challengeIdMap.get(baseDto.getFixedChallengeTempId());
                fixedChallenge = challengeRepository.findById(challengeId)
                        .orElseThrow(() -> new IllegalStateException("Challenge not found"));
            }

            Base base = Base.builder()
                    .game(newGame)
                    .name(baseDto.getName())
                    .description(baseDto.getDescription())
                    .lat(baseDto.getLat())
                    .lng(baseDto.getLng())
                    .nfcLinked(false)
                    .fixedChallenge(fixedChallenge)
                    .build();
            base = baseRepository.save(base);
            baseIdMap.put(baseDto.getTempId(), base.getId());
        }

        // Create teams if included
        if (data.getTeams() != null && !data.getTeams().isEmpty()) {
            for (TeamExportDto teamDto : data.getTeams()) {
                String joinCode = generateUniqueJoinCode();
                Team team = Team.builder()
                        .game(newGame)
                        .name(teamDto.getName())
                        .joinCode(joinCode)
                        .color(teamDto.getColor())
                        .build();
                team = teamRepository.save(team);
                teamIdMap.put(teamDto.getTempId(), team.getId());
            }
        }

        // Create assignments
        for (AssignmentExportDto assignDto : data.getAssignments()) {
            UUID baseId = baseIdMap.get(assignDto.getBaseTempId());
            UUID challengeId = challengeIdMap.get(assignDto.getChallengeTempId());
            UUID teamId = assignDto.getTeamTempId() != null ?
                    teamIdMap.get(assignDto.getTeamTempId()) : null;

            Base base = baseRepository.findById(baseId).orElseThrow();
            Challenge challenge = challengeRepository.findById(challengeId).orElseThrow();
            Team team = teamId != null ? teamRepository.findById(teamId).orElse(null) : null;

            Assignment assignment = Assignment.builder()
                    .game(newGame)
                    .base(base)
                    .challenge(challenge)
                    .team(team)
                    .build();
            assignmentRepository.save(assignment);
        }

        return toResponse(newGame);
    }

    private String generateUniqueJoinCode() {
        String code;
        int attempts = 0;
        do {
            code = generateRandomCode(6);
            attempts++;
            if (attempts > 100) {
                throw new IllegalStateException("Unable to generate unique join code");
            }
        } while (teamRepository.findByJoinCode(code).isPresent());
        return code;
    }

    private String generateRandomCode(int length) {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        Random random = new Random();
        return random.ints(length, 0, chars.length())
                .mapToObj(chars::charAt)
                .map(String::valueOf)
                .collect(Collectors.joining());
    }
}
