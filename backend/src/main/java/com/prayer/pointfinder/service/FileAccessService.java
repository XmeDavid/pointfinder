package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FileAccessService {

    private final GameAccessService gameAccessService;
    private final SubmissionRepository submissionRepository;

    @Transactional(readOnly = true)
    public void ensureOperatorCanReadFile(UUID gameId, String filename) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        if (!submissionRepository.existsByTeamGameIdAndFileUrlIn(gameId, fileUrlCandidates(gameId, filename))) {
            throw new ResourceNotFoundException("File not found: " + filename);
        }
    }

    @Transactional(readOnly = true)
    public void ensurePlayerCanReadFile(UUID gameId, String filename, Player player) {
        gameAccessService.ensurePlayerBelongsToGame(player, gameId);
        if (!submissionRepository.existsByTeamIdAndFileUrlIn(player.getTeam().getId(), fileUrlCandidates(gameId, filename))) {
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

