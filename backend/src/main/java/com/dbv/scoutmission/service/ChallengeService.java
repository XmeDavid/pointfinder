package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateChallengeRequest;
import com.dbv.scoutmission.dto.request.UpdateChallengeRequest;
import com.dbv.scoutmission.dto.response.ChallengeResponse;
import com.dbv.scoutmission.entity.AnswerType;
import com.dbv.scoutmission.entity.Challenge;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.ChallengeRepository;
import com.dbv.scoutmission.repository.GameRepository;
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
    private final GameRepository gameRepository;

    @Transactional(readOnly = true)
    public List<ChallengeResponse> getChallengesByGame(UUID gameId) {
        return challengeRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public ChallengeResponse createChallenge(UUID gameId, CreateChallengeRequest request) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        Challenge challenge = Challenge.builder()
                .game(game)
                .title(request.getTitle())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .content(request.getContent() != null ? request.getContent() : "")
                .answerType(AnswerType.valueOf(request.getAnswerType()))
                .autoValidate(request.getAutoValidate() != null ? request.getAutoValidate() : false)
                .correctAnswer(request.getCorrectAnswer())
                .points(request.getPoints())
                .locationBound(request.getLocationBound() != null ? request.getLocationBound() : false)
                .build();

        challenge = challengeRepository.save(challenge);
        return toResponse(challenge);
    }

    @Transactional
    public ChallengeResponse updateChallenge(UUID gameId, UUID challengeId, UpdateChallengeRequest request) {
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));

        challenge.setTitle(request.getTitle());
        challenge.setDescription(request.getDescription() != null ? request.getDescription() : "");
        challenge.setContent(request.getContent() != null ? request.getContent() : "");
        challenge.setAnswerType(AnswerType.valueOf(request.getAnswerType()));
        challenge.setAutoValidate(request.getAutoValidate() != null ? request.getAutoValidate() : false);
        challenge.setCorrectAnswer(request.getCorrectAnswer());
        challenge.setPoints(request.getPoints());
        challenge.setLocationBound(request.getLocationBound() != null ? request.getLocationBound() : false);

        challenge = challengeRepository.save(challenge);
        return toResponse(challenge);
    }

    @Transactional
    public void deleteChallenge(UUID gameId, UUID challengeId) {
        if (!challengeRepository.existsById(challengeId)) {
            throw new ResourceNotFoundException("Challenge", challengeId);
        }
        challengeRepository.deleteById(challengeId);
    }

    private ChallengeResponse toResponse(Challenge c) {
        return ChallengeResponse.builder()
                .id(c.getId())
                .gameId(c.getGame().getId())
                .title(c.getTitle())
                .description(c.getDescription())
                .content(c.getContent())
                .answerType(c.getAnswerType().name())
                .autoValidate(c.getAutoValidate())
                .correctAnswer(c.getCorrectAnswer())
                .points(c.getPoints())
                .locationBound(c.getLocationBound())
                .build();
    }
}
