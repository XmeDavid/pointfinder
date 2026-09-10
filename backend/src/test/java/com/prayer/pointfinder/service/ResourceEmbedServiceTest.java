package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.ResourceResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Resource;
import com.prayer.pointfinder.entity.ResourceType;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.ResourceEmbedRepository;
import com.prayer.pointfinder.repository.ResourceRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

/**
 * The player list and the player download must agree on what a team may see:
 * shared resources, plus embeds in bases the team checked in at and challenges
 * it submitted to. Nothing else, and never another game's resources.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ResourceEmbedServiceTest {

    @Mock private ResourceEmbedRepository resourceEmbedRepository;
    @Mock private ResourceRepository resourceRepository;
    @Mock private BaseRepository baseRepository;
    @Mock private ChallengeRepository challengeRepository;
    @Mock private CheckInRepository checkInRepository;
    @Mock private SubmissionRepository submissionRepository;
    @Mock private ObjectStorageService objectStorageService;

    @InjectMocks private ResourceEmbedService service;

    private final UUID gameId = UUID.randomUUID();
    private final UUID teamId = UUID.randomUUID();
    private Game game;
    private Team team;
    private Resource sharedMap;
    private Resource baseClue;
    private Resource staffRota;
    private Resource otherGameFile;
    private Resource sharedDocument;

    @BeforeEach
    void setUp() {
        game = Game.builder().id(gameId).name("Camp").build();
        team = Team.builder().id(teamId).game(game).name("Falcons").build();
        Game otherGame = Game.builder().id(UUID.randomUUID()).name("Elsewhere").build();

        sharedMap = file("Site map.pdf", game, true);
        baseClue = file("Clue at the mill.jpg", game, false);
        staffRota = file("Staff rota.xlsx", game, false);
        otherGameFile = file("Other map.pdf", otherGame, true);
        sharedDocument = Resource.builder().id(UUID.randomUUID()).game(game).type(ResourceType.document)
                .name("Rules").contentType("text/html").sizeBytes(0L).sharedWithPlayers(true)
                .content("<p>Be kind.</p><span data-resource-id=\"" + sharedMap.getId() + "\"></span>").build();

        for (Resource r : List.of(sharedMap, baseClue, staffRota, otherGameFile, sharedDocument)) {
            when(resourceRepository.findById(r.getId())).thenReturn(Optional.of(r));
        }
        when(resourceRepository.findByGameIdAndSharedWithPlayersTrue(gameId)).thenReturn(List.of(sharedMap, sharedDocument));
        when(checkInRepository.findByGameIdAndTeamId(gameId, teamId)).thenReturn(List.of());
        when(submissionRepository.findByTeamId(teamId)).thenReturn(List.of());
        when(resourceEmbedRepository.findResourceIdsByBaseIdIn(anyList())).thenReturn(List.of());
        when(resourceEmbedRepository.findResourceIdsByChallengeIdIn(anyList())).thenReturn(List.of());
        when(objectStorageService.isEnabled()).thenReturn(true);
        when(objectStorageService.generatePresignedUrl(any())).thenAnswer(inv -> "https://s3/" + inv.getArgument(0));
    }

    private static Resource file(String name, Game game, boolean shared) {
        return Resource.builder().id(UUID.randomUUID()).game(game).type(ResourceType.file).name(name)
                .contentType("application/octet-stream").s3Key("k/" + name).sizeBytes(1234L).sharedWithPlayers(shared).build();
    }

    @Test
    void listsSharedResourcesWithoutOperatorFields() {
        List<ResourceResponse> visible = service.getPlayerVisibleResources(gameId, teamId);

        assertEquals(List.of(sharedMap.getId(), sharedDocument.getId()), visible.stream().map(ResourceResponse::id).toList());
        ResourceResponse map = visible.get(0);
        assertEquals("https://s3/k/Site map.pdf", map.downloadUrl());
        assertNull(map.orgId());
        assertNull(map.folderId());
        assertNull(map.createdBy());
        assertNull(map.content());
    }

    @Test
    void enrichesDocumentContentSoEmbeddedFilesResolve() {
        ResourceResponse rules = service.getPlayerVisibleResources(gameId, teamId).get(1);

        assertTrue(rules.content().contains("data-resource-url=\"https://s3/k/Site map.pdf\""), rules.content());
        assertTrue(rules.content().contains("data-resource-name=\"Site map.pdf\""), rules.content());
    }

    @Test
    void checkedInBaseEmbedsBecomeVisible() {
        Base mill = Base.builder().id(UUID.randomUUID()).game(game).build();
        when(checkInRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of(CheckIn.builder().game(game).team(team).base(mill).build()));
        when(resourceEmbedRepository.findResourceIdsByBaseIdIn(List.of(mill.getId()))).thenReturn(List.of(baseClue.getId()));

        List<UUID> ids = service.getPlayerVisibleResources(gameId, teamId).stream().map(ResourceResponse::id).toList();

        assertEquals(List.of(sharedMap.getId(), sharedDocument.getId(), baseClue.getId()), ids);
        assertEquals("https://s3/k/Clue at the mill.jpg", service.getDownloadUrlForPlayer(gameId, teamId, baseClue.getId()));
    }

    @Test
    void submittedChallengeEmbedsBecomeVisible() {
        Challenge riddle = Challenge.builder().id(UUID.randomUUID()).game(game).build();
        when(submissionRepository.findByTeamId(teamId))
                .thenReturn(List.of(Submission.builder().team(team).challenge(riddle).build()));
        when(resourceEmbedRepository.findResourceIdsByChallengeIdIn(List.of(riddle.getId()))).thenReturn(List.of(baseClue.getId()));

        assertTrue(service.getPlayerVisibleResources(gameId, teamId).stream().anyMatch(r -> r.id().equals(baseClue.getId())));
    }

    @Test
    void submissionsInAnotherGameUnlockNothingHere() {
        Game otherGame = Game.builder().id(UUID.randomUUID()).build();
        Team sameTeamElsewhere = Team.builder().id(teamId).game(otherGame).build();
        Challenge riddle = Challenge.builder().id(UUID.randomUUID()).game(otherGame).build();
        when(submissionRepository.findByTeamId(teamId))
                .thenReturn(List.of(Submission.builder().team(sameTeamElsewhere).challenge(riddle).build()));
        when(resourceEmbedRepository.findResourceIdsByChallengeIdIn(anyList())).thenReturn(List.of(baseClue.getId()));

        assertTrue(service.getPlayerVisibleResources(gameId, teamId).stream().noneMatch(r -> r.id().equals(baseClue.getId())));
    }

    @Test
    void downloadAllowsSharedFiles() {
        assertEquals("https://s3/k/Site map.pdf", service.getDownloadUrlForPlayer(gameId, teamId, sharedMap.getId()));
    }

    @Test
    void downloadDeniesUnsharedUnlockedFiles() {
        assertThrows(ForbiddenException.class, () -> service.getDownloadUrlForPlayer(gameId, teamId, staffRota.getId()));
    }

    @Test
    void downloadDeniesAnotherGamesFileEvenWhenShared() {
        assertThrows(ForbiddenException.class, () -> service.getDownloadUrlForPlayer(gameId, teamId, otherGameFile.getId()));
    }

    @Test
    void downloadRejectsDocumentsBecauseTheyHaveNoFile() {
        assertThrows(BadRequestException.class, () -> service.getDownloadUrlForPlayer(gameId, teamId, sharedDocument.getId()));
    }
}
