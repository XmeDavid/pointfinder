package com.prayer.pointfinder.service;

import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.repository.TeamLocationRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Resets player progress data for a game: soft-archives audit-relevant
 * records (submissions, check-ins, activity events) and hard-deletes
 * transient/media artefacts (upload sessions, team locations).
 */
@Service
@RequiredArgsConstructor
public class GameProgressResetService {

    private final SubmissionRepository submissionRepository;
    private final CheckInRepository checkInRepository;
    private final ActivityEventRepository activityEventRepository;
    private final UploadSessionRepository uploadSessionRepository;
    private final TeamLocationRepository teamLocationRepository;

    /**
     * Archive or delete all progress-related data for the given game.
     *
     * <p>Audit-relevant tables (submissions, check-ins, activity events) are
     * soft-archived ({@code archived = true}) so Phase 3 audit export can
     * still read the full history. Media artefacts (upload sessions) and
     * transient positions (team locations) are hard-deleted.</p>
     */
    @Transactional
    public void resetProgress(UUID gameId) {
        // V36: soft-archive audit-relevant tables instead of hard-deleting
        // them. Spec principle: "Avoid hard deletion paths that erase audit
        // trails." Submissions, check-ins, and activity events stay in the
        // database with archived = true; active queries filter them out by
        // default while the Phase 3 audit export reads the full history.
        submissionRepository.markArchivedByGameId(gameId);
        checkInRepository.markArchivedByGameId(gameId);
        activityEventRepository.markArchivedByGameId(gameId);
        // upload_sessions are media artifacts, not audit. Hard delete is OK
        // because completed uploads are tracked separately via the FK on
        // submissions (which is now archived, not deleted, so the linkage
        // stays discoverable).
        uploadSessionRepository.deleteByGameId(gameId);
        // team_locations are transient per-event positions, not audit data.
        // Hard delete remains the right call.
        teamLocationRepository.deleteByGameId(gameId);
    }
}
