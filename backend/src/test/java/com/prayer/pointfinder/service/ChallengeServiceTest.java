package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateChallengeRequest;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChallengeServiceTest {

    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private GameAccessService gameAccessService;

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
        request.setUnlocksBaseId(unlockTargetId);

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));
        when(baseRepository.findById(unlockTargetId)).thenReturn(Optional.of(unlockTarget));
        when(challengeRepository.findByUnlocksBaseId(unlockTargetId)).thenReturn(Optional.empty());

        ChallengeResponse response = challengeService.updateChallenge(gameId, challengeId, request);

        assertEquals(unlockTargetId, response.getUnlocksBaseId());
        assertEquals(unlockTargetId, challenge.getUnlocksBase().getId());
    }

    @Test
    void updateChallengeRejectsUnlockWithoutLocationBound() {
        UUID fixedBaseId = UUID.randomUUID();
        UUID unlockTargetId = UUID.randomUUID();
        Base fixedBase = Base.builder().id(fixedBaseId).game(game).hidden(false).build();

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(false);
        request.setUnlocksBaseId(unlockTargetId);

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
        request.setUnlocksBaseId(unlockTargetId);

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
        challenge.setUnlocksBase(unlockTarget);

        UpdateChallengeRequest request = baseRequest();
        request.setLocationBound(false);
        request.setUnlocksBaseId(null);

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(fixedBase));

        ChallengeResponse response = challengeService.updateChallenge(gameId, challengeId, request);

        assertNull(response.getUnlocksBaseId());
        assertNull(challenge.getUnlocksBase());
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
