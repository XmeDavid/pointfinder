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
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TeamVariableService {

    private final TeamVariableRepository teamVariableRepository;
    private final ChallengeTeamVariableRepository challengeTeamVariableRepository;
    private final TeamRepository teamRepository;
    private final ChallengeRepository challengeRepository;
    private final GameAccessService gameAccessService;
    private final GameEventBroadcaster eventBroadcaster;

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

        eventBroadcaster.broadcastGameConfig(gameId, "variables", "updated");
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

        eventBroadcaster.broadcastGameConfig(gameId, "variables", "updated");
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

        // Scan each challenge's body (content / completionContent / correctAnswer) for
        // {{key}} references and verify each referenced key has a value for every team
        // at either game scope or the challenge's own scope.
        errors.addAll(scanChallengeReferences(gameId));

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
                .toList();
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
                .toList();
        return TeamVariablesResponse.builder().variables(defs).build();
    }

    // ── Challenge-reference scanning ──

    /**
     * Matches {@code {{key}}} where {@code key} starts with a letter and
     * contains only letters, digits, and underscores — mirrors
     * {@link #validateVariableKey(String)}.
     */
    private static final Pattern VARIABLE_REF_PATTERN =
            Pattern.compile("\\{\\{([a-zA-Z][a-zA-Z0-9_]*)}}");

    /**
     * Scans every challenge in the game for {@code {{key}}} references in
     * {@code content}, {@code completionContent}, and {@code correctAnswer}.
     * For each referenced key, verifies that every team in the game has a
     * value defined at either game scope or this challenge's scope. Returns
     * a list of human-readable error strings, one per (challenge, key, missing-team)
     * tuple. Each error mentions the challenge title (or id fallback), the
     * referenced key, and the team name (or id fallback).
     */
    private List<String> scanChallengeReferences(UUID gameId) {
        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        if (challenges.isEmpty() || teams.isEmpty()) return List.of();

        // (teamId → set of game-scope keys defined for that team)
        Map<UUID, Set<String>> gameKeysByTeam = new HashMap<>();
        for (TeamVariable tv : teamVariableRepository.findByGameId(gameId)) {
            gameKeysByTeam
                    .computeIfAbsent(tv.getTeam().getId(), k -> new HashSet<>())
                    .add(tv.getVariableKey());
        }

        // (challengeId → teamId → set of challenge-scope keys defined)
        Map<UUID, Map<UUID, Set<String>>> challengeKeysByTeam = new HashMap<>();
        for (ChallengeTeamVariable ctv : challengeTeamVariableRepository.findByGameId(gameId)) {
            challengeKeysByTeam
                    .computeIfAbsent(ctv.getChallenge().getId(), k -> new HashMap<>())
                    .computeIfAbsent(ctv.getTeam().getId(), k -> new HashSet<>())
                    .add(ctv.getVariableKey());
        }

        List<String> errors = new ArrayList<>();
        for (Challenge ch : challenges) {
            Set<String> refs = extractReferences(ch);
            if (refs.isEmpty()) continue;
            String challengeLabel = (ch.getTitle() == null || ch.getTitle().isEmpty())
                    ? ch.getId().toString()
                    : ch.getTitle();
            Map<UUID, Set<String>> thisChallengeKeys =
                    challengeKeysByTeam.getOrDefault(ch.getId(), Map.of());
            for (String key : refs) {
                for (Team team : teams) {
                    boolean hasGameLevel = gameKeysByTeam
                            .getOrDefault(team.getId(), Set.of()).contains(key);
                    boolean hasChallengeLevel = thisChallengeKeys
                            .getOrDefault(team.getId(), Set.of()).contains(key);
                    if (!hasGameLevel && !hasChallengeLevel) {
                        String teamLabel = (team.getName() == null || team.getName().isEmpty())
                                ? team.getId().toString()
                                : team.getName();
                        errors.add(String.format(
                                "Challenge '%s' references variable '%s' but team '%s' has no value defined",
                                challengeLabel, key, teamLabel));
                    }
                }
            }
        }
        return errors;
    }

    private Set<String> extractReferences(Challenge ch) {
        Set<String> out = new LinkedHashSet<>();
        addRefs(out, ch.getContent());
        addRefs(out, ch.getCompletionContent());
        if (ch.getCorrectAnswer() != null) {
            ch.getCorrectAnswer().forEach(ans -> addRefs(out, ans));
        }
        return out;
    }

    private void addRefs(Set<String> out, String text) {
        if (text == null || text.isEmpty()) return;
        Matcher m = VARIABLE_REF_PATTERN.matcher(text);
        while (m.find()) out.add(m.group(1));
    }
}
