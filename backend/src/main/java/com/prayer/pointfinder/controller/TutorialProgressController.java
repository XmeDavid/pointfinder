package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.PracticeGameRequest;
import com.prayer.pointfinder.dto.request.UpdateTutorialProgressRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.service.PracticeGameService;
import com.prayer.pointfinder.service.TutorialProgressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Guided-tutorial progress for the calling operator.
 *
 * <p>Role is enforced by {@code SecurityConfig}: {@code /api/users/**} already
 * requires {@code ROLE_ADMIN} or {@code ROLE_OPERATOR}, exactly like
 * {@link UserController}. There is no DELETE — restarting a tutorial is a PUT
 * with {@code status: in_progress} and {@code currentStep: null}.
 */
@RestController
@RequestMapping("/api/users/me/tutorials")
@RequiredArgsConstructor
public class TutorialProgressController {

    private final PracticeGameService practiceGameService;
    private final TutorialProgressService tutorialProgressService;

    @GetMapping
    public ResponseEntity<List<TutorialProgressResponse>> listCurrentUserProgress() {
        return ResponseEntity.ok(tutorialProgressService.listForCurrentUser());
    }

    @PutMapping("/{scenarioId}")
    public ResponseEntity<TutorialProgressResponse> updateCurrentUserProgress(
            @PathVariable String scenarioId,
            @Valid @RequestBody UpdateTutorialProgressRequest request
    ) {
        return ResponseEntity.ok(tutorialProgressService.upsertForCurrentUser(scenarioId, request));
    }

    /**
     * Creates, seeds and binds a practice game for a {@code practice-game}
     * scenario. 409 while the caller already owns a practice game that has not
     * ended.
     */
    @PostMapping("/{scenarioId}/practice-game")
    public ResponseEntity<GameResponse> createPracticeGame(
            @PathVariable String scenarioId,
            @Valid @RequestBody PracticeGameRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(practiceGameService.createForCurrentUser(scenarioId, request));
    }
}
