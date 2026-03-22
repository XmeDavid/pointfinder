package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateChallengeRequest;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChallengeServiceTest {

    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private GameEventBroadcaster eventBroadcaster;

    @InjectMocks
    private ChallengeService challengeService;

    private UUID gameId;
    private UUID challengeId;
    private Game game;
    private Challenge challenge;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        challengeId = UUID.randomUUID();
        game = Game.builder().id(gameId).name("Game").description("Desc").build();
        challenge = Challenge.builder()
                .id(challengeId)
                .game(game)
                .title("Challenge")
                .description("Desc")
                .content("Content")
                .completionContent("Completion")
                .answerType(com.prayer.pointfinder.entity.AnswerType.text)
                .autoValidate(false)
                .correctAnswer(null)
                .points(100)
                .locationBound(true)
                .build();
    }

    @Test
    void updateChallengeUsesExistingFixedBaseWhenFixedBaseIdOmitted() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID unlockTargetId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();
        Base unlockTarget = Base.builder().id(unlockTargetId).game(game).hidden(true).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(null); // omitted in request
        request.setUnlocksBaseIds(List.of(unlockTargetId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));
        when(baseRepository.findById(unlockTargetId)).thenReturn(Optional.of(unlockTarget));
        when(challengeRepository.findByUnlocksBasesContaining(unlockTargetId)).thenReturn(Optional.empty());

        ChallengeResponse response = challengeService.updateChallenge(gameId, challengeId, request);

        assertTrue(response.getUnlocksBaseIds().contains(unlockTargetId));
        assertTrue(challenge.getUnlocksBases().stream().anyMatch(b -> b.getId().equals(unlockTargetId)));
    }

    @Test
    void updateChallengeWithMultipleUnlockBasesRecordsAllInJunctionTable() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID unlockTargetId1 = UUID.randomUUID();
        UUID unlockTargetId2 = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();
        Base unlockTarget1 = Base.builder().id(unlockTargetId1).game(game).hidden(true).build();
        Base unlockTarget2 = Base.builder().id(unlockTargetId2).game(game).hidden(true).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(null);
        request.setUnlocksBaseIds(List.of(unlockTargetId1, unlockTargetId2));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));
        when(baseRepository.findById(unlockTargetId1)).thenReturn(Optional.of(unlockTarget1));
        when(baseRepository.findById(unlockTargetId2)).thenReturn(Optional.of(unlockTarget2));
        when(challengeRepository.findByUnlocksBasesContaining(unlockTargetId1)).thenReturn(Optional.empty());
        when(challengeRepository.findByUnlocksBasesContaining(unlockTargetId2)).thenReturn(Optional.empty());

        ChallengeResponse response = challengeService.updateChallenge(gameId, challengeId, request);

        assertEquals(2, response.getUnlocksBaseIds().size());
        assertTrue(response.getUnlocksBaseIds().contains(unlockTargetId1));
        assertTrue(response.getUnlocksBaseIds().contains(unlockTargetId2));
        assertEquals(2, challenge.getUnlocksBases().size());
    }

    @Test
    void updateChallengeRejectsUnlockWithoutLocationBound() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID unlockTargetId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(false);
        request.setUnlocksBaseIds(List.of(unlockTargetId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> challengeService.updateChallenge(gameId, challengeId, request)
        );

        assertEquals("Unlock target requires challenge to be location-bound and fixed to a base", ex.getMessage());
    }

    @Test
    void updateChallengeRejectsUnlockWithoutFixedBase() {
        UUID unlockTargetId = UUID.randomUUID();
        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(null);
        request.setUnlocksBaseIds(List.of(unlockTargetId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of());

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> challengeService.updateChallenge(gameId, challengeId, request)
        );

        assertEquals("Unlock target requires challenge to be location-bound and fixed to a base", ex.getMessage());
    }

    @Test
    void updateChallengeClearsUnlockWhenLocationBoundDisabled() {
        UUID fixedBaseId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();
        Base unlockTarget = Base.builder().id(UUID.randomUUID()).game(game).hidden(true).build();
        challenge.getUnlocksBases().add(unlockTarget);

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(false);
        request.setUnlocksBaseIds(null);

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));

        ChallengeResponse response = challengeService.updateChallenge(gameId, challengeId, request);

        assertTrue(response.getUnlocksBaseIds().isEmpty());
        assertTrue(challenge.getUnlocksBases().isEmpty());
    }

    @Test
    void updateChallengeRejectsUnlockTargetThatIsNotHidden() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID unlockTargetId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();
        Base nonHiddenTarget = Base.builder().id(unlockTargetId).game(game).hidden(false).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(null);
        request.setUnlocksBaseIds(List.of(unlockTargetId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));
        when(baseRepository.findById(unlockTargetId)).thenReturn(Optional.of(nonHiddenTarget));

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> challengeService.updateChallenge(gameId, challengeId, request)
        );

        assertEquals("Target base must be hidden to be used as an unlock target", ex.getMessage());
    }

    @Test
    void updateChallengeRejectsUnlockTargetFromDifferentGame() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID unlockTargetId = UUID.randomUUID();
        UUID otherGameId = UUID.randomUUID();
        Game otherGame = Game.builder().id(otherGameId).name("Other Game").description("").build();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();
        Base foreignBase = Base.builder().id(unlockTargetId).game(otherGame).hidden(true).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(null);
        request.setUnlocksBaseIds(List.of(unlockTargetId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));
        when(baseRepository.findById(unlockTargetId)).thenReturn(Optional.of(foreignBase));

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> challengeService.updateChallenge(gameId, challengeId, request)
        );

        assertEquals("Target base does not belong to this game", ex.getMessage());
    }

    @Test
    void updateChallengeRejectsUnlockingOwnFixedBase() {
        UUID fixedBaseId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(true).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(fixedBaseId);
        request.setUnlocksBaseIds(List.of(fixedBaseId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findById(fixedBaseId)).thenReturn(Optional.of(fixedBase));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of());

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> challengeService.updateChallenge(gameId, challengeId, request)
        );

        assertEquals("Cannot unlock the same base the challenge is fixed to", ex.getMessage());
    }

    @Test
    void updateChallengeRejectsUnlockTargetAlreadyClaimedByAnotherChallenge() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID unlockTargetId = UUID.randomUUID();
        UUID otherChallengeId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();
        Base unlockTarget = Base.builder().id(unlockTargetId).game(game).hidden(true).build();
        Challenge otherChallenge = Challenge.builder().id(otherChallengeId).game(game).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(null);
        request.setUnlocksBaseIds(List.of(unlockTargetId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));
        when(baseRepository.findById(unlockTargetId)).thenReturn(Optional.of(unlockTarget));
        when(challengeRepository.findByUnlocksBasesContaining(unlockTargetId)).thenReturn(Optional.of(otherChallenge));

        BadRequestException ex = assertThrows(
                BadRequestException.class,
                () -> challengeService.updateChallenge(gameId, challengeId, request)
        );

        assertEquals("Another challenge already unlocks this base", ex.getMessage());
    }

    @Test
    void updateChallengeReplacesExistingUnlockBasesWithNewList() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID oldUnlockId = UUID.randomUUID();
        UUID newUnlockId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();
        Base oldUnlock = Base.builder().id(oldUnlockId).game(game).hidden(true).build();
        Base newUnlock = Base.builder().id(newUnlockId).game(game).hidden(true).build();
        Set<Base> existing = new HashSet<>();
        existing.add(oldUnlock);
        challenge.getUnlocksBases().addAll(existing);

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(true);
        request.setFixedBaseId(null);
        request.setUnlocksBaseIds(List.of(newUnlockId));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));
        when(baseRepository.findById(newUnlockId)).thenReturn(Optional.of(newUnlock));
        when(challengeRepository.findByUnlocksBasesContaining(newUnlockId)).thenReturn(Optional.empty());

        ChallengeResponse response = challengeService.updateChallenge(gameId, challengeId, request);

        assertEquals(1, response.getUnlocksBaseIds().size());
        assertTrue(response.getUnlocksBaseIds().contains(newUnlockId));
        assertNotNull(challenge.getUnlocksBases());
        assertEquals(1, challenge.getUnlocksBases().size());
        assertTrue(challenge.getUnlocksBases().stream().anyMatch(b -> b.getId().equals(newUnlockId)));
    }

    @Test
    void deleteChallengeRejectsWhenSubmissionsExist() {
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(submissionRepository.countByChallengeId(challengeId)).thenReturn(1L);

        assertThrows(BadRequestException.class, () -> challengeService.deleteChallenge(gameId, challengeId));
        verify(challengeRepository, never()).delete(any(Challenge.class));
    }

    private UpdateChallengeRequest baseRequest() {
        UpdateChallengeRequest request = new UpdateChallengeRequest();
        request.setTitle("Updated challenge");
        request.setDescription("Updated description");
        request.setContent("Updated content");
        request.setCompletionContent("Updated completion");
        request.setAnswerType("text");
        request.setAutoValidate(false);
        request.setCorrectAnswer(null);
        request.setPoints(100);
        request.setLocationBound(true);
        return request;
    }
}
