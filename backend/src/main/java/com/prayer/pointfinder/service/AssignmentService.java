package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateAssignmentRequest;
import com.prayer.pointfinder.dto.response.AssignmentResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
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
    private final GameEventBroadcaster eventBroadcaster;

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getAssignmentsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return assignmentRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public AssignmentResponse createAssignment(UUID gameId, CreateAssignmentRequest request) {
        Game game = resolveGame(gameId);
        Base base = resolveBaseForGame(gameId, request.getBaseId());
        Challenge challenge = resolveChallengeForGame(gameId, request.getChallengeId());
        Team team = resolveTeamForGame(gameId, request.getTeamId());

        validateNoConflictingAssignment(gameId, base.getId(), team != null ? team.getId() : null);
        validateChallengeNotAlreadyAssignedToTeam(gameId, challenge.getId(), team != null ? team.getId() : null);

        Assignment assignment = Assignment.builder()
                .game(game)
                .base(base)
                .challenge(challenge)
                .team(team)
                .build();

        assignment = assignmentRepository.save(assignment);
        eventBroadcaster.broadcastGameConfig(gameId, "assignments", "created");
        return toResponse(assignment);
    }

    @Transactional(timeout = 10)
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
        }).toList();

        assignmentRepository.deleteByGameId(gameId);

        List<AssignmentResponse> result = assignmentsToSave.stream()
                .map(assignmentRepository::save)
                .map(this::toResponse)
                .toList();
        eventBroadcaster.broadcastGameConfig(gameId, "assignments", "updated");
        return result;
    }

    @Transactional(timeout = 10)
    public void deleteAssignment(UUID gameId, UUID assignmentId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Assignment assignment = assignmentRepository.findByIdAndGameId(assignmentId, gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Assignment", assignmentId));
        assignmentRepository.delete(assignment);
        eventBroadcaster.broadcastGameConfig(gameId, "assignments", "deleted");
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
        gameAccessService.ensureBelongsToGame(entityName, entityGameId, expectedGameId);
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

    private void validateChallengeNotAlreadyAssignedToTeam(UUID gameId, UUID challengeId, UUID teamId) {
        if (teamId != null) {
            if (assignmentRepository.existsByGameIdAndChallengeIdAndTeamId(gameId, challengeId, teamId)) {
                throw new ConflictException("This challenge is already assigned to this team at another base");
            }
        } else {
            if (assignmentRepository.existsByGameIdAndChallengeIdAndTeamIdIsNull(gameId, challengeId)) {
                throw new ConflictException("This challenge is already assigned as an 'All Teams' assignment at another base");
            }
        }
    }

    private void validateBulkRequestConflicts(List<CreateAssignmentRequest> requests) {
        Set<String> seenTeamSpecific = new HashSet<>();
        Set<UUID> basesWithAllTeams = new HashSet<>();
        Set<UUID> basesWithTeamSpecific = new HashSet<>();
        Set<String> seenChallengeTeam = new HashSet<>();
        Set<UUID> seenChallengeAllTeams = new HashSet<>();

        for (CreateAssignmentRequest req : requests) {
            UUID baseId = req.getBaseId();
            UUID teamId = req.getTeamId();
            UUID challengeId = req.getChallengeId();

            if (teamId == null) {
                if (basesWithTeamSpecific.contains(baseId)) {
                    throw new ConflictException("Cannot mix 'All Teams' and team-specific assignments for the same base");
                }
                if (!basesWithAllTeams.add(baseId)) {
                    throw new ConflictException("Duplicate 'All Teams' assignment for the same base");
                }
                if (!seenChallengeAllTeams.add(challengeId)) {
                    throw new ConflictException("Same challenge assigned as 'All Teams' at multiple bases");
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

            String challengeTeamKey = challengeId + ":" + teamId;
            if (!seenChallengeTeam.add(challengeTeamKey)) {
                throw new ConflictException("Same challenge assigned to the same team at multiple bases");
            }
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
