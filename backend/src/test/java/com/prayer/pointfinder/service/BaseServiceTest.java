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
    @Mock
    private com.prayer.pointfinder.repository.GameTagRepository gameTagRepository;

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

    // ── Tags (game-scoped tag IDs) ─────────────────────────────────

    @Test
    void createBaseWithTagIdsLinksTagsToBase() {
        UUID tagId1 = UUID.randomUUID();
        UUID tagId2 = UUID.randomUUID();
        com.prayer.pointfinder.entity.GameTag tag1 = com.prayer.pointfinder.entity.GameTag.builder()
                .id(tagId1).game(game).label("trail").color("#3b82f6").build();
        com.prayer.pointfinder.entity.GameTag tag2 = com.prayer.pointfinder.entity.GameTag.builder()
                .id(tagId2).game(game).label("morning").color("#ef4444").build();

        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Trailhead");
        request.setDescription("At the fork in the path");
        request.setLat(47.3769);
        request.setLng(8.5417);
        request.setHidden(false);
        request.setTagIds(List.of(tagId1, tagId2));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(gameTagRepository.findById(tagId1)).thenReturn(Optional.of(tag1));
        when(gameTagRepository.findById(tagId2)).thenReturn(Optional.of(tag2));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> {
            Base saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        BaseResponse response = baseService.createBase(gameId, request);

        assertNotNull(response);
        assertNotNull(response.getTagIds());
        assertEquals(2, response.getTagIds().size());
        assertTrue(response.getTagIds().containsAll(List.of(tagId1, tagId2)));
    }

    @Test
    void updateBaseUpdatesTagIds() {
        UUID tagId = UUID.randomUUID();
        com.prayer.pointfinder.entity.GameTag tag = com.prayer.pointfinder.entity.GameTag.builder()
                .id(tagId).game(game).label("fresh").color("#22c55e").build();

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

        UpdateBaseRequest request = baseUpdateRequest("Base", false, null);
        request.setTagIds(List.of(tagId));

        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BaseResponse response = baseService.updateBase(gameId, baseId, request);

        assertNotNull(response.getTagIds());
        assertTrue(response.getTagIds().contains(tagId));
    }

    @Test
    void createBaseWithNoTagIdsReturnsNullTagIds() {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Tagless");
        request.setDescription("");
        request.setLat(47.3769);
        request.setLng(8.5417);
        request.setHidden(false);
        // tagIds not set — null clears all tags

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> {
            Base saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        BaseResponse response = baseService.createBase(gameId, request);

        assertNull(response.getTagIds());
    }
}
