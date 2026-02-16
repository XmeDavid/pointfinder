package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateChallengeRequest;
import com.prayer.pointfinder.dto.request.UpdateChallengeRequest;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChallengeService {

    private final ChallengeRepository challengeRepository;
    private final BaseRepository baseRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<ChallengeResponse> getChallengesByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return challengeRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public ChallengeResponse createChallenge(UUID gameId, CreateChallengeRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        Challenge challenge = Challenge.builder()
                .game(game)
                .title(request.getTitle())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .content(request.getContent() != null ? request.getContent() : "")
                .completionContent(request.getCompletionContent() != null ? request.getCompletionContent() : "")
                .answerType(AnswerType.valueOf(request.getAnswerType()))
                .autoValidate(request.getAutoValidate() != null ? request.getAutoValidate() : false)
                .correctAnswer(request.getCorrectAnswer())
                .points(request.getPoints())
                .locationBound(request.getLocationBound() != null ? request.getLocationBound() : false)
                .build();

        challenge = challengeRepository.save(challenge);

        if (request.getFixedBaseId() != null) {
            assignChallengeToBase(challenge, request.getFixedBaseId(), gameId);
        }

        return toResponse(challenge);
    }

    @Transactional
    public ChallengeResponse updateChallenge(UUID gameId, UUID challengeId, UpdateChallengeRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureChallengeBelongsToGame(challenge, gameId);

        challenge.setTitle(request.getTitle());
        challenge.setDescription(request.getDescription() != null ? request.getDescription() : "");
        challenge.setContent(request.getContent() != null ? request.getContent() : "");
        challenge.setCompletionContent(request.getCompletionContent() != null ? request.getCompletionContent() : "");
        challenge.setAnswerType(AnswerType.valueOf(request.getAnswerType()));
        challenge.setAutoValidate(request.getAutoValidate() != null ? request.getAutoValidate() : false);
        challenge.setCorrectAnswer(request.getCorrectAnswer());
        challenge.setPoints(request.getPoints());
        challenge.setLocationBound(request.getLocationBound() != null ? request.getLocationBound() : false);

        challenge = challengeRepository.save(challenge);

        if (request.getFixedBaseId() != null) {
            assignChallengeToBase(challenge, request.getFixedBaseId(), gameId);
        }

        return toResponse(challenge);
    }

    @Transactional
    public void deleteChallenge(UUID gameId, UUID challengeId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureChallengeBelongsToGame(challenge, gameId);
        challengeRepository.delete(challenge);
    }

    private void assignChallengeToBase(Challenge challenge, UUID baseId, UUID gameId) {
        Base targetBase = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        if (!targetBase.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Base does not belong to this game");
        }
        if (targetBase.getFixedChallenge() != null
                && !targetBase.getFixedChallenge().getId().equals(challenge.getId())) {
            throw new BadRequestException("Base already has a different fixed challenge assigned");
        }

        // Clear any previous base that had this challenge as fixed
        List<Base> previousBases = baseRepository.findByFixedChallengeId(challenge.getId());
        for (Base prev : previousBases) {
            if (!prev.getId().equals(baseId)) {
                prev.setFixedChallenge(null);
                baseRepository.save(prev);
            }
        }

        targetBase.setFixedChallenge(challenge);
        baseRepository.save(targetBase);
    }

    private void ensureChallengeBelongsToGame(Challenge challenge, UUID gameId) {
        if (!challenge.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Challenge does not belong to this game");
        }
    }

    private ChallengeResponse toResponse(Challenge c) {
        return ChallengeResponse.builder()
                .id(c.getId())
                .gameId(c.getGame().getId())
                .title(c.getTitle())
                .description(c.getDescription())
                .content(c.getContent())
                .completionContent(c.getCompletionContent())
                .answerType(c.getAnswerType().name())
                .autoValidate(c.getAutoValidate())
                .correctAnswer(c.getCorrectAnswer())
                .points(c.getPoints())
                .locationBound(c.getLocationBound())
                .build();
    }
}
