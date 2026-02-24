package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.export.*;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Handles game export and import logic.
 * Extracted from GameService to reduce complexity.
 */
@Service
@RequiredArgsConstructor
public class GameImportExportService {

    private final GameRepository gameRepository;
    private final UserRepository userRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final TeamRepository teamRepository;
    private final AssignmentRepository assignmentRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public GameExportDto exportGame(UUID gameId) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        List<Base> bases = baseRepository.findByGameId(gameId);
        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Assignment> assignments = assignmentRepository.findByGameId(gameId);

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

        GameMetadataDto gameMetadata = GameMetadataDto.builder()
                .name(game.getName())
                .description(game.getDescription())
                .uniformAssignment(game.getUniformAssignment())
                .build();

        List<BaseExportDto> baseExportDtos = bases.stream()
                .map(base -> BaseExportDto.builder()
                        .tempId(baseIdMap.get(base.getId()))
                        .name(base.getName())
                        .description(base.getDescription())
                        .lat(base.getLat())
                        .lng(base.getLng())
                        .hidden(base.getHidden())
                        .requirePresenceToSubmit(base.getRequirePresenceToSubmit())
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
                        .completionContent(challenge.getCompletionContent())
                        .answerType(challenge.getAnswerType())
                        .autoValidate(challenge.getAutoValidate())
                        .correctAnswer(challenge.getCorrectAnswer())
                        .points(challenge.getPoints())
                        .locationBound(challenge.getLocationBound())
                        .unlocksBaseTempId(challenge.getUnlocksBase() != null ?
                                baseIdMap.get(challenge.getUnlocksBase().getId()) : null)
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
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        GameExportDto data = request.getGameData();

        validateImportData(data);
        validateImportDates(request);

        Map<String, UUID> baseIdMap = new HashMap<>();
        Map<String, UUID> challengeIdMap = new HashMap<>();
        Map<String, UUID> teamIdMap = new HashMap<>();

        Game newGame = Game.builder()
                .name(data.getGame().getName())
                .description(data.getGame().getDescription() != null ? data.getGame().getDescription() : "")
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .uniformAssignment(data.getGame().getUniformAssignment() != null ? data.getGame().getUniformAssignment() : false)
                .status(GameStatus.setup)
                .createdBy(currentUser)
                .build();
        newGame.getOperators().add(currentUser);
        newGame = gameRepository.save(newGame);

        for (ChallengeExportDto chDto : data.getChallenges()) {
            Challenge challenge = Challenge.builder()
                    .game(newGame)
                    .title(chDto.getTitle())
                    .description(chDto.getDescription() != null ? chDto.getDescription() : "")
                    .content(chDto.getContent() != null ? chDto.getContent() : "")
                    .completionContent(chDto.getCompletionContent() != null ? chDto.getCompletionContent() : "")
                    .answerType(chDto.getAnswerType())
                    .autoValidate(chDto.getAutoValidate() != null ? chDto.getAutoValidate() : false)
                    .correctAnswer(chDto.getCorrectAnswer())
                    .points(chDto.getPoints())
                    .locationBound(chDto.getLocationBound() != null ? chDto.getLocationBound() : false)
                    .build();
            challenge = challengeRepository.save(challenge);
            challengeIdMap.put(chDto.getTempId(), challenge.getId());
        }

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
                    .description(baseDto.getDescription() != null ? baseDto.getDescription() : "")
                    .lat(baseDto.getLat())
                    .lng(baseDto.getLng())
                    .nfcLinked(false)
                    .hidden(baseDto.getHidden() != null ? baseDto.getHidden() : false)
                    .requirePresenceToSubmit(baseDto.getRequirePresenceToSubmit() != null
                            ? baseDto.getRequirePresenceToSubmit() : false)
                    .fixedChallenge(fixedChallenge)
                    .build();
            base = baseRepository.save(base);
            baseIdMap.put(baseDto.getTempId(), base.getId());
        }

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

        Map<String, List<String>> fixedBaseTempIdsByChallengeTempId =
                buildFixedBaseTempIdsByChallenge(data.getBases());

