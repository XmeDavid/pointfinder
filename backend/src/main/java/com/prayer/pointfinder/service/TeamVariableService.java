package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.projection.TeamKeyCount;
import com.prayer.pointfinder.dto.request.TeamVariablesBulkRequest;
import com.prayer.pointfinder.dto.response.TeamVariablesResponse;
import com.prayer.pointfinder.dto.response.VariableCompletenessResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.ChallengeTeamVariableRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.TeamVariableRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TeamVariableService {

    private final TeamVariableRepository teamVariableRepository;
    private final ChallengeTeamVariableRepository challengeTeamVariableRepository;
    private final TeamRepository teamRepository;
    private final ChallengeRepository challengeRepository;
    private final GameAccessService gameAccessService;

    // ── Game-level variables ──

    @Transactional(readOnly = true)
    public TeamVariablesResponse getGameVariables(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        List<TeamVariable> all = teamVariableRepository.findByGameId(gameId);
        return groupGameVariables(all);
    }

    @Transactional(timeout = 10)
    public TeamVariablesResponse saveGameVariables(UUID gameId, TeamVariablesBulkRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        Map<UUID, Team> teamMap = teams.stream()
                .collect(Collectors.toMap(Team::getId, t -> t));

        teamVariableRepository.deleteByGameId(gameId);
        teamVariableRepository.flush();

        List<TeamVariable> newVars = new ArrayList<>();
        for (TeamVariablesBulkRequest.TeamVariableEntry entry : request.getVariables()) {
            validateVariableKey(entry.getKey());
            for (Map.Entry<UUID, String> tv : entry.getTeamValues().entrySet()) {
                Team team = teamMap.get(tv.getKey());
                if (team == null) throw new BadRequestException("Team not found: " + tv.getKey());
                newVars.add(TeamVariable.builder()
                        .game(game)
                        .team(team)
                        .variableKey(entry.getKey())
                        .variableValue(tv.getValue() != null ? tv.getValue() : "")
                        .build());
            }
        }
        teamVariableRepository.saveAll(newVars);

        return getGameVariables(gameId);
    }

    // ── Challenge-level variables ──

    @Transactional(readOnly = true)
    public TeamVariablesResponse getChallengeVariables(UUID gameId, UUID challengeId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureChallengeBelongsToGame(challenge, gameId);

        List<ChallengeTeamVariable> all = challengeTeamVariableRepository.findByChallengeId(challengeId);
        return groupChallengeVariables(all);
    }

    @Transactional(timeout = 10)
    public TeamVariablesResponse saveChallengeVariables(UUID gameId, UUID challengeId,
                                                         TeamVariablesBulkRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureChallengeBelongsToGame(challenge, gameId);

        List<Team> teams = teamRepository.findByGameId(gameId);
        Map<UUID, Team> teamMap = teams.stream()
                .collect(Collectors.toMap(Team::getId, t -> t));

        challengeTeamVariableRepository.deleteByChallengeId(challengeId);
        challengeTeamVariableRepository.flush();

        List<ChallengeTeamVariable> newVars = new ArrayList<>();
        for (TeamVariablesBulkRequest.TeamVariableEntry entry : request.getVariables()) {
            validateVariableKey(entry.getKey());
            for (Map.Entry<UUID, String> tv : entry.getTeamValues().entrySet()) {
                Team team = teamMap.get(tv.getKey());
                if (team == null) throw new BadRequestException("Team not found: " + tv.getKey());
                newVars.add(ChallengeTeamVariable.builder()
                        .challenge(challenge)
                        .team(team)
                        .variableKey(entry.getKey())
                        .variableValue(tv.getValue() != null ? tv.getValue() : "")
                        .build());
            }
        }
        challengeTeamVariableRepository.saveAll(newVars);

        return getChallengeVariables(gameId, challengeId);
    }

    // ── Completeness validation ──

    @Transactional(readOnly = true)
    public VariableCompletenessResponse checkCompleteness(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        List<String> errors = validateVariableCompleteness(gameId);
        return VariableCompletenessResponse.builder()
                .complete(errors.isEmpty())
                .errors(errors)
                .build();
    }

    public List<String> validateVariableCompleteness(UUID gameId) {
        List<String> errors = new ArrayList<>();
        long teamCount = teamRepository.countByGameId(gameId);
        if (teamCount == 0) return errors;

        // Check game-level variables
        List<TeamKeyCount> gameCounts = teamVariableRepository.countTeamsPerKeyByGameId(gameId);
        for (TeamKeyCount tkc : gameCounts) {
            if (tkc.count() < teamCount) {
                errors.add("Game variable '" + tkc.key() + "' missing for " + (teamCount - tkc.count()) + " team(s)");
            }
        }

        // Check challenge-level variables
        List<ChallengeTeamVariable> allChallengeVars = challengeTeamVariableRepository.findByGameId(gameId);
        Map<UUID, Map<String, Long>> challengeKeyCounts = allChallengeVars.stream()
                .collect(Collectors.groupingBy(
                        v -> v.getChallenge().getId(),
                        Collectors.groupingBy(ChallengeTeamVariable::getVariableKey, Collectors.counting())
                ));

        Map<UUID, String> challengeNames = challengeRepository.findByGameId(gameId).stream()
                .collect(Collectors.toMap(Challenge::getId, Challenge::getTitle));

        for (Map.Entry<UUID, Map<String, Long>> entry : challengeKeyCounts.entrySet()) {
            String challengeTitle = challengeNames.getOrDefault(entry.getKey(), "Unknown");
            for (Map.Entry<String, Long> keyCount : entry.getValue().entrySet()) {
                if (keyCount.getValue() < teamCount) {
                    errors.add("Challenge '" + challengeTitle + "' variable '" + keyCount.getKey()
                            + "' missing for " + (teamCount - keyCount.getValue()) + " team(s)");
                }
            }
        }

        return errors;
    }

    // ── Helpers ──

    private void validateVariableKey(String key) {
        if (!key.matches("^[a-zA-Z][a-zA-Z0-9_]*$")) {
            throw new BadRequestException(
                    "Variable key '" + key + "' is invalid. Must start with a letter and contain only letters, digits, and underscores.");
        }
    }

    private void ensureChallengeBelongsToGame(Challenge challenge, UUID gameId) {
        gameAccessService.ensureBelongsToGame("Challenge", challenge.getGame().getId(), gameId);
    }

    private TeamVariablesResponse groupGameVariables(List<TeamVariable> vars) {
        Map<String, Map<UUID, String>> grouped = new LinkedHashMap<>();
        for (TeamVariable v : vars) {
            grouped.computeIfAbsent(v.getVariableKey(), k -> new LinkedHashMap<>())
                    .put(v.getTeam().getId(), v.getVariableValue());
        }
        List<TeamVariablesResponse.VariableDefinition> defs = grouped.entrySet().stream()
                .map(e -> TeamVariablesResponse.VariableDefinition.builder()
                        .key(e.getKey())
                        .teamValues(e.getValue())
                        .build())
                .collect(Collectors.toList());
        return TeamVariablesResponse.builder().variables(defs).build();
    }

    private TeamVariablesResponse groupChallengeVariables(List<ChallengeTeamVariable> vars) {
        Map<String, Map<UUID, String>> grouped = new LinkedHashMap<>();
        for (ChallengeTeamVariable v : vars) {
            grouped.computeIfAbsent(v.getVariableKey(), k -> new LinkedHashMap<>())
                    .put(v.getTeam().getId(), v.getVariableValue());
        }
        List<TeamVariablesResponse.VariableDefinition> defs = grouped.entrySet().stream()
                .map(e -> TeamVariablesResponse.VariableDefinition.builder()
                        .key(e.getKey())
                        .teamValues(e.getValue())
                        .build())
                .collect(Collectors.toList());
        return TeamVariablesResponse.builder().variables(defs).build();
    }
}
