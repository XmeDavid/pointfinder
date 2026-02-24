package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class GameSchedulerService {

    private final GameRepository gameRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final ChunkedUploadService chunkedUploadService;

    /**
     * Runs every 60 seconds to check for live games that have passed their end date
     * and automatically transitions them to ended.
     */
    @Scheduled(fixedRate = 60000)
    @Transactional
    public void autoEndGames() {
        List<Game> expiredGames = gameRepository.findByStatusAndEndDateBefore(
                GameStatus.live, Instant.now());

        for (Game game : expiredGames) {
            log.info("Auto-ending game '{}' (id={}) - end date {} has passed",
                    game.getName(), game.getId(), game.getEndDate());
            game.setStatus(GameStatus.ended);
            gameRepository.save(game);
        }
    }

    /**
     * Runs every hour to purge expired refresh tokens from the database.
     */
    @Scheduled(fixedRate = 3600000)
    @Transactional
    public void purgeExpiredRefreshTokens() {
        int deleted = refreshTokenRepository.deleteExpiredBefore(Instant.now());
        if (deleted > 0) {
            log.info("Purged {} expired refresh tokens", deleted);
        }
    }

    /**
     * Runs every 15 minutes to expire stale chunk upload sessions and clean temporary chunk files.
     */
    @Scheduled(fixedRate = 900000)
    @Transactional
    public void expireStaleChunkUploadSessions() {
        int expired = chunkedUploadService.expireStaleSessions();
        if (expired > 0) {
            log.info("Expired {} stale chunk upload sessions", expired);
        }
    }
}