        // Restore unlocks_base relationships (challenges already created, bases now exist)
        for (ChallengeExportDto chDto : data.getChallenges()) {
            if (chDto.getUnlocksBaseTempId() != null) {
                UUID challengeId = challengeIdMap.get(chDto.getTempId());
                UUID targetBaseId = baseIdMap.get(chDto.getUnlocksBaseTempId());
                if (challengeId == null || targetBaseId == null) {
                    throw new BadRequestException("Invalid unlock relationship for challenge: " + chDto.getTempId());
                }

                Challenge challenge = challengeRepository.findById(challengeId).orElseThrow();
                Base targetBase = baseRepository.findById(targetBaseId).orElseThrow();

                if (!Boolean.TRUE.equals(challenge.getLocationBound())) {
                    throw new BadRequestException("Challenge " + chDto.getTempId()
                            + " must be location-bound to unlock a base");
                }
                List<String> sourceBaseTempIds = fixedBaseTempIdsByChallengeTempId
                        .getOrDefault(chDto.getTempId(), List.of());
                if (sourceBaseTempIds.isEmpty()) {
                    throw new BadRequestException("Challenge " + chDto.getTempId()
                            + " must be fixed to a base to unlock another base");
                }
                if (sourceBaseTempIds.contains(chDto.getUnlocksBaseTempId())) {
                    throw new BadRequestException("Challenge " + chDto.getTempId()
                            + " cannot unlock its own fixed base");
                }
                if (!Boolean.TRUE.equals(targetBase.getHidden())) {
                    throw new BadRequestException("Unlock target base must be hidden for challenge: " + chDto.getTempId());
                }

                challengeRepository.findByUnlocksBaseId(targetBaseId).ifPresent(existing -> {
                    if (!existing.getId().equals(challenge.getId())) {
                        throw new BadRequestException("Multiple challenges cannot unlock the same base: "
                                + chDto.getUnlocksBaseTempId());
                    }
                });

                challenge.setUnlocksBase(targetBase);
                challengeRepository.save(challenge);
            }
        }

        for (AssignmentExportDto assignDto : data.getAssignments()) {
            UUID baseId = baseIdMap.get(assignDto.getBaseTempId());
            UUID challengeId = challengeIdMap.get(assignDto.getChallengeTempId());
            UUID teamId = assignDto.getTeamTempId() != null ?
                    teamIdMap.get(assignDto.getTeamTempId()) : null;

            Base base = baseRepository.findById(baseId).orElseThrow();
            Challenge challenge = challengeRepository.findById(challengeId).orElseThrow();
            Team team = teamId != null ? teamRepository.findById(teamId).orElse(null) : null;

            assignmentRepository.save(Assignment.builder()
                    .game(newGame).base(base).challenge(challenge).team(team).build());
        }

