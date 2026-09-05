package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Upload linkage belongs to SubmissionService after the service extraction. */
@ExtendWith(MockitoExtension.class)
class SubmissionUploadLinkageTest {
    @Mock private SubmissionRepository submissionRepository;
    @Mock private UploadSessionRepository uploadSessionRepository;
    @InjectMocks private SubmissionService submissionService;

    @Test
    void linksMatchingUploadSessionsToSubmission() {
        LinkageFixture f = new LinkageFixture();
        String fileUrl = "/api/games/" + f.gameId + "/files/video-1.mp4";

        UploadSession matching = newCompletedUploadSession(f.gameId, f.playerId, fileUrl);
        UploadSession unrelated = newCompletedUploadSession(f.gameId, f.playerId,
                "/api/games/" + f.gameId + "/files/other.mp4");

        SubmissionResponse stubResponse = new SubmissionResponse(
                f.submissionId,
                f.teamId,
                f.challengeId,
                f.baseId,
                null,
                fileUrl,
                List.of(fileUrl),
                "pending",
                Instant.now(),
                null,
                null,
                null,
                null);

        wireLinkageMocks(f, stubResponse, List.of(matching, unrelated));

        submissionService.linkUploadSessionsToSubmission(stubResponse, f.gameId, f.playerId);


        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<UploadSession>> captor = ArgumentCaptor.forClass(Iterable.class);
        verify(uploadSessionRepository).saveAll(captor.capture());
        List<UploadSession> saved = new ArrayList<>();
        captor.getValue().forEach(saved::add);
        assertEquals(1, saved.size(), "only the matching session should be linked");
        assertEquals(matching.getId(), saved.get(0).getId());
        assertNotNull(matching.getSubmission());
        assertEquals(f.submissionId, matching.getSubmission().getId());
        // The unrelated session must remain untouched.
        assertNull(unrelated.getSubmission());
    }

    @Test
    void linksMultipleUploadSessionsForMultiMediaSubmission() {
        LinkageFixture f = new LinkageFixture();
        String url1 = "/api/games/" + f.gameId + "/files/video-1.mp4";
        String url2 = "/api/games/" + f.gameId + "/files/photo-2.jpg";

        UploadSession session1 = newCompletedUploadSession(f.gameId, f.playerId, url1);
        UploadSession session2 = newCompletedUploadSession(f.gameId, f.playerId, url2);
        UploadSession irrelevant = newCompletedUploadSession(f.gameId, f.playerId,
                "/api/games/" + f.gameId + "/files/stale-video.mp4");

        SubmissionResponse stubResponse = new SubmissionResponse(
                f.submissionId,
                f.teamId,
                f.challengeId,
                f.baseId,
                null,
                url1,
                List.of(url1, url2),
                "pending",
                Instant.now(),
                null,
                null,
                null,
                null);

        wireLinkageMocks(f, stubResponse, List.of(session1, session2, irrelevant));

        submissionService.linkUploadSessionsToSubmission(stubResponse, f.gameId, f.playerId);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<UploadSession>> captor = ArgumentCaptor.forClass(Iterable.class);
        verify(uploadSessionRepository).saveAll(captor.capture());
        List<UploadSession> saved = new ArrayList<>();
        captor.getValue().forEach(saved::add);
        assertEquals(2, saved.size(), "both matching sessions should be linked in one batch");
        assertTrue(saved.stream().anyMatch(s -> s.getId().equals(session1.getId())));
        assertTrue(saved.stream().anyMatch(s -> s.getId().equals(session2.getId())));
        assertNotNull(session1.getSubmission());
        assertNotNull(session2.getSubmission());
        assertNull(irrelevant.getSubmission());
    }

