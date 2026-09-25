package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.UploadAttentionResponse;
import com.prayer.pointfinder.entity.UploadSession;
import com.prayer.pointfinder.repository.UploadSessionChunkRepository;
import com.prayer.pointfinder.repository.UploadSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * OW-18: uploads an operator should act on, for one game. A transfer is
 * stalled when it is active but received nothing for
 * {@code app.uploads.stalled-threshold-minutes}; an upload is unlinked when it
 * finished more than {@code app.uploads.needs-attention-threshold-minutes} ago
 * and no answer claimed it. Read-only: nothing is expired, deleted or linked
 * here, because the player's app still holds the work and resumes it.
 */
@Service
@RequiredArgsConstructor
public class UploadAttentionService {

    private final UploadSessionRepository sessionRepository;
    private final UploadSessionChunkRepository chunkRepository;
    private final GameAccessService gameAccessService;

    @Value("${app.uploads.stalled-threshold-minutes:30}")
    private long stalledThresholdMinutes;

    @Value("${app.uploads.needs-attention-threshold-minutes:15}")
    private long needsAttentionThresholdMinutes;

    public Instant stalledCutoff(Instant now) {
        return now.minus(Duration.ofMinutes(stalledThresholdMinutes));
    }

    @Transactional(readOnly = true)
    public List<UploadAttentionResponse> list(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Instant now = Instant.now();
        List<UploadAttentionResponse> rows = new ArrayList<>();
        for (UploadSession s : sessionRepository.findStalledByGameId(gameId, now, stalledCutoff(now))) {
            Instant lastChunk = chunkRepository.lastChunkAt(s.getId());
            rows.add(row(s, "stalled", chunkRepository.sumReceivedBytes(s.getId()), lastChunk != null ? lastChunk : s.getCreatedAt()));
        }
        Instant unlinkedCutoff = now.minus(Duration.ofMinutes(needsAttentionThresholdMinutes));
        for (UploadSession s : sessionRepository.findNeedsAttentionByGameId(gameId, unlinkedCutoff)) {
            rows.add(row(s, "unlinked", s.getTotalSizeBytes(), s.getCompletedAt()));
        }
        rows.sort(Comparator.comparing(UploadAttentionResponse::since));
        return rows;
    }

    private static UploadAttentionResponse row(UploadSession s, String kind, long received, Instant since) {
        var player = s.getPlayer();
        var team = player.getTeam();
        return new UploadAttentionResponse(s.getId(), kind, team.getId(), team.getName(), player.getDisplayName(),
                s.getOriginalFileName(), s.getTotalSizeBytes(), received, since);
    }
}
