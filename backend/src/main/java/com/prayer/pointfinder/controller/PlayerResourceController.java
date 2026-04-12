package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.ResourceResponse;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.ResourceEmbedService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/player/games/{gameId}")
@RequiredArgsConstructor
public class PlayerResourceController {

    private final ResourceEmbedService resourceEmbedService;
    private final CheckInRepository checkInRepository;
    private final SubmissionRepository submissionRepository;

    @GetMapping("/files")
    public ResponseEntity<List<ResourceResponse>> getPlayerFiles(@PathVariable UUID gameId) {
        Player player = SecurityUtils.getCurrentPlayer();
        UUID teamId = player.getTeam().getId();

        List<UUID> unlockedBaseIds = checkInRepository.findByGameIdAndTeamId(gameId, teamId)
                .stream()
                .map(c -> c.getBase().getId())
                .collect(Collectors.toList());

        List<UUID> unlockedChallengeIds = submissionRepository.findByTeamId(teamId)
                .stream()
                .filter(s -> s.getTeam().getGame().getId().equals(gameId))
                .map(s -> s.getChallenge().getId())
                .distinct()
                .collect(Collectors.toList());

        return ResponseEntity.ok(
                resourceEmbedService.getPlayerVisibleResources(gameId, unlockedBaseIds, unlockedChallengeIds));
    }

    @GetMapping("/resources/{resourceId}/download")
    public ResponseEntity<Void> downloadResource(
            @PathVariable UUID gameId,
            @PathVariable UUID resourceId) {
        String url = resourceEmbedService.getDownloadUrlForPlayer(gameId, resourceId);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header("Location", url)
                .header("Cache-Control", "private, max-age=3500")
                .build();
    }
}
