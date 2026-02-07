package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateSubmissionRequest;
import com.dbv.scoutmission.dto.request.ReviewSubmissionRequest;
import com.dbv.scoutmission.dto.response.SubmissionResponse;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.*;
import com.dbv.scoutmission.security.SecurityUtils;
import com.dbv.scoutmission.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
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
    private final ActivityEventRepository activityEventRepository;
    private final GameEventBroadcaster eventBroadcaster;

    @Transactional(readOnly = true)
    public List<SubmissionResponse> getSubmissionsByGame(UUID gameId) {
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
        Team team = teamRepository.findById(request.getTeamId())
                .orElseThrow(() -> new ResourceNotFoundException("Team", request.getTeamId()));
        Challenge challenge = challengeRepository.findById(request.getChallengeId())
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getChallengeId()));
        Base base = baseRepository.findById(request.getBaseId())
                .orElseThrow(() -> new ResourceNotFoundException("Base", request.getBaseId()));

        // Determine initial status - auto-validate text answers if configured
        SubmissionStatus status = SubmissionStatus.pending;
        if (challenge.getAutoValidate() && challenge.getAnswerType() == AnswerType.text
                && challenge.getCorrectAnswer() != null) {
            status = challenge.getCorrectAnswer().equalsIgnoreCase(request.getAnswer().trim())
                    ? SubmissionStatus.correct
                    : SubmissionStatus.incorrect;
        }

        Submission submission = Submission.builder()
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer(request.getAnswer() != null ? request.getAnswer() : "")
                .status(status)
                .submittedAt(Instant.now())
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

        // Broadcast via WebSocket
        eventBroadcaster.broadcastActivityEvent(gameId, event);

        return toResponse(submission);
    }

    @Transactional
    public SubmissionResponse reviewSubmission(UUID gameId, UUID submissionId, ReviewSubmissionRequest request) {
        Submission submission = submissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Submission", submissionId));

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

        eventBroadcaster.broadcastActivityEvent(gameId, event);

        return toResponse(submission);
    }

    private SubmissionResponse toResponse(Submission s) {
        return SubmissionResponse.builder()
                .id(s.getId())
                .teamId(s.getTeam().getId())
                .challengeId(s.getChallenge().getId())
                .baseId(s.getBase().getId())
                .answer(s.getAnswer())
                .status(s.getStatus().name())
                .submittedAt(s.getSubmittedAt())
                .reviewedBy(s.getReviewedBy() != null ? s.getReviewedBy().getId() : null)
                .feedback(s.getFeedback())
                .build();
    }
}
