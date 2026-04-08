package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.BaseProgressResponse;
import com.prayer.pointfinder.dto.response.LeaderboardEntry;
import com.prayer.pointfinder.dto.response.OperatorSnapshotResponse;
import com.prayer.pointfinder.dto.response.PlayerSnapshotResponse;
import com.prayer.pointfinder.dto.response.UploadSessionResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.SubmissionStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.entity.UploadSessionStatus;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

/**
 * Builds the canonical snapshot responses for
 * {@code GET /api/games/{gameId}/snapshot}.
 *
 * <p>The snapshot is the safety net for when realtime fails. Any client —
 * player or operator — can call it to reconcile its local cache with
 * server truth after a missed event, network drop, app foreground, or screen
 * focus. Realtime events stay the fast invalidation channel; the snapshot is
 * the canonical "give me everything right now" call.
 *
 * <p><strong>Player vs operator shape.</strong> Players and operators see
 * different data because players in PointFinder never see scores. The player
 * snapshot response carries NO points, NO team score, and NO leaderboard —
 * this is enforced structurally by
 * {@link PlayerSnapshotResponse}. Operators see the full leaderboard,
 * per-team scores, pending-review counters, and upload observability.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * (P0 Track 2 Slice 1).
 */
@Service
@RequiredArgsConstructor
public class GameSnapshotService {

    /**
     * Upper bound on the number of recent submissions a player snapshot
     * carries. The snapshot is a recovery call, not an audit export — a
     * player only needs enough history to reconcile pending uploads and
     * recent review decisions.
     */
    private static final int PLAYER_SUBMISSION_LIMIT = 100;

    private static final int PLAYER_UPLOAD_SESSION_LIMIT = 100;

    private final GameRepository gameRepository;
    private final TeamRepository teamRepository;
    private final PlayerRepository playerRepository;
    private final SubmissionRepository submissionRepository;
    private final UploadSessionRepository uploadSessionRepository;
    private final PlayerService playerService;
    private final MonitoringService monitoringService;
    private final GameAccessService gameAccessService;

    @Value("${app.uploads.needs-attention-threshold-minutes:15}")
    private long needsAttentionThresholdMinutes;