        return toResponse(newGame);
    }

    // ── Validation helpers ───────────────────────────────────────────

    private void validateImportData(GameExportDto data) {
        if (!"1.0".equals(data.getExportVersion())) {
            throw new BadRequestException("Unsupported export version: " + data.getExportVersion());
        }
        if (data.getGame() == null) throw new BadRequestException("Game metadata is required");
        if (data.getBases() == null) throw new BadRequestException("Bases data is required");
        if (data.getChallenges() == null) throw new BadRequestException("Challenges data is required");
        if (data.getAssignments() == null) throw new BadRequestException("Assignments data is required");
        if (data.getGame().getName() == null || data.getGame().getName().isBlank()) {
            throw new BadRequestException("Game name is required");
        }

        Set<String> baseTempIds = new HashSet<>();
        Set<String> challengeTempIds = new HashSet<>();
        Set<String> teamTempIds = new HashSet<>();

        for (int i = 0; i < data.getBases().size(); i++) {
            BaseExportDto base = data.getBases().get(i);
            String fp = "bases[" + i + "]";
            requireNotBlank(base.getTempId(), fp + ".tempId");
            requireNotBlank(base.getName(), fp + ".name");
            requireNotNull(base.getLat(), fp + ".lat");
            requireNotNull(base.getLng(), fp + ".lng");
            if (base.getFixedChallengeTempId() != null && base.getFixedChallengeTempId().isBlank()) {
                throw new BadRequestException(fp + ".fixedChallengeTempId cannot be blank");
            }
            if (!baseTempIds.add(base.getTempId())) {
                throw new BadRequestException("Duplicate base tempId: " + base.getTempId());
            }
        }

        for (int i = 0; i < data.getChallenges().size(); i++) {
            ChallengeExportDto ch = data.getChallenges().get(i);
            String fp = "challenges[" + i + "]";
            requireNotBlank(ch.getTempId(), fp + ".tempId");
            requireNotBlank(ch.getTitle(), fp + ".title");
            requireNotNull(ch.getAnswerType(), fp + ".answerType");
            requireNotNull(ch.getPoints(), fp + ".points");
            if (ch.getPoints() < 0) {
                throw new BadRequestException(fp + ".points must be greater than or equal to 0");
            }
            if (ch.getUnlocksBaseTempId() != null && ch.getUnlocksBaseTempId().isBlank()) {
                throw new BadRequestException(fp + ".unlocksBaseTempId cannot be blank");
            }
            if (!challengeTempIds.add(ch.getTempId())) {
                throw new BadRequestException("Duplicate challenge tempId: " + ch.getTempId());
            }
        }

        if (data.getTeams() != null) {
            for (int i = 0; i < data.getTeams().size(); i++) {
                TeamExportDto team = data.getTeams().get(i);
                String fp = "teams[" + i + "]";
                requireNotBlank(team.getTempId(), fp + ".tempId");
                requireNotBlank(team.getName(), fp + ".name");
                requireNotBlank(team.getColor(), fp + ".color");
                if (team.getColor().length() > 7) {
                    throw new BadRequestException(fp + ".color must be at most 7 characters");
                }
                if (!teamTempIds.add(team.getTempId())) {
                    throw new BadRequestException("Duplicate team tempId: " + team.getTempId());
                }
            }
        }

        for (int i = 0; i < data.getAssignments().size(); i++) {
            AssignmentExportDto a = data.getAssignments().get(i);
            String fp = "assignments[" + i + "]";
            requireNotBlank(a.getBaseTempId(), fp + ".baseTempId");
            requireNotBlank(a.getChallengeTempId(), fp + ".challengeTempId");
            if (a.getTeamTempId() != null && a.getTeamTempId().isBlank()) {
                throw new BadRequestException(fp + ".teamTempId cannot be blank");
            }
            if (!baseTempIds.contains(a.getBaseTempId())) {
                throw new BadRequestException("Assignment references non-existent base: " + a.getBaseTempId());
            }
            if (!challengeTempIds.contains(a.getChallengeTempId())) {
                throw new BadRequestException("Assignment references non-existent challenge: " + a.getChallengeTempId());
            }
            if (a.getTeamTempId() != null && !teamTempIds.contains(a.getTeamTempId())) {
                throw new BadRequestException("Assignment references non-existent team: " + a.getTeamTempId());
            }
        }

        validateImportAssignmentConflicts(data.getAssignments());

        for (int i = 0; i < data.getBases().size(); i++) {
            BaseExportDto base = data.getBases().get(i);
            if (base.getFixedChallengeTempId() != null &&
                    !challengeTempIds.contains(base.getFixedChallengeTempId())) {
                throw new BadRequestException("Base at index " + i
                        + " references non-existent fixed challenge: " + base.getFixedChallengeTempId());
            }
        }

        for (int i = 0; i < data.getChallenges().size(); i++) {
            ChallengeExportDto ch = data.getChallenges().get(i);
            if (ch.getUnlocksBaseTempId() != null &&
                    !baseTempIds.contains(ch.getUnlocksBaseTempId())) {
                throw new BadRequestException("Challenge at index " + i
                        + " references non-existent unlock base: " + ch.getUnlocksBaseTempId());
            }
        }

        Map<String, BaseExportDto> baseByTempId = data.getBases().stream()
                .collect(Collectors.toMap(BaseExportDto::getTempId, b -> b));
        Map<String, List<String>> fixedBaseTempIdsByChallengeTempId =
                buildFixedBaseTempIdsByChallenge(data.getBases());
        Set<String> seenUnlockTargetBaseTempIds = new HashSet<>();

        for (int i = 0; i < data.getChallenges().size(); i++) {
            ChallengeExportDto challenge = data.getChallenges().get(i);
            String unlocksBaseTempId = challenge.getUnlocksBaseTempId();
            if (unlocksBaseTempId == null) {
                continue;
            }

            if (!Boolean.TRUE.equals(challenge.getLocationBound())) {
                throw new BadRequestException("Challenge at index " + i
                        + " must be locationBound=true when unlocksBaseTempId is set");
            }

            List<String> sourceBaseTempIds = fixedBaseTempIdsByChallengeTempId
                    .getOrDefault(challenge.getTempId(), List.of());
            if (sourceBaseTempIds.isEmpty()) {
                throw new BadRequestException("Challenge at index " + i
                        + " must be fixed to a base when unlocksBaseTempId is set");
            }
            if (sourceBaseTempIds.contains(unlocksBaseTempId)) {
                throw new BadRequestException("Challenge at index " + i
                        + " cannot unlock its own fixed base: " + unlocksBaseTempId);
            }

            BaseExportDto targetBase = baseByTempId.get(unlocksBaseTempId);
            if (targetBase == null || !Boolean.TRUE.equals(targetBase.getHidden())) {
                throw new BadRequestException("Challenge at index " + i
                        + " must reference a hidden base as unlock target: " + unlocksBaseTempId);
            }
            if (!seenUnlockTargetBaseTempIds.add(unlocksBaseTempId)) {
                throw new BadRequestException("Multiple challenges cannot unlock the same base: " + unlocksBaseTempId);
            }
        }
    }

    private void validateImportDates(GameImportRequest request) {
        if (request.getStartDate() != null && request.getEndDate() != null
                && request.getEndDate().isBefore(request.getStartDate())) {
            throw new BadRequestException("End date must be after start date");
        }
    }

    private void validateImportAssignmentConflicts(List<AssignmentExportDto> assignments) {
        Set<String> seenTeamSpecific = new HashSet<>();
        Set<String> basesWithAllTeams = new HashSet<>();
        Set<String> basesWithTeamSpecific = new HashSet<>();

        for (AssignmentExportDto assignment : assignments) {
            String baseTempId = assignment.getBaseTempId();
            String teamTempId = assignment.getTeamTempId();

            if (teamTempId == null) {
                if (basesWithTeamSpecific.contains(baseTempId)) {
                    throw new ConflictException("Cannot mix 'All Teams' and team-specific assignments for base: " + baseTempId);
                }
                if (!basesWithAllTeams.add(baseTempId)) {
                    throw new ConflictException("Duplicate 'All Teams' assignment for base: " + baseTempId);
                }
                continue;
            }

            if (basesWithAllTeams.contains(baseTempId)) {
                throw new ConflictException("Cannot mix team-specific and 'All Teams' assignments for base: " + baseTempId);
            }

            String key = baseTempId + ":" + teamTempId;
            if (!seenTeamSpecific.add(key)) {
                throw new ConflictException("Duplicate assignment for base/team: " + key);
            }
            basesWithTeamSpecific.add(baseTempId);
        }
    }

    private Map<String, List<String>> buildFixedBaseTempIdsByChallenge(List<BaseExportDto> baseDtos) {
        Map<String, List<String>> fixedBaseTempIdsByChallengeTempId = new HashMap<>();
        for (BaseExportDto baseDto : baseDtos) {
            if (baseDto.getFixedChallengeTempId() != null) {
                fixedBaseTempIdsByChallengeTempId
                        .computeIfAbsent(baseDto.getFixedChallengeTempId(), ignored -> new ArrayList<>())
                        .add(baseDto.getTempId());
            }
        }
        return fixedBaseTempIdsByChallengeTempId;
    }

    // ── Utility helpers ──────────────────────────────────────────────

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

    private void requireNotBlank(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException(fieldName + " is required");
        }
    }

    private void requireNotNull(Object value, String fieldName) {
        if (value == null) {
            throw new BadRequestException(fieldName + " is required");
        }
    }
}

