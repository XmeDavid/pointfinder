package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateAssignmentRequest;
import com.dbv.scoutmission.dto.response.AssignmentResponse;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ConflictException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AssignmentService {

    private final AssignmentRepository assignmentRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final TeamRepository teamRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getAssignmentsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return assignmentRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public AssignmentResponse createAssignment(UUID gameId, CreateAssignmentRequest request) {
        Game game = resolveGame(gameId);
        Base base = resolveBaseForGame(gameId, request.getBaseId());
        Challenge challenge = resolveChallengeForGame(gameId, request.getChallengeId());
        Team team = resolveTeamForGame(gameId, request.getTeamId());

        validateNoConflictingAssignment(gameId, base.getId(), team != null ? team.getId() : null);

        Assignment assignment = Assignment.builder()
                .game(game)
                .base(base)
                .challenge(challenge)
                .team(team)
                .build();

        assignment = assignmentRepository.save(assignment);
        return toResponse(assignment);
    }

    @Transactional
    public List<AssignmentResponse> bulkSetAssignments(UUID gameId, List<CreateAssignmentRequest> requests) {
        List<CreateAssignmentRequest> safeRequests = requests != null ? requests : List.of();

        Game game = resolveGame(gameId);
        validateBulkRequestConflicts(safeRequests);

        List<Assignment> assignmentsToSave = safeRequests.stream().map(req -> {
            Base base = resolveBaseForGame(gameId, req.getBaseId());
            Challenge challenge = resolveChallengeForGame(gameId, req.getChallengeId());
            Team team = resolveTeamForGame(gameId, req.getTeamId());

            return Assignment.builder()
                    .game(game)
                    .base(base)
                    .challenge(challenge)
                    .team(team)
                    .build();
        }).collect(Collectors.toList());

        assignmentRepository.deleteByGameId(gameId);

        return assignmentsToSave.stream()
                .map(assignmentRepository::save)
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteAssignment(UUID gameId, UUID assignmentId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Assignment assignment = assignmentRepository.findByIdAndGameId(assignmentId, gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Assignment", assignmentId));
        assignmentRepository.delete(assignment);
    }

    private Game resolveGame(UUID gameId) {
        return gameAccessService.getAccessibleGame(gameId);
    }

    private Base resolveBaseForGame(UUID gameId, UUID baseId) {
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBelongsToGame("Base", base.getGame().getId(), gameId);
        return base;
    }

    private Challenge resolveChallengeForGame(UUID gameId, UUID challengeId) {
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureBelongsToGame("Challenge", challenge.getGame().getId(), gameId);
        return challenge;
    }

    private Team resolveTeamForGame(UUID gameId, UUID teamId) {
        if (teamId == null) {
            return null;
        }

        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResourceNotFoundException("Team", teamId));
        ensureBelongsToGame("Team", team.getGame().getId(), gameId);
        return team;
    }

    private void ensureBelongsToGame(String entityName, UUID entityGameId, UUID expectedGameId) {
        if (!entityGameId.equals(expectedGameId)) {
            throw new BadRequestException(entityName + " does not belong to this game");
        }
    }

    private void validateNoConflictingAssignment(UUID gameId, UUID baseId, UUID teamId) {
        if (teamId != null) {
            if (assignmentRepository.existsByGameIdAndBaseIdAndTeamId(gameId, baseId, teamId)) {
                throw new ConflictException("Team already has an assignment for this base");
            }
            if (assignmentRepository.existsByGameIdAndBaseIdAndTeamIdIsNull(gameId, baseId)) {
                throw new ConflictException("Base already has an 'All Teams' assignment");
            }
            return;
        }

        if (assignmentRepository.existsByGameIdAndBaseIdAndTeamIdIsNull(gameId, baseId)) {
            throw new ConflictException("Base already has an 'All Teams' assignment");
        }
        if (assignmentRepository.existsByGameIdAndBaseIdAndTeamIdIsNotNull(gameId, baseId)) {
            throw new ConflictException("Base already has team-specific assignments");
        }
    }

    private void validateBulkRequestConflicts(List<CreateAssignmentRequest> requests) {
        Set<String> seenTeamSpecific = new HashSet<>();
        Set<UUID> basesWithAllTeams = new HashSet<>();
        Set<UUID> basesWithTeamSpecific = new HashSet<>();

        for (CreateAssignmentRequest req : requests) {
            UUID baseId = req.getBaseId();
            UUID teamId = req.getTeamId();

            if (teamId == null) {
                if (basesWithTeamSpecific.contains(baseId)) {
                    throw new ConflictException("Cannot mix 'All Teams' and team-specific assignments for the same base");
                }
                if (!basesWithAllTeams.add(baseId)) {
                    throw new ConflictException("Duplicate 'All Teams' assignment for the same base");
                }
                continue;
            }

            if (basesWithAllTeams.contains(baseId)) {
                throw new ConflictException("Cannot mix team-specific and 'All Teams' assignments for the same base");
            }

            String key = baseId + ":" + teamId;
            if (!seenTeamSpecific.add(key)) {
                throw new ConflictException("Duplicate assignment for the same base and team");
            }
            basesWithTeamSpecific.add(baseId);
        }
    }

    private AssignmentResponse toResponse(Assignment a) {
        return AssignmentResponse.builder()
                .id(a.getId())
                .gameId(a.getGame().getId())
                .baseId(a.getBase().getId())
                .challengeId(a.getChallenge().getId())
                .teamId(a.getTeam() != null ? a.getTeam().getId() : null)
                .build();
    }
}
