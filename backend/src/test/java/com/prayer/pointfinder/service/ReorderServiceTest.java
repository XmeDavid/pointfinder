package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.GameTagRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReorderServiceTest {

    @Mock BaseRepository baseRepository;
    @Mock ChallengeRepository challengeRepository;
    @Mock SubmissionRepository submissionRepository;
    @Mock GameAccessService gameAccessService;
    @Mock GameEventBroadcaster eventBroadcaster;
    @Mock GameTagRepository gameTagRepository;
    @Mock ResourceEmbedService resourceEmbedService;

    UUID gameId;
    Game game;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        game = Game.builder().id(gameId).name("Game").description("Desc").build();
    }

    @Nested
    class BaseReorder {

        BaseService baseService;

        @BeforeEach
        void init() {
            baseService = new BaseService(
                    baseRepository,
                    challengeRepository,
                    submissionRepository,
                    gameAccessService,
                    eventBroadcaster,
                    gameTagRepository,
                    resourceEmbedService
            );
        }

        @Test
        void callsUpdateOrderIndexForEachIdInOrder() {
            UUID id0 = UUID.randomUUID();
            UUID id1 = UUID.randomUUID();
            UUID id2 = UUID.randomUUID();

            ReorderRequest req = new ReorderRequest();
            req.setIds(List.of(id0, id1, id2));

            baseService.reorderBases(gameId, req);

            verify(baseRepository).updateOrderIndex(id0, gameId, 0);
            verify(baseRepository).updateOrderIndex(id1, gameId, 1);
            verify(baseRepository).updateOrderIndex(id2, gameId, 2);
            verify(eventBroadcaster).broadcastGameConfig(gameId, "bases", "reordered");
        }

        @Test
        void emptyList_doesNotCallUpdateButStillBroadcasts() {
            ReorderRequest req = new ReorderRequest();
            req.setIds(List.of());

            baseService.reorderBases(gameId, req);

            verify(baseRepository, never()).updateOrderIndex(any(), any(), anyInt());
            verify(eventBroadcaster).broadcastGameConfig(gameId, "bases", "reordered");
        }
    }

    @Nested
    class ChallengeReorder {

        ChallengeService challengeService;

        @BeforeEach
        void init() {
            challengeService = new ChallengeService(
                    challengeRepository,
                    baseRepository,
                    submissionRepository,
                    gameAccessService,
                    eventBroadcaster,
                    gameTagRepository,
                    resourceEmbedService
            );
        }

        @Test
        void callsUpdateOrderIndexForEachIdInOrder() {
            UUID id0 = UUID.randomUUID();
            UUID id1 = UUID.randomUUID();

            ReorderRequest req = new ReorderRequest();
            req.setIds(List.of(id0, id1));

            challengeService.reorderChallenges(gameId, req);

            verify(challengeRepository).updateOrderIndex(id0, gameId, 0);
            verify(challengeRepository).updateOrderIndex(id1, gameId, 1);
            verify(eventBroadcaster).broadcastGameConfig(gameId, "challenges", "reordered");
        }

        @Test
        void singleItem_setsOrderIndexZero() {
            UUID id0 = UUID.randomUUID();

            ReorderRequest req = new ReorderRequest();
            req.setIds(List.of(id0));

            challengeService.reorderChallenges(gameId, req);

            verify(challengeRepository).updateOrderIndex(id0, gameId, 0);
            verify(eventBroadcaster).broadcastGameConfig(gameId, "challenges", "reordered");
        }
    }
}
