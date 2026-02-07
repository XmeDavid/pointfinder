package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateAssignmentRequest;
import com.dbv.scoutmission.dto.response.AssignmentResponse;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AssignmentService {

    private final AssignmentRepository assignmentRepository;
    private final GameRepository gameRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final TeamRepository teamRepository;

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getAssignmentsByGame(UUID gameId) {
        return assignmentRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public AssignmentResponse createAssignment(UUID gameId, CreateAssignmentRequest request) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        Base base = baseRepository.findById(request.getBaseId())
                .orElseThrow(() -> new ResourceNotFoundException("Base", request.getBaseId()));
        Challenge challenge = challengeRepository.findById(request.getChallengeId())
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getChallengeId()));

        Team team = null;
        if (request.getTeamId() != null) {
            team = teamRepository.findById(request.getTeamId())
                    .orElseThrow(() -> new ResourceNotFoundException("Team", request.getTeamId()));
        }

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
        assignmentRepository.deleteByGameId(gameId);

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        return requests.stream().map(req -> {
            Base base = baseRepository.findById(req.getBaseId())
                    .orElseThrow(() -> new ResourceNotFoundException("Base", req.getBaseId()));
            Challenge challenge = challengeRepository.findById(req.getChallengeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Challenge", req.getChallengeId()));
            Team team = null;
            if (req.getTeamId() != null) {
                team = teamRepository.findById(req.getTeamId())
                        .orElseThrow(() -> new ResourceNotFoundException("Team", req.getTeamId()));
            }

            Assignment assignment = Assignment.builder()
                    .game(game).base(base).challenge(challenge).team(team).build();
            return toResponse(assignmentRepository.save(assignment));
        }).collect(Collectors.toList());
    }

    @Transactional
    public void deleteAssignment(UUID gameId, UUID assignmentId) {
        if (!assignmentRepository.existsById(assignmentId)) {
            throw new ResourceNotFoundException("Assignment", assignmentId);
        }
        assignmentRepository.deleteById(assignmentId);
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
