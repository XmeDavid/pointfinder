package com.dbv.scoutmission.service;

import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.GameStatus;
import com.dbv.scoutmission.repository.GameRepository;
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
}
