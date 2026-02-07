package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateBaseRequest;
import com.dbv.scoutmission.dto.request.UpdateBaseRequest;
import com.dbv.scoutmission.dto.response.BaseResponse;
import com.dbv.scoutmission.entity.Base;
import com.dbv.scoutmission.entity.Challenge;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.BaseRepository;
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
public class BaseService {

    private final BaseRepository baseRepository;
    private final GameRepository gameRepository;
    private final ChallengeRepository challengeRepository;

    @Transactional(readOnly = true)
    public List<BaseResponse> getBasesByGame(UUID gameId) {
        return baseRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public BaseResponse createBase(UUID gameId, CreateBaseRequest request) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));

        Challenge fixedChallenge = null;
        if (request.getFixedChallengeId() != null) {
            fixedChallenge = challengeRepository.findById(request.getFixedChallengeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getFixedChallengeId()));
        }

        Base base = Base.builder()
                .game(game)
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .lat(request.getLat())
                .lng(request.getLng())
                .nfcLinked(false)
                .fixedChallenge(fixedChallenge)
                .build();

        base = baseRepository.save(base);
        return toResponse(base);
    }

    @Transactional
    public BaseResponse updateBase(UUID gameId, UUID baseId, UpdateBaseRequest request) {
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));

        base.setName(request.getName());
        base.setDescription(request.getDescription() != null ? request.getDescription() : "");
        base.setLat(request.getLat());
        base.setLng(request.getLng());

        if (request.getNfcLinked() != null) {
            base.setNfcLinked(request.getNfcLinked());
        }

        if (request.getFixedChallengeId() != null) {
            Challenge challenge = challengeRepository.findById(request.getFixedChallengeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getFixedChallengeId()));
            base.setFixedChallenge(challenge);
        } else {
            base.setFixedChallenge(null);
        }

        base = baseRepository.save(base);
        return toResponse(base);
    }

    @Transactional
    public BaseResponse setNfcLinked(UUID gameId, UUID baseId, boolean linked) {
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        base.setNfcLinked(linked);
        base = baseRepository.save(base);
        return toResponse(base);
    }

    @Transactional
    public void deleteBase(UUID gameId, UUID baseId) {
        if (!baseRepository.existsById(baseId)) {
            throw new ResourceNotFoundException("Base", baseId);
        }
        baseRepository.deleteById(baseId);
    }

    private BaseResponse toResponse(Base base) {
        return BaseResponse.builder()
                .id(base.getId())
                .gameId(base.getGame().getId())
                .name(base.getName())
                .description(base.getDescription())
                .lat(base.getLat())
                .lng(base.getLng())
                .nfcLinked(base.getNfcLinked())
                .fixedChallengeId(base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null)
                .build();
    }
}
