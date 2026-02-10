package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateBaseRequest;
import com.dbv.scoutmission.dto.request.UpdateBaseRequest;
import com.dbv.scoutmission.dto.response.BaseResponse;
import com.dbv.scoutmission.entity.Base;
import com.dbv.scoutmission.entity.Challenge;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.BaseRepository;
import com.dbv.scoutmission.repository.ChallengeRepository;
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
    private final ChallengeRepository challengeRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<BaseResponse> getBasesByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return baseRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public BaseResponse createBase(UUID gameId, CreateBaseRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        Challenge fixedChallenge = null;
        if (request.getFixedChallengeId() != null) {
            fixedChallenge = challengeRepository.findById(request.getFixedChallengeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getFixedChallengeId()));
            ensureChallengeBelongsToGame(fixedChallenge, gameId);
        }

        Base base = Base.builder()
                .game(game)
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .lat(request.getLat())
                .lng(request.getLng())
                .nfcLinked(false)
                .requirePresenceToSubmit(request.getRequirePresenceToSubmit() != null ? request.getRequirePresenceToSubmit() : false)
                .hidden(request.getHidden() != null ? request.getHidden() : false)
                .fixedChallenge(fixedChallenge)
                .build();

        base = baseRepository.save(base);
        return toResponse(base);
    }

    @Transactional
    public BaseResponse updateBase(UUID gameId, UUID baseId, UpdateBaseRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBaseBelongsToGame(base, gameId);

        base.setName(request.getName());
        base.setDescription(request.getDescription() != null ? request.getDescription() : "");
        base.setLat(request.getLat());
        base.setLng(request.getLng());

        if (request.getNfcLinked() != null) {
            base.setNfcLinked(request.getNfcLinked());
        }

        if (request.getRequirePresenceToSubmit() != null) {
            base.setRequirePresenceToSubmit(request.getRequirePresenceToSubmit());
        }

        if (request.getHidden() != null) {
            base.setHidden(request.getHidden());
        }

        if (request.getFixedChallengeId() != null) {
            Challenge challenge = challengeRepository.findById(request.getFixedChallengeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getFixedChallengeId()));
            ensureChallengeBelongsToGame(challenge, gameId);
            base.setFixedChallenge(challenge);
        } else {
            base.setFixedChallenge(null);
        }

        base = baseRepository.save(base);
        return toResponse(base);
    }

    @Transactional
    public BaseResponse setNfcLinked(UUID gameId, UUID baseId, boolean linked) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBaseBelongsToGame(base, gameId);
        base.setNfcLinked(linked);
        base = baseRepository.save(base);
        return toResponse(base);
    }

    @Transactional
    public void deleteBase(UUID gameId, UUID baseId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBaseBelongsToGame(base, gameId);
        baseRepository.delete(base);
    }

    private void ensureBaseBelongsToGame(Base base, UUID gameId) {
        if (!base.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Base does not belong to this game");
        }
    }

    private void ensureChallengeBelongsToGame(Challenge challenge, UUID gameId) {
        if (!challenge.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Challenge does not belong to this game");
        }
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
                .requirePresenceToSubmit(base.getRequirePresenceToSubmit())
                .hidden(base.getHidden())
                .fixedChallengeId(base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null)
                .build();
    }
}
