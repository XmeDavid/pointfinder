package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateSubmissionRequest;
import com.dbv.scoutmission.dto.request.ReviewSubmissionRequest;
import com.dbv.scoutmission.dto.response.SubmissionResponse;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ForbiddenException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.*;
import com.dbv.scoutmission.security.SecurityUtils;
import com.dbv.scoutmission.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final TeamRepository teamRepository;
    private final ChallengeRepository challengeRepository;
    private final BaseRepository baseRepository;
    private final UserRepository userRepository;
    private final ActivityEventRepository activityEventRepository;
    private final GameEventBroadcaster eventBroadcaster;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<SubmissionResponse> getSubmissionsByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return submissionRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SubmissionResponse> getSubmissionsByTeam(UUID teamId) {
        return submissionRepository.findByTeamId(teamId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public SubmissionResponse createSubmission(UUID gameId, CreateSubmissionRequest request) {
        ensureCallerCanCreateSubmission(gameId, request.getTeamId());

        // Check for idempotency - if submission with this key exists, return it
        if (request.getIdempotencyKey() != null) {
            var existing = submissionRepository.findByIdempotencyKey(request.getIdempotencyKey());
            if (existing.isPresent()) {
                Submission sub = existing.get();
                ensureBelongsToGame(sub.getTeam().getGame().getId(), gameId, "Submission");
                // Initialize lazy proxies before returning
                sub.getTeam().getId();
                sub.getChallenge().getId();
                sub.getBase().getId();
                return toResponse(sub);
            }
        }

        Team team = teamRepository.findById(request.getTeamId())
                .orElseThrow(() -> new ResourceNotFoundException("Team", request.getTeamId()));
        Challenge challenge = challengeRepository.findById(request.getChallengeId())
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getChallengeId()));
        Base base = baseRepository.findById(request.getBaseId())
                .orElseThrow(() -> new ResourceNotFoundException("Base", request.getBaseId()));
        ensureBelongsToGame(team.getGame().getId(), gameId, "Team");
        ensureBelongsToGame(challenge.getGame().getId(), gameId, "Challenge");
        ensureBelongsToGame(base.getGame().getId(), gameId, "Base");

        // Force initialization of lazy proxies within this transaction
        team.getName();
        team.getGame().getId();
        challenge.getTitle();
        base.getName();

        // Determine initial status - auto-validate text answers if configured
        SubmissionStatus status = SubmissionStatus.pending;
        if (challenge.getAutoValidate() && challenge.getAnswerType() == AnswerType.text
                && challenge.getCorrectAnswer() != null) {
            String providedAnswer = request.getAnswer() != null ? request.getAnswer().trim() : "";
            status = challenge.getCorrectAnswer().equalsIgnoreCase(providedAnswer)
                    ? SubmissionStatus.correct
                    : SubmissionStatus.incorrect;
        }

        Submission submission = Submission.builder()
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer(request.getAnswer() != null ? request.getAnswer() : "")
                .fileUrl(request.getFileUrl())
                .status(status)
                .submittedAt(Instant.now())
                .idempotencyKey(request.getIdempotencyKey())
                .build();

        submission = submissionRepository.save(submission);

        // Create activity event
        ActivityEvent event = ActivityEvent.builder()
                .game(team.getGame())
                .type(ActivityEventType.submission)
                .team(team)
                .base(base)
                .challenge(challenge)
                .message(team.getName() + " submitted answer for " + challenge.getTitle())
                .timestamp(Instant.now())
                .build();
        activityEventRepository.save(event);

        // Initialize lazy relationships before broadcasting (fixes LazyInitializationException)
        event.getGame().getId();
        event.getTeam().getId();
        if (event.getBase() != null) event.getBase().getId();
        if (event.getChallenge() != null) event.getChallenge().getId();

        // Broadcast via WebSocket
        eventBroadcaster.broadcastActivityEvent(gameId, event);

        return toResponse(submission);
    }

    @Transactional
    public SubmissionResponse reviewSubmission(UUID gameId, UUID submissionId, ReviewSubmissionRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Submission submission = submissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Submission", submissionId));
        ensureBelongsToGame(submission.getTeam().getGame().getId(), gameId, "Submission");

        // Force initialization of lazy proxies within this transaction
        submission.getTeam().getName();
        submission.getTeam().getGame().getId();
        submission.getBase().getName();
        submission.getChallenge().getTitle();

        SubmissionStatus newStatus;
        try {
            newStatus = SubmissionStatus.valueOf(request.getStatus());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid status: " + request.getStatus());
        }

        if (newStatus != SubmissionStatus.approved && newStatus != SubmissionStatus.rejected) {
            throw new BadRequestException("Review status must be 'approved' or 'rejected'");
        }

        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction to get fresh entity with proper session
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        submission.setStatus(newStatus);
        submission.setReviewedBy(currentUser);
        submission.setFeedback(request.getFeedback());

        submission = submissionRepository.save(submission);

        // Create activity event for the review
        ActivityEventType eventType = newStatus == SubmissionStatus.approved
                ? ActivityEventType.approval : ActivityEventType.rejection;
        String action = newStatus == SubmissionStatus.approved ? "approved" : "rejected";

        ActivityEvent event = ActivityEvent.builder()
                .game(submission.getTeam().getGame())
                .type(eventType)
                .team(submission.getTeam())
                .base(submission.getBase())
                .challenge(submission.getChallenge())
                .message(submission.getTeam().getName() + "'s submission for "
                        + submission.getChallenge().getTitle() + " was " + action)
                .timestamp(Instant.now())
                .build();
        activityEventRepository.save(event);

        // Initialize lazy relationships before broadcasting (fixes LazyInitializationException)
        event.getGame().getId();
        event.getTeam().getId();
        if (event.getBase() != null) event.getBase().getId();
        if (event.getChallenge() != null) event.getChallenge().getId();

        eventBroadcaster.broadcastActivityEvent(gameId, event);

        return toResponse(submission);
    }

    private void ensureCallerCanCreateSubmission(UUID gameId, UUID teamId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new ForbiddenException("Authentication is required");
        }

        Object principal = auth.getPrincipal();
        if (principal instanceof User) {
            gameAccessService.ensureCurrentUserCanAccessGame(gameId);
            return;
        }

        if (principal instanceof Player player) {
            gameAccessService.ensurePlayerBelongsToGame(player, gameId);
            if (!player.getTeam().getId().equals(teamId)) {
                throw new ForbiddenException("Player cannot create submissions for another team");
            }
            return;
        }

        throw new ForbiddenException("Unauthorized principal for submission creation");
    }

    private void ensureBelongsToGame(UUID entityGameId, UUID expectedGameId, String entityName) {
        if (!entityGameId.equals(expectedGameId)) {
            throw new BadRequestException(entityName + " does not belong to this game");
        }
    }

    private SubmissionResponse toResponse(Submission s) {
        return SubmissionResponse.builder()
                .id(s.getId())
                .teamId(s.getTeam().getId())
                .challengeId(s.getChallenge().getId())
                .baseId(s.getBase().getId())
                .answer(s.getAnswer())
                .fileUrl(s.getFileUrl())
                .status(s.getStatus().name())
                .submittedAt(s.getSubmittedAt())
                .reviewedBy(s.getReviewedBy() != null ? s.getReviewedBy().getId() : null)
                .feedback(s.getFeedback())
                .completionContent(s.getChallenge().getCompletionContent())
                .build();
    }
}
