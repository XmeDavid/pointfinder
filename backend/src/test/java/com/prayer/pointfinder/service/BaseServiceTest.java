package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BaseServiceTest {

    @Mock
    private BaseRepository baseRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private GameAccessService gameAccessService;

    @InjectMocks
    private BaseService baseService;

    private UUID gameId;
    private Game game;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        game = Game.builder().id(gameId).name("Game").description("Desc").build();
    }

    @Test
    void updateBaseClearsUnlockWhenTargetBaseIsUnhidden() {
        UUID baseId = UUID.randomUUID();
        Base base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Target")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .hidden(true)
                .nfcLinked(false)
                .requirePresenceToSubmit(false)
                .build();

        Challenge unlocker = Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .locationBound(true)
                .unlocksBase(base)
                .build();

        UpdateBaseRequest request = baseUpdateRequest("Target", false, null);

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(challengeRepository.findByUnlocksBaseId(baseId)).thenReturn(Optional.of(unlocker));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BaseResponse response = baseService.updateBase(gameId, baseId, request);

        assertEquals(false, response.getHidden());
        assertNull(unlocker.getUnlocksBase());
    }

    @Test
    void updateBaseClearsUnlockWhenFixedChallengeIsRemoved() {
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        Base unlockTarget = Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .hidden(true)
                .build();
        Challenge fixedChallenge = Challenge.builder()
                .id(challengeId)
                .game(game)
                .locationBound(true)
                .unlocksBase(unlockTarget)
                .build();
        Base base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Base")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .hidden(false)
                .fixedChallenge(fixedChallenge)
                .nfcLinked(false)
                .requirePresenceToSubmit(false)
                .build();

        UpdateBaseRequest request = baseUpdateRequest("Base", false, null);

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(fixedChallenge));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of());
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        baseService.updateBase(gameId, baseId, request);

        assertNull(fixedChallenge.getUnlocksBase());
    }

    @Test
    void updateBaseClearsUnlockWhenChallengeUnlocksOwnFixedBase() {
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        Base base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Base")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .hidden(true)
                .nfcLinked(false)
                .requirePresenceToSubmit(false)
                .build();

        Challenge challenge = Challenge.builder()
                .id(challengeId)
                .game(game)
                .locationBound(true)
                .unlocksBase(base)
                .build();

        UpdateBaseRequest request = baseUpdateRequest("Base", true, challengeId);

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(base));
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        baseService.updateBase(gameId, baseId, request);

        assertNull(challenge.getUnlocksBase());
    }

    @Test
    void deleteBaseClearsUnlockForDeletedTargetBase() {
        UUID baseId = UUID.randomUUID();
        Base base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Target")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .hidden(true)
                .nfcLinked(false)
                .requirePresenceToSubmit(false)
                .build();

        Challenge unlocker = Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .locationBound(true)
                .unlocksBase(base)
                .build();

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(challengeRepository.findByUnlocksBaseId(baseId)).thenReturn(Optional.of(unlocker));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        baseService.deleteBase(gameId, baseId);

        assertNull(unlocker.getUnlocksBase());
    }

    private UpdateBaseRequest baseUpdateRequest(String name, boolean hidden, UUID fixedChallengeId) {
        UpdateBaseRequest request = new UpdateBaseRequest();
        request.setName(name);
        request.setDescription("Desc");
        request.setLat(1.0);
        request.setLng(2.0);
        request.setHidden(hidden);
        request.setRequirePresenceToSubmit(false);
        request.setNfcLinked(false);
        request.setFixedChallengeId(fixedChallengeId);
        return request;
    }
}
