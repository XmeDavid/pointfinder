package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.SubmissionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileAccessServiceTest {

    @Mock
    private GameAccessService gameAccessService;

    @Mock
    private SubmissionRepository submissionRepository;

    @InjectMocks
    private FileAccessService fileAccessService;

    @Test
    void operatorCanReadFileWhenGameIsAccessibleAndFileIsReferenced() {
        UUID gameId = UUID.randomUUID();
        String filename = UUID.randomUUID() + ".jpg";

        when(submissionRepository.existsByTeamGameIdAndFileUrlIn(eq(gameId), anyList()))
                .thenReturn(true);

        assertDoesNotThrow(() -> fileAccessService.ensureOperatorCanReadFile(gameId, filename));

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        ArgumentCaptor<List<String>> urlsCaptor = ArgumentCaptor.forClass(List.class);
        verify(submissionRepository).existsByTeamGameIdAndFileUrlIn(eq(gameId), urlsCaptor.capture());
        List<String> urls = urlsCaptor.getValue();
        assertTrue(urls.contains("/api/games/" + gameId + "/files/" + filename));
        assertTrue(urls.contains("/uploads/" + gameId + "/" + filename));
    }

    @Test
    void operatorReadIsRejectedWhenFileIsNotReferencedByAnySubmissionInGame() {
        UUID gameId = UUID.randomUUID();
        String filename = UUID.randomUUID() + ".jpg";

        when(submissionRepository.existsByTeamGameIdAndFileUrlIn(eq(gameId), anyList()))
                .thenReturn(false);

        assertThrows(ResourceNotFoundException.class,
                () -> fileAccessService.ensureOperatorCanReadFile(gameId, filename));
    }

    @Test
    void playerCanReadOnlyOwnTeamFileWithinOwnGame() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        String filename = UUID.randomUUID() + ".jpg";
        Player player = Player.builder()
                .team(Team.builder().id(teamId).build())
                .build();

        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(player, gameId);
        when(submissionRepository.existsByTeamIdAndFileUrlIn(eq(teamId), anyList()))
                .thenReturn(true);

        assertDoesNotThrow(() -> fileAccessService.ensurePlayerCanReadFile(gameId, filename, player));
        verify(gameAccessService).ensurePlayerBelongsToGame(player, gameId);
        verify(submissionRepository).existsByTeamIdAndFileUrlIn(eq(teamId), anyList());
    }

    @Test
    void playerReadIsRejectedWhenFileIsNotOwnedByPlayersTeam() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        String filename = UUID.randomUUID() + ".jpg";
        Player player = Player.builder()
                .team(Team.builder().id(teamId).build())
                .build();

        doNothing().when(gameAccessService).ensurePlayerBelongsToGame(player, gameId);
        when(submissionRepository.existsByTeamIdAndFileUrlIn(eq(teamId), anyList()))
                .thenReturn(false);

        assertThrows(ResourceNotFoundException.class,
                () -> fileAccessService.ensurePlayerCanReadFile(gameId, filename, player));
    }

    @Test
    void playerReadStopsBeforeLookupWhenPlayerDoesNotBelongToGame() {
        UUID gameId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        Player player = Player.builder()
                .team(Team.builder().id(teamId).build())
                .build();

        doThrow(new ForbiddenException("Player does not belong to this game"))
                .when(gameAccessService)
                .ensurePlayerBelongsToGame(player, gameId);

        assertThrows(ForbiddenException.class,
                () -> fileAccessService.ensurePlayerCanReadFile(gameId, "file.jpg", player));
        verify(submissionRepository, never()).existsByTeamIdAndFileUrlIn(eq(teamId), anyList());
    }
}

