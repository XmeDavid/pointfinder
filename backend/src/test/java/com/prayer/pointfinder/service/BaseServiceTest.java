package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
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

import java.util.*;
import java.util.Optional;
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
class BaseServiceTest {

    @Mock
    private BaseRepository baseRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private GameEventBroadcaster eventBroadcaster;

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
                .build();

        Challenge unlocker = Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .locationBound(true)
                .unlocksBases(new HashSet<>(Set.of(base)))
                .build();

        UpdateBaseRequest request = baseUpdateRequest("Target", false, null);

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(challengeRepository.findByUnlocksBasesContaining(baseId)).thenReturn(Optional.of(unlocker));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BaseResponse response = baseService.updateBase(gameId, baseId, request);

        assertEquals(false, response.getHidden());
        assertTrue(unlocker.getUnlocksBases().isEmpty());
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
                .unlocksBases(new HashSet<>(Set.of(unlockTarget)))
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
                .build();

        UpdateBaseRequest request = baseUpdateRequest("Base", false, null);

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(fixedChallenge));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of());
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        baseService.updateBase(gameId, baseId, request);

        assertTrue(fixedChallenge.getUnlocksBases().isEmpty());
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
                .build();

        Challenge challenge = Challenge.builder()
                .id(challengeId)
                .game(game)
                .locationBound(true)
                .unlocksBases(new HashSet<>(Set.of(base)))
                .build();

        UpdateBaseRequest request = baseUpdateRequest("Base", true, challengeId);

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(baseRepository.findByFixedChallengeId(challengeId)).thenReturn(List.of(base));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        baseService.updateBase(gameId, baseId, request);

        assertTrue(challenge.getUnlocksBases().isEmpty());
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
                .build();

        Challenge unlocker = Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .locationBound(true)
                .unlocksBases(new HashSet<>(Set.of(base)))
                .build();

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(challengeRepository.findByUnlocksBasesContaining(baseId)).thenReturn(Optional.of(unlocker));
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> invocation.getArgument(0));

        baseService.deleteBase(gameId, baseId);

        assertTrue(unlocker.getUnlocksBases().isEmpty());
    }

    @Test
    void deleteBaseRejectsWhenSubmissionsExist() {
        UUID baseId = UUID.randomUUID();
        Base base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Base")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .hidden(false)
                .nfcLinked(false)
                .build();

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(submissionRepository.countByBaseId(baseId)).thenReturn(1L);

        assertThrows(BadRequestException.class, () -> baseService.deleteBase(gameId, baseId));
        verify(baseRepository, never()).delete(any(Base.class));
    }

    private UpdateBaseRequest baseUpdateRequest(String name, boolean hidden, UUID fixedChallengeId) {
        UpdateBaseRequest request = new UpdateBaseRequest();
        request.setName(name);
        request.setDescription("Desc");
        request.setLat(1.0);
        request.setLng(2.0);
        request.setHidden(hidden);
        request.setNfcLinked(false);
        request.setFixedChallengeId(fixedChallengeId);
        return request;
    }

    // ── P1 Phase 4 W3: operator-only base tags and color ─────────────

    @Test
    void createBasePersistsTagsAndColor() {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Trailhead");
        request.setDescription("At the fork in the path");
        request.setLat(47.3769);
        request.setLng(8.5417);
        request.setHidden(false);
        request.setTags(List.of("trail", "morning", "scenic"));
        request.setColor("#3b82f6");

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> {
            Base saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        BaseResponse response = baseService.createBase(gameId, request);

        assertNotNull(response);
        assertNotNull(response.getTags());
        assertEquals(List.of("trail", "morning", "scenic"), response.getTags());
        assertEquals("#3b82f6", response.getColor());
    }

    @Test
    void updateBaseUpdatesTagsAndColor() {
        UUID baseId = UUID.randomUUID();
        Base base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Base")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .hidden(false)
                .nfcLinked(false)
                .tags(List.of("old-tag"))
                .color("#ef4444")
                .build();

        UpdateBaseRequest request = baseUpdateRequest("Base", false, null);
        request.setTags(List.of("fresh", "new-pair"));
        request.setColor("#22c55e");

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BaseResponse response = baseService.updateBase(gameId, baseId, request);

        assertEquals(List.of("fresh", "new-pair"), response.getTags());
        assertEquals("#22c55e", response.getColor());
        assertEquals(List.of("fresh", "new-pair"), base.getTags());
        assertEquals("#22c55e", base.getColor());
    }

    @Test
    void createBaseNormalizesEmptyTagsToNull() {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Tagless");
        request.setDescription("");
        request.setLat(47.3769);
        request.setLng(8.5417);
        request.setHidden(false);
        request.setTags(List.of()); // empty list collapses to null
        request.setColor("   "); // blank color collapses to null

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> {
            Base saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        BaseResponse response = baseService.createBase(gameId, request);

        assertNull(response.getTags());
        assertNull(response.getColor());
    }
}