    @Test
    void textOnlySubmissionDoesNotLinkUploads() {
        LinkageFixture f = new LinkageFixture();
        // Legacy path: a text-only submission with no file URLs at all. No upload
        // linkage is possible; the submission must still succeed and the FK
        // population code path must be a complete no-op.
        SubmissionResponse stubResponse = new SubmissionResponse(
                f.submissionId,
                f.teamId,
                f.challengeId,
                f.baseId,
                null,
                null,
                null,
                "pending",
                Instant.now(),
                null,
                null,
                null,
                null);

        wireLinkageMocks(f, stubResponse, List.of());

        submissionService.linkUploadSessionsToSubmission(stubResponse, f.gameId, f.playerId);

        // When there is nothing to link, saveAll must not be called at all —
        // the service must not write empty batches.
        verify(uploadSessionRepository, never()).saveAll(any(Iterable.class));
    }

    @Test
    void linkageIsIdempotent() {
        LinkageFixture f = new LinkageFixture();
        String fileUrl = "/api/games/" + f.gameId + "/files/video-idem.mp4";

        UploadSession matching = newCompletedUploadSession(f.gameId, f.playerId, fileUrl);

        SubmissionResponse stubResponse = new SubmissionResponse(
                f.submissionId,
                f.teamId,
                f.challengeId,
                f.baseId,
                null,
                fileUrl,
                List.of(fileUrl),
                "pending",
                Instant.now(),
                null,
                null,
                null,
                null);

        // Simulate the repository view: first call sees it unlinked; subsequent
        // calls see it linked (the mock updates the candidate list dynamically).
        List<UploadSession> candidateList = new ArrayList<>();
        candidateList.add(matching);
        wireLinkageMocks(f, stubResponse, candidateList);
        // After the first call "persists" the linkage, the next call should
        // find the session already linked and skip it.
        when(uploadSessionRepository.findCompletedUnlinkedByPlayerAndGame(f.playerId, f.gameId))
                .thenAnswer(inv -> {
                    if (matching.getSubmission() != null) {
                        return List.of(); // emulates the WHERE submission IS NULL predicate
                    }
                    return List.of(matching);
                });

        submissionService.linkUploadSessionsToSubmission(stubResponse, f.gameId, f.playerId);
        submissionService.linkUploadSessionsToSubmission(stubResponse, f.gameId, f.playerId);

        // First call links once; the second call must be a complete no-op,
        // never re-saving the session or calling getReferenceById a second
        // time.
        verify(uploadSessionRepository, times(1)).saveAll(any(Iterable.class));
        verify(submissionRepository, times(1)).getReferenceById(f.submissionId);
        assertNotNull(matching.getSubmission());
        assertEquals(f.submissionId, matching.getSubmission().getId());
    }

    // ── test fixture helpers for upload session linkage tests ──────────

    private UploadSession newCompletedUploadSession(UUID gameId, UUID playerId, String fileUrl) {
        Game game = Game.builder().id(gameId).build();
        Player player = Player.builder().id(playerId).build();
        return UploadSession.builder()
                .id(UUID.randomUUID())
                .game(game)
                .player(player)
                .contentType("video/mp4")
                .totalSizeBytes(8L)
                .chunkSizeBytes(4)
                .totalChunks(2)
                .status(UploadSessionStatus.completed)
                .fileUrl(fileUrl)
                .expiresAt(Instant.now().plusSeconds(3600))
                .completedAt(Instant.now().minusSeconds(30))
                .build();
    }

    private static final class LinkageFixture {
        final UUID gameId = UUID.randomUUID();
        final UUID teamId = UUID.randomUUID();
        final UUID playerId = UUID.randomUUID();
        final UUID baseId = UUID.randomUUID();
        final UUID challengeId = UUID.randomUUID();
        final UUID submissionId = UUID.randomUUID();
        final Submission submissionEntity = Submission.builder().id(submissionId).build();
    }

    private void wireLinkageMocks(LinkageFixture f, SubmissionResponse response, List<UploadSession> candidates) {
        if (response.fileUrl() == null && (response.fileUrls() == null || response.fileUrls().isEmpty())) return;
        when(uploadSessionRepository.findCompletedUnlinkedByPlayerAndGame(f.playerId, f.gameId))
                .thenReturn(new ArrayList<>(candidates));
        if (!candidates.isEmpty()) when(submissionRepository.getReferenceById(f.submissionId)).thenReturn(f.submissionEntity);
    }
}
