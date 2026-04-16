package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Authorises a caller to read a file attached to a submission.
 *
 * <p><strong>Security contract.</strong> The previous implementation used a
 * {@code LIKE '%filename%'} substring match against the {@code file_urls} JSON
 * column, which was vulnerable to two problems:
 * <ol>
 *   <li>{@code %} and {@code _} characters in the filename could be used to
 *       broaden the match.</li>
 *   <li>For the operator-facing check, the query was game-scoped but the
 *       submission row being matched on could belong to any team in the game —
 *       fine. For the player-facing check, the substring match against a JSON
 *       blob could in principle match a URL fragment that did not belong to
 *       the player's team because of the lack of exact-URL anchoring.</li>
 * </ol>
 *
 * <p>The fix is to match on exact URL only via {@code file_url IN (:urls)}.
 * The handful of canonical URL shapes we generate for a given (gameId, filename)
 * are enumerated in {@link #fileUrlCandidates(UUID, String)}; any stored URL
 * that is not literally one of those is treated as a different file.
 *
 * <p>If future work requires searching JSON {@code file_urls} arrays (e.g. to
 * retire the legacy {@code file_url} scalar column), the right fix is a
 * normalised {@code submission_files(submission_id, url)} table with a
 * composite index. That migration is deferred as a follow-up; this change
 * closes the cross-team leak without that schema churn.
 */
@Service
@RequiredArgsConstructor
public class FileAccessService {

    private final GameAccessService gameAccessService;
    private final SubmissionRepository submissionRepository;

    @Transactional(readOnly = true)
    public void ensureOperatorCanReadFile(UUID gameId, String filename) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        List<String> candidates = fileUrlCandidates(gameId, filename);
        if (!submissionRepository.existsByGameIdAndFileUrlIn(gameId, candidates)) {
            throw new ResourceNotFoundException("File not found: " + filename);
        }
    }

    @Transactional(readOnly = true)
    public void ensurePlayerCanReadFile(UUID gameId, String filename, Player player) {
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        List<String> candidates = fileUrlCandidates(gameId, filename);
        if (!submissionRepository.existsByTeamIdAndFileUrlIn(player.getTeam().getId(), candidates)) {
            throw new ResourceNotFoundException("File not found: " + filename);
        }
    }

    private List<String> fileUrlCandidates(UUID gameId, String filename) {
        return List.of(
                "/api/games/" + gameId + "/files/" + filename,
                "/api/player/files/" + gameId + "/" + filename,
                "/uploads/" + gameId + "/" + filename
        );
    }
}
