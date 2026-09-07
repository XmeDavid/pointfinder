package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Handles automatic challenge-to-base assignment logic when a game goes live.
 * Extracted from GameService to reduce complexity.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ChallengeAssignmentService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final TeamRepository teamRepository;
    private final AssignmentRepository assignmentRepository;

    /**
     * Auto-assign challenges to bases for all teams in a game.
     * Supports both uniform (same challenge per base) and per-team (unique challenge per team) modes.
     */
    public void autoAssignChallenges(Game game) {
        UUID gameId = game.getId();
        List<Base> bases = baseRepository.findByGameId(gameId);
        List<Team> teams = teamRepository.findByGameId(gameId);
        List<Challenge> challenges = challengeRepository.findByGameId(gameId);
        List<Assignment> existingAssignments = assignmentRepository.findByGameId(gameId);

        if (teams.isEmpty() || challenges.isEmpty()) {
            return;
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
                .toList();

        // Use class-level SecureRandom instead of local Random

        // Track globally used challenges (for uniform assignment mode)
        Set<UUID> usedGlobally = new HashSet<>(fixedChallengeIds);
        for (Assignment a : existingAssignments) {
            usedGlobally.add(a.getChallenge().getId());
        }

        // Initialize per-team tracking of assigned challenge IDs
        Map<UUID, Set<UUID>> teamAssignedChallenges = new HashMap<>();
        for (Team team : teams) {
            Set<UUID> usedChallenges = new HashSet<>();
            for (Assignment a : existingAssignments) {
                if (a.getTeam() != null && a.getTeam().getId().equals(team.getId())) {
                    usedChallenges.add(a.getChallenge().getId());
                } else if (a.getTeam() == null) {
                    usedChallenges.add(a.getChallenge().getId());
                }
            }
            teamAssignedChallenges.put(team.getId(), usedChallenges);
        }

        List<Assignment> assignmentsToCreate = new ArrayList<>();

        for (Base base : bases) {
            // The gap is per (base, team), not per base: a revert keeps the
            // plan, so a team added while the game sat in setup must still
            // get a challenge at every base when the game goes live again.
            List<Assignment> atBase = existingAssignments.stream()
                    .filter(a -> a.getBase().getId().equals(base.getId()))
                    .toList();
            boolean allTeamsRow = atBase.stream().anyMatch(a -> a.getTeam() == null);
            Set<UUID> coveredTeamIds = atBase.stream()
                    .filter(a -> a.getTeam() != null)
                    .map(a -> a.getTeam().getId())
                    .collect(Collectors.toSet());
            List<Team> missingTeams = allTeamsRow
                    ? List.of()
                    : teams.stream().filter(t -> !coveredTeamIds.contains(t.getId())).toList();
            if (missingTeams.isEmpty()) {
                continue;
            }

            if (base.getFixedChallenge() != null) {
                for (Team team : missingTeams) {
                    assignmentsToCreate.add(Assignment.builder()
                            .game(game).base(base).challenge(base.getFixedChallenge()).team(team).build());
                    teamAssignedChallenges.get(team.getId()).add(base.getFixedChallenge().getId());
                }
            } else if (Boolean.TRUE.equals(game.getUniformAssignment())) {
                // Every team meets the same challenge at a base: reuse the one
                // already placed there for the teams that lack it, draw once
                // for a base nobody has yet.
                Challenge selected = atBase.isEmpty() ? null : atBase.get(0).getChallenge();
                if (selected == null) {
                    List<Challenge> sharedPool = randomPool.stream()
                            .filter(c -> !usedGlobally.contains(c.getId()))
                            .toList();
                    if (sharedPool.isEmpty()) {
                        log.warn("Shared challenge pool exhausted at base {} in game {}. " +
                                        "This should have been caught by go-live validation.",
                                base.getId(), gameId);
                        continue;
                    }
                    selected = sharedPool.get(RANDOM.nextInt(sharedPool.size()));
                    usedGlobally.add(selected.getId());
                }
                for (Team team : missingTeams) {
                    assignmentsToCreate.add(Assignment.builder()
                            .game(game).base(base).challenge(selected).team(team).build());
                    teamAssignedChallenges.get(team.getId()).add(selected.getId());
                }
            } else {
                for (Team team : missingTeams) {
                    Set<UUID> usedByTeam = teamAssignedChallenges.get(team.getId());
                    List<Challenge> teamPool = randomPool.stream()
                            .filter(c -> !usedByTeam.contains(c.getId()))
                            .toList();

                    if (!teamPool.isEmpty()) {
                        Challenge selected = teamPool.get(RANDOM.nextInt(teamPool.size()));
                        assignmentsToCreate.add(Assignment.builder()
                                .game(game).base(base).challenge(selected).team(team).build());
                        usedByTeam.add(selected.getId());
                    } else {
                        log.warn("Challenge pool exhausted for team {} at base {} in game {}. " +
                                        "This should have been caught by go-live validation.",
                                team.getId(), base.getId(), gameId);
                    }
                }
            }
        }

        // Use saveAll() to avoid N+1 database writes
        if (!assignmentsToCreate.isEmpty()) {
            assignmentRepository.saveAll(assignmentsToCreate);
        }
    }
}