    /**
     * Builds a player-scoped snapshot. Caller MUST have already verified the
     * player belongs to {@code gameId} via
     * {@link GameAccessService#ensurePlayerBelongsToGame(Player, UUID)} — the
     * service re-asserts this to make the security invariant explicit at the
     * snapshot seam.
     */
    @Transactional(readOnly = true)
    public PlayerSnapshotResponse buildPlayerSnapshot(UUID gameId, Player authPlayer) {
        Player player = playerRepository.findById(authPlayer.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Player", authPlayer.getId()));
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        Team team = player.getTeam();
        // Force lazy proxy initialization within this transaction
        team.getId();
        team.getName();

        long stateVersion = readStateVersion(gameId);
        Instant now = Instant.now();

        List<BaseProgressResponse> progress = playerService.getProgress(gameId, authPlayer);

        List<Submission> recentSubmissions = submissionRepository.findRecentByTeamId(
                team.getId(), PageRequest.of(0, PLAYER_SUBMISSION_LIMIT));
        List<PlayerSnapshotResponse.PlayerSubmissionSummary> submissionSummaries = recentSubmissions.stream()
                .map(this::toPlayerSubmissionSummary)
                .toList();

        List<UploadSessionResponse> uploadSessions = buildPlayerUploadSessionSummaries(
                gameId, player.getId(), now);

        long memberCount = playerRepository.countByTeamId(team.getId());

        return PlayerSnapshotResponse.builder()
                .stateVersion(stateVersion)
                .serverTime(now)
                .game(PlayerSnapshotResponse.GameInfo.builder()
                        .id(game.getId())
                        .name(game.getName())
                        .description(game.getDescription())
                        .status(game.getStatus().name())
                        .unlockTrigger(game.getUnlockTrigger().name())
                        .tileSource(game.getTileSource())
                        .startDate(game.getStartDate())
                        .endDate(game.getEndDate())
                        .build())
                .team(PlayerSnapshotResponse.TeamInfo.builder()
                        .id(team.getId())
                        .name(team.getName())
                        .color(team.getColor())
                        .memberCount((int) memberCount)
                        .build())
                .progress(progress)
                .submissions(submissionSummaries)
                .uploadSessions(uploadSessions)
                .build();
    }

    /**
     * Builds an operator-scoped snapshot. Caller MUST have already verified
     * the current user can access the game via
     * {@link GameAccessService#ensureCurrentUserCanAccessGame(UUID)}.
     */
    @Transactional(readOnly = true)
    public OperatorSnapshotResponse buildOperatorSnapshot(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        long stateVersion = readStateVersion(gameId);
        Instant now = Instant.now();

        List<LeaderboardEntry> leaderboard = monitoringService.computeLeaderboard(gameId);

        List<Team> teams = teamRepository.findByGameId(gameId);
        List<OperatorSnapshotResponse.TeamInfo> teamInfos = teams.stream()
                .map(team -> {
                    long score = leaderboard.stream()
                            .filter(entry -> entry.getTeamId().equals(team.getId()))
                            .mapToLong(LeaderboardEntry::getPoints)
                            .findFirst()
                            .orElse(0L);
                    long memberCount = playerRepository.countByTeamId(team.getId());
                    return OperatorSnapshotResponse.TeamInfo.builder()
                            .id(team.getId())
                            .name(team.getName())
                            .color(team.getColor())
                            .score(score)
                            .memberCount((int) memberCount)
                            .build();
                })
                .toList();

        long pendingReviews = submissionRepository.countByGameIdAndStatus(gameId, SubmissionStatus.pending);
        long activeUploads = uploadSessionRepository.countActiveSessionsByGameId(gameId, now);
        long needsAttention = uploadSessionRepository.countNeedsAttentionByGameId(
                gameId,
                now.minus(Duration.ofMinutes(needsAttentionThresholdMinutes))
        );

        return OperatorSnapshotResponse.builder()
                .stateVersion(stateVersion)
                .serverTime(now)
                .game(OperatorSnapshotResponse.GameInfo.builder()
                        .id(game.getId())
                        .name(game.getName())
                        .description(game.getDescription())
                        .status(game.getStatus().name())
                        .unlockTrigger(game.getUnlockTrigger().name())
                        .tileSource(game.getTileSource())
                        .startDate(game.getStartDate())
                        .endDate(game.getEndDate())
                        .uniformAssignment(game.getUniformAssignment())
                        .broadcastEnabled(game.getBroadcastEnabled())
                        .broadcastCode(game.getBroadcastCode())
                        .build())
                .teams(teamInfos)
                .leaderboard(leaderboard)
                .pendingReviews((int) pendingReviews)
                .activeUploads((int) activeUploads)
                .needsAttention((int) needsAttention)
                .build();
    }

    /**
     * Reads the current state_version through a native query so we do NOT
     * hit the JPA first-level cache. This matters because
     * {@code GameEventBroadcaster.incrementStateVersion} writes via a native
     * UPDATE that Hibernate does not track, and reading via
     * {@code game.getStateVersion()} on a stale managed entity could return
     * the pre-bump value.
     */
    private long readStateVersion(UUID gameId) {
        Long stored = gameRepository.findStateVersionById(gameId);
        return stored != null ? stored : 0L;
    }

    private PlayerSnapshotResponse.PlayerSubmissionSummary toPlayerSubmissionSummary(Submission submission) {
        // Deliberately NOT setting points. Players do not see scores.
        return PlayerSnapshotResponse.PlayerSubmissionSummary.builder()
                .id(submission.getId())
                .baseId(submission.getBase() != null ? submission.getBase().getId() : null)
                .challengeId(submission.getChallenge() != null ? submission.getChallenge().getId() : null)
                .status(submission.getStatus() != null ? submission.getStatus().name() : null)
                .submittedAt(submission.getSubmittedAt())
                .fileUrl(submission.getFileUrl())
                .fileUrls(submission.getFileUrls())
                .build();
    }

    /**
     * Pulls the player's recoverable upload sessions (active + completed)
     * for this game and maps them into the shared {@link UploadSessionResponse}
     * shape. The mapping deliberately matches {@code ChunkedUploadService}
     * so the client can merge snapshot rows into its existing session list
     * without a separate adapter. Note that this list does not carry any
     * team-score data — sessions only know about file metadata, not points.
     */
    private List<UploadSessionResponse> buildPlayerUploadSessionSummaries(
            UUID gameId, UUID playerId, Instant now
    ) {
        List<UploadSession> sessions = uploadSessionRepository.findRecoverableSessionsForPlayerInGame(
                gameId,
                playerId,
                UploadSessionStatus.active,
                UploadSessionStatus.completed,
                now,
                PageRequest.of(0, PLAYER_UPLOAD_SESSION_LIMIT)
        );
        return sessions.stream()
                .map(this::toUploadSessionResponse)
                .toList();
    }

    /**
     * Private mapper intentionally duplicated from ChunkedUploadService's
     * private {@code buildResponse}. We do NOT reach into the uploaded-chunk
     * files or increment the "resumed" counter here — snapshot assembly is a
     * read-only view, not a resume event. For completed sessions the full
     * chunk list is synthesized from {@code totalChunks}; for active sessions
     * the chunk list is intentionally empty (the client already knows its own
     * chunk progress from the per-session GET endpoint).
     */
    private UploadSessionResponse toUploadSessionResponse(UploadSession session) {
        List<Integer> uploadedChunks = session.getStatus() == UploadSessionStatus.completed
                ? IntStream.range(0, session.getTotalChunks()).boxed().toList()
                : List.of();
        return UploadSessionResponse.builder()
                .sessionId(session.getId())
                .gameId(session.getGame().getId())
                .mediaItemKey(session.getMediaItemKey())
                .originalFileName(session.getOriginalFileName())
                .contentType(session.getContentType())
                .totalSizeBytes(session.getTotalSizeBytes())
                .chunkSizeBytes(session.getChunkSizeBytes())
                .totalChunks(session.getTotalChunks())
                .uploadedChunks(uploadedChunks)
                .status(session.getStatus().name())
                .fileUrl(session.getFileUrl())
                .expiresAt(session.getExpiresAt())
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .completedAt(session.getCompletedAt())
                .build();
    }
}
