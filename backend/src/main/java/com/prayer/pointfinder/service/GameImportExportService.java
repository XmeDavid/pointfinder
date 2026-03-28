package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.export.*;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.mapper.GameResponseMapper;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.util.CodeGenerator;
import com.prayer.pointfinder.util.HtmlSanitizer;
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
    private final TeamVariableRepository teamVariableRepository;
    private final ChallengeTeamVariableRepository challengeTeamVariableRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public GameExportDto exportGame(UUID gameId) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        List<Base> bases = baseRepository.findByGameId(gameId);
        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Assignment> assignments = assignmentRepository.findByGameId(gameId);
        List<TeamVariable> teamVariables = teamVariableRepository.findByGameId(gameId);
        List<ChallengeTeamVariable> challengeTeamVariables = challengeTeamVariableRepository.findByGameId(gameId);

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
                .tileSource(game.getTileSource())
                .build();

        List<BaseExportDto> baseExportDtos = bases.stream()
                .map(base -> BaseExportDto.builder()
                        .tempId(baseIdMap.get(base.getId()))
                        .name(base.getName())
                        .description(base.getDescription())
                        .lat(base.getLat())
                        .lng(base.getLng())
                        .hidden(base.getHidden())
                        .fixedChallengeTempId(base.getFixedChallenge() != null ?
                                challengeIdMap.get(base.getFixedChallenge().getId()) : null)
                        .build())
                .toList();

        List<ChallengeExportDto> challengeExportDtos = challenges.stream()
                .map(challenge -> {
                    List<String> unlocksTempIds = challenge.getUnlocksBases().stream()
                            .map(b -> baseIdMap.get(b.getId()))
                            .filter(Objects::nonNull)
                            .toList();
                    return ChallengeExportDto.builder()
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
                            .requirePresenceToSubmit(challenge.getRequirePresenceToSubmit())
                            .unlocksBaseTempIds(unlocksTempIds.isEmpty() ? null : unlocksTempIds)
                            .build();
                })
                .toList();

        List<TeamExportDto> teamExportDtos = teams.stream()
                .map(team -> TeamExportDto.builder()
                        .tempId(teamIdMap.get(team.getId()))
                        .name(team.getName())
                        .color(team.getColor())
                        .build())
                .toList();

        List<AssignmentExportDto> assignmentExportDtos = assignments.stream()
                .map(assignment -> AssignmentExportDto.builder()
                        .baseTempId(baseIdMap.get(assignment.getBase().getId()))
                        .challengeTempId(challengeIdMap.get(assignment.getChallenge().getId()))
                        .teamTempId(assignment.getTeam() != null ?
                                teamIdMap.get(assignment.getTeam().getId()) : null)
                        .build())
                .toList();

        List<TeamVariableExportDto> teamVariableExportDtos = teamVariables.stream()
                .map(tv -> TeamVariableExportDto.builder()
                        .teamTempId(teamIdMap.get(tv.getTeam().getId()))
                        .variableKey(tv.getVariableKey())
                        .variableValue(tv.getVariableValue())
                        .build())
                .filter(tv -> tv.getTeamTempId() != null)
                .toList();

        List<ChallengeTeamVariableExportDto> challengeTeamVariableExportDtos = challengeTeamVariables.stream()
                .map(ctv -> ChallengeTeamVariableExportDto.builder()
                        .challengeTempId(challengeIdMap.get(ctv.getChallenge().getId()))
                        .teamTempId(teamIdMap.get(ctv.getTeam().getId()))
                        .variableKey(ctv.getVariableKey())
                        .variableValue(ctv.getVariableValue())
                        .build())
                .filter(ctv -> ctv.getChallengeTempId() != null && ctv.getTeamTempId() != null)
                .toList();

        return GameExportDto.builder()
                .exportVersion("1.0")
                .exportedAt(Instant.now())
                .game(gameMetadata)
                .bases(baseExportDtos)
                .challenges(challengeExportDtos)
                .assignments(assignmentExportDtos)
                .teams(teamExportDtos)
                .teamVariables(teamVariableExportDtos.isEmpty() ? null : teamVariableExportDtos)
                .challengeTeamVariables(challengeTeamVariableExportDtos.isEmpty() ? null : challengeTeamVariableExportDtos)
                .build();
    }

    @Transactional(timeout = 60)
    public GameResponse importGame(GameImportRequest request) {
        User currentUser = SecurityUtils.getCurrentUser();
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        GameExportDto data = request.getGameData();

        validateImportData(data);
        validateImportDates(request);

        Map<String, Challenge> challengeEntityMap = new HashMap<>();
        Map<String, Base> baseEntityMap = new HashMap<>();
        Map<String, Team> teamEntityMap = new HashMap<>();

        Game newGame = Game.builder()
                .name(data.getGame().getName())
                .description(data.getGame().getDescription() != null ? data.getGame().getDescription() : "")
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .uniformAssignment(data.getGame().getUniformAssignment() != null ? data.getGame().getUniformAssignment() : false)
                .tileSource(data.getGame().getTileSource() != null ? data.getGame().getTileSource() : "osm-classic")
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
                    .content(HtmlSanitizer.sanitize(chDto.getContent() != null ? chDto.getContent() : ""))
                    .completionContent(HtmlSanitizer.sanitize(chDto.getCompletionContent() != null ? chDto.getCompletionContent() : ""))
                    .answerType(chDto.getAnswerType())
                    .autoValidate(chDto.getAutoValidate() != null ? chDto.getAutoValidate() : false)
                    .correctAnswer(chDto.getCorrectAnswer())
                    .points(chDto.getPoints())
                    .locationBound(chDto.getLocationBound() != null ? chDto.getLocationBound() : false)
                    .requirePresenceToSubmit(chDto.getRequirePresenceToSubmit() != null ? chDto.getRequirePresenceToSubmit() : false)
                    .build();
            challenge = challengeRepository.save(challenge);
            challengeEntityMap.put(chDto.getTempId(), challenge);
        }

        for (BaseExportDto baseDto : data.getBases()) {
            Challenge fixedChallenge = null;
            if (baseDto.getFixedChallengeTempId() != null) {
                fixedChallenge = challengeEntityMap.get(baseDto.getFixedChallengeTempId());
                if (fixedChallenge == null) {
                    throw new IllegalStateException("Challenge not found");
                }
            }

            Base base = Base.builder()
                    .game(newGame)
                    .name(baseDto.getName())
                    .description(baseDto.getDescription() != null ? baseDto.getDescription() : "")
                    .lat(baseDto.getLat())
                    .lng(baseDto.getLng())
                    .nfcLinked(false)
                    .hidden(baseDto.getHidden() != null ? baseDto.getHidden() : false)
                    .fixedChallenge(fixedChallenge)
                    .build();
            base = baseRepository.save(base);
            baseEntityMap.put(baseDto.getTempId(), base);
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
                teamEntityMap.put(teamDto.getTempId(), team);
            }
        }

        Map<String, List<String>> fixedBaseTempIdsByChallengeTempId =
                buildFixedBaseTempIdsByChallenge(data.getBases());

        // Restore unlocks_bases relationships (challenges already created, bases now exist)
        for (ChallengeExportDto chDto : data.getChallenges()) {
            List<String> unlocksTempIds = chDto.getUnlocksBaseTempIds();
            if (unlocksTempIds == null || unlocksTempIds.isEmpty()) {
                continue;
            }

            Challenge challenge = challengeEntityMap.get(chDto.getTempId());
            if (challenge == null) {
                throw new BadRequestException("Invalid unlock relationship for challenge: " + chDto.getTempId());
            }

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

            Set<Base> unlockTargets = new LinkedHashSet<>();
            for (String unlockTempId : unlocksTempIds) {
                Base targetBase = baseEntityMap.get(unlockTempId);
                if (targetBase == null) {
                    throw new BadRequestException("Invalid unlock relationship for challenge: " + chDto.getTempId());
                }

                if (sourceBaseTempIds.contains(unlockTempId)) {
                    throw new BadRequestException("Challenge " + chDto.getTempId()
                            + " cannot unlock its own fixed base");
                }
                if (!Boolean.TRUE.equals(targetBase.getHidden())) {
                    throw new BadRequestException("Unlock target base must be hidden for challenge: " + chDto.getTempId());
                }

                challengeRepository.findByUnlocksBasesContaining(targetBase.getId()).ifPresent(existing -> {
                    if (!existing.getId().equals(challenge.getId())) {
                        throw new BadRequestException("Multiple challenges cannot unlock the same base: "
                                + unlockTempId);
                    }
                });

                unlockTargets.add(targetBase);
            }

            challenge.getUnlocksBases().addAll(unlockTargets);
            challengeRepository.save(challenge);
        }

        for (AssignmentExportDto assignDto : data.getAssignments()) {
            Base base = baseEntityMap.get(assignDto.getBaseTempId());
            Challenge challenge = challengeEntityMap.get(assignDto.getChallengeTempId());
            Team team = assignDto.getTeamTempId() != null ?
                    teamEntityMap.get(assignDto.getTeamTempId()) : null;

            assignmentRepository.save(Assignment.builder()
                    .game(newGame).base(base).challenge(challenge).team(team).build());
        }

        if (data.getTeamVariables() != null) {
            for (TeamVariableExportDto tvDto : data.getTeamVariables()) {
                Team team = teamEntityMap.get(tvDto.getTeamTempId());
                if (team == null) continue;
                teamVariableRepository.save(TeamVariable.builder()
                        .game(newGame)
                        .team(team)
                        .variableKey(tvDto.getVariableKey())
                        .variableValue(tvDto.getVariableValue() != null ? tvDto.getVariableValue() : "")
                        .build());
            }
        }

        if (data.getChallengeTeamVariables() != null) {
            for (ChallengeTeamVariableExportDto ctvDto : data.getChallengeTeamVariables()) {
                Challenge challenge = challengeEntityMap.get(ctvDto.getChallengeTempId());
                Team team = teamEntityMap.get(ctvDto.getTeamTempId());
                if (challenge == null || team == null) continue;
                challengeTeamVariableRepository.save(ChallengeTeamVariable.builder()
                        .challenge(challenge)
                        .team(team)
                        .variableKey(ctvDto.getVariableKey())
                        .variableValue(ctvDto.getVariableValue() != null ? ctvDto.getVariableValue() : "")
                        .build());
            }
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
            if (ch.getUnlocksBaseTempIds() != null) {
                for (int j = 0; j < ch.getUnlocksBaseTempIds().size(); j++) {
                    String tempId = ch.getUnlocksBaseTempIds().get(j);
                    if (tempId == null || tempId.isBlank()) {
                        throw new BadRequestException(fp + ".unlocksBaseTempIds[" + j + "] cannot be blank");
                    }
                }
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
            if (ch.getUnlocksBaseTempIds() != null) {
                for (String unlockTempId : ch.getUnlocksBaseTempIds()) {
                    if (!baseTempIds.contains(unlockTempId)) {
                        throw new BadRequestException("Challenge at index " + i
                                + " references non-existent unlock base: " + unlockTempId);
                    }
                }
            }
        }

        if (data.getTeamVariables() != null) {
            for (int i = 0; i < data.getTeamVariables().size(); i++) {
                TeamVariableExportDto tv = data.getTeamVariables().get(i);
                String fp = "teamVariables[" + i + "]";
                requireNotBlank(tv.getTeamTempId(), fp + ".teamTempId");
                requireNotBlank(tv.getVariableKey(), fp + ".variableKey");
                if (!teamTempIds.contains(tv.getTeamTempId())) {
                    throw new BadRequestException(fp + " references non-existent team: " + tv.getTeamTempId());
                }
            }
        }

        if (data.getChallengeTeamVariables() != null) {
            for (int i = 0; i < data.getChallengeTeamVariables().size(); i++) {
                ChallengeTeamVariableExportDto ctv = data.getChallengeTeamVariables().get(i);
                String fp = "challengeTeamVariables[" + i + "]";
                requireNotBlank(ctv.getChallengeTempId(), fp + ".challengeTempId");
                requireNotBlank(ctv.getTeamTempId(), fp + ".teamTempId");
                requireNotBlank(ctv.getVariableKey(), fp + ".variableKey");
                if (!challengeTempIds.contains(ctv.getChallengeTempId())) {
                    throw new BadRequestException(fp + " references non-existent challenge: " + ctv.getChallengeTempId());
                }
                if (!teamTempIds.contains(ctv.getTeamTempId())) {
                    throw new BadRequestException(fp + " references non-existent team: " + ctv.getTeamTempId());
                }
            }
        }

        Map<String, BaseExportDto> baseByTempId = data.getBases().stream()
                .collect(Collectors.toMap(BaseExportDto::getTempId, b -> b));
        Map<String, List<String>> fixedBaseTempIdsByChallengeTempId =
                buildFixedBaseTempIdsByChallenge(data.getBases());
        Set<String> seenUnlockTargetBaseTempIds = new HashSet<>();

        for (int i = 0; i < data.getChallenges().size(); i++) {
            ChallengeExportDto challenge = data.getChallenges().get(i);
            List<String> unlocksTempIds = challenge.getUnlocksBaseTempIds();
            if (unlocksTempIds == null || unlocksTempIds.isEmpty()) {
                continue;
            }

            if (!Boolean.TRUE.equals(challenge.getLocationBound())) {
                throw new BadRequestException("Challenge at index " + i
                        + " must be locationBound=true when unlocksBaseTempIds is set");
            }

            List<String> sourceBaseTempIds = fixedBaseTempIdsByChallengeTempId
                    .getOrDefault(challenge.getTempId(), List.of());
            if (sourceBaseTempIds.isEmpty()) {
                throw new BadRequestException("Challenge at index " + i
                        + " must be fixed to a base when unlocksBaseTempIds is set");
            }

            for (String unlockTempId : unlocksTempIds) {
                if (sourceBaseTempIds.contains(unlockTempId)) {
                    throw new BadRequestException("Challenge at index " + i
                            + " cannot unlock its own fixed base: " + unlockTempId);
                }

                BaseExportDto targetBase = baseByTempId.get(unlockTempId);
                if (targetBase == null || !Boolean.TRUE.equals(targetBase.getHidden())) {
                    throw new BadRequestException("Challenge at index " + i
                            + " must reference a hidden base as unlock target: " + unlockTempId);
                }
                if (!seenUnlockTargetBaseTempIds.add(unlockTempId)) {
                    throw new BadRequestException("Multiple challenges cannot unlock the same base: " + unlockTempId);
                }
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
        return GameResponseMapper.toResponse(game);
    }

    private String generateUniqueJoinCode() {
        for (int attempt = 0; attempt < 100; attempt++) {
            String code = CodeGenerator.generate(6, CodeGenerator.FULL_ALPHANUMERIC);
            if (teamRepository.findByJoinCode(code).isEmpty()) {
                return code;
            }
        }
        throw new IllegalStateException("Unable to generate unique join code");
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
