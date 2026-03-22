package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateAssignmentRequest;
import com.prayer.pointfinder.dto.response.AssignmentResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AssignmentServiceTest {

    @Mock
    private AssignmentRepository assignmentRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private GameEventBroadcaster eventBroadcaster;

    private AssignmentService assignmentService;

    private UUID gameId;
    private Game game;
    private Base base1;
    private Base base2;
    private Challenge challenge;
    private Team team;

    @BeforeEach
    void setUp() {
        assignmentService = new AssignmentService(
                assignmentRepository, baseRepository, challengeRepository,
                teamRepository, gameAccessService, eventBroadcaster
        );

        gameId = UUID.randomUUID();
        game = Game.builder().id(gameId).build();

        base1 = Base.builder().id(UUID.randomUUID()).game(game).build();
        base2 = Base.builder().id(UUID.randomUUID()).game(game).build();

        challenge = Challenge.builder().id(UUID.randomUUID()).game(game).build();

        team = Team.builder().id(UUID.randomUUID()).game(game).build();
    }

    @Test
    void createAssignment_rejectsSameChallengeForSameTeamAtDifferentBase() {
        // Given: challenge is already assigned to team at base1
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findById(base2.getId())).thenReturn(Optional.of(base2));
        when(challengeRepository.findById(challenge.getId())).thenReturn(Optional.of(challenge));
        when(teamRepository.findById(team.getId())).thenReturn(Optional.of(team));
        when(assignmentRepository.existsByGameIdAndBaseIdAndTeamId(gameId, base2.getId(), team.getId()))
                .thenReturn(false);
        when(assignmentRepository.existsByGameIdAndBaseIdAndTeamIdIsNull(gameId, base2.getId()))
                .thenReturn(false);
        when(assignmentRepository.existsByGameIdAndChallengeIdAndTeamId(gameId, challenge.getId(), team.getId()))
                .thenReturn(true); // already assigned at another base

        CreateAssignmentRequest request = new CreateAssignmentRequest();
        request.setBaseId(base2.getId());
        request.setChallengeId(challenge.getId());
        request.setTeamId(team.getId());

        // When/Then: should reject the duplicate
        ConflictException ex = assertThrows(ConflictException.class,
                () -> assignmentService.createAssignment(gameId, request));
        assertTrue(ex.getMessage().contains("challenge"));
    }

    @Test
    void createAssignment_rejectsSameChallengeForAllTeamsAtDifferentBase() {
        // Given: challenge is already assigned as "all teams" at base1
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findById(base2.getId())).thenReturn(Optional.of(base2));
        when(challengeRepository.findById(challenge.getId())).thenReturn(Optional.of(challenge));
        when(assignmentRepository.existsByGameIdAndBaseIdAndTeamIdIsNull(gameId, base2.getId()))
                .thenReturn(false);
        when(assignmentRepository.existsByGameIdAndBaseIdAndTeamIdIsNotNull(gameId, base2.getId()))
                .thenReturn(false);
        when(assignmentRepository.existsByGameIdAndChallengeIdAndTeamIdIsNull(gameId, challenge.getId()))
                .thenReturn(true); // already assigned at another base

        CreateAssignmentRequest request = new CreateAssignmentRequest();
        request.setBaseId(base2.getId());
        request.setChallengeId(challenge.getId());
        request.setTeamId(null);

        ConflictException ex = assertThrows(ConflictException.class,
                () -> assignmentService.createAssignment(gameId, request));
        assertTrue(ex.getMessage().contains("challenge"));
    }

    @Test
    void createAssignment_allowsDifferentChallengesForSameTeamAtDifferentBases() {
        Challenge challenge2 = Challenge.builder().id(UUID.randomUUID()).game(game).build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findById(base2.getId())).thenReturn(Optional.of(base2));
        when(challengeRepository.findById(challenge2.getId())).thenReturn(Optional.of(challenge2));
        when(teamRepository.findById(team.getId())).thenReturn(Optional.of(team));
        when(assignmentRepository.existsByGameIdAndBaseIdAndTeamId(gameId, base2.getId(), team.getId()))
                .thenReturn(false);
        when(assignmentRepository.existsByGameIdAndBaseIdAndTeamIdIsNull(gameId, base2.getId()))
                .thenReturn(false);
        when(assignmentRepository.existsByGameIdAndChallengeIdAndTeamId(gameId, challenge2.getId(), team.getId()))
                .thenReturn(false);

        Assignment saved = Assignment.builder()
                .id(UUID.randomUUID()).game(game).base(base2).challenge(challenge2).team(team).build();
        when(assignmentRepository.save(any())).thenReturn(saved);

        CreateAssignmentRequest request = new CreateAssignmentRequest();
        request.setBaseId(base2.getId());
        request.setChallengeId(challenge2.getId());
        request.setTeamId(team.getId());

        AssignmentResponse response = assignmentService.createAssignment(gameId, request);
        assertNotNull(response);
    }

    @Test
    void bulkSetAssignments_rejectsSameChallengeForSameTeamAcrossBases() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);

        CreateAssignmentRequest req1 = new CreateAssignmentRequest();
        req1.setBaseId(base1.getId());
        req1.setChallengeId(challenge.getId());
        req1.setTeamId(team.getId());

        CreateAssignmentRequest req2 = new CreateAssignmentRequest();
        req2.setBaseId(base2.getId());
        req2.setChallengeId(challenge.getId());
        req2.setTeamId(team.getId());

        ConflictException ex = assertThrows(ConflictException.class,
                () -> assignmentService.bulkSetAssignments(gameId, List.of(req1, req2)));
        assertTrue(ex.getMessage().contains("challenge"));
    }

    @Test
    void bulkSetAssignments_rejectsSameChallengeForAllTeamsAcrossBases() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);

        CreateAssignmentRequest req1 = new CreateAssignmentRequest();
        req1.setBaseId(base1.getId());
        req1.setChallengeId(challenge.getId());
        req1.setTeamId(null);

        CreateAssignmentRequest req2 = new CreateAssignmentRequest();
        req2.setBaseId(base2.getId());
        req2.setChallengeId(challenge.getId());
        req2.setTeamId(null);

        ConflictException ex = assertThrows(ConflictException.class,
                () -> assignmentService.bulkSetAssignments(gameId, List.of(req1, req2)));
        assertTrue(ex.getMessage().contains("challenge"));
    }

    @Test
    void bulkSetAssignments_allowsSameChallengeForDifferentTeams() {
        Team team2 = Team.builder().id(UUID.randomUUID()).game(game).build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findById(base1.getId())).thenReturn(Optional.of(base1));
        when(baseRepository.findById(base2.getId())).thenReturn(Optional.of(base2));
        when(challengeRepository.findById(challenge.getId())).thenReturn(Optional.of(challenge));
        when(teamRepository.findById(team.getId())).thenReturn(Optional.of(team));
        when(teamRepository.findById(team2.getId())).thenReturn(Optional.of(team2));

        Assignment saved1 = Assignment.builder()
                .id(UUID.randomUUID()).game(game).base(base1).challenge(challenge).team(team).build();
        Assignment saved2 = Assignment.builder()
                .id(UUID.randomUUID()).game(game).base(base2).challenge(challenge).team(team2).build();
        when(assignmentRepository.save(any())).thenReturn(saved1, saved2);

        CreateAssignmentRequest req1 = new CreateAssignmentRequest();
        req1.setBaseId(base1.getId());
        req1.setChallengeId(challenge.getId());
        req1.setTeamId(team.getId());

        CreateAssignmentRequest req2 = new CreateAssignmentRequest();
        req2.setBaseId(base2.getId());
        req2.setChallengeId(challenge.getId());
        req2.setTeamId(team2.getId());

        List<AssignmentResponse> responses = assignmentService.bulkSetAssignments(gameId, List.of(req1, req2));
        assertEquals(2, responses.size());
    }
}
