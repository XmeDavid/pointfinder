package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
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

import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
        if (base.getFixedChallenge() != null) {
            enforceChallengeUnlockGuardrails(base.getFixedChallenge().getId());
        }
        return toResponse(base);
    }

    @Transactional
    public BaseResponse updateBase(UUID gameId, UUID baseId, UpdateBaseRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBaseBelongsToGame(base, gameId);
        boolean wasHidden = Boolean.TRUE.equals(base.getHidden());
        UUID previousFixedChallengeId = base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null;

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
        if (wasHidden && !Boolean.TRUE.equals(base.getHidden())) {
            clearUnlockTarget(base.getId());
        }

        Set<UUID> impactedChallengeIds = new HashSet<>();
        if (previousFixedChallengeId != null) {
            impactedChallengeIds.add(previousFixedChallengeId);
        }
        if (base.getFixedChallenge() != null) {
            impactedChallengeIds.add(base.getFixedChallenge().getId());
        }
        impactedChallengeIds.forEach(this::enforceChallengeUnlockGuardrails);

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
        UUID fixedChallengeId = base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null;
        clearUnlockTarget(base.getId());
        baseRepository.delete(base);
        if (fixedChallengeId != null) {
            enforceChallengeUnlockGuardrails(fixedChallengeId);
        }
    }

    private void clearUnlockTarget(UUID targetBaseId) {
        challengeRepository.findByUnlocksBaseId(targetBaseId).ifPresent(challenge -> {
            challenge.setUnlocksBase(null);
            challengeRepository.save(challenge);
        });
    }

    private void enforceChallengeUnlockGuardrails(UUID challengeId) {
        challengeRepository.findById(challengeId).ifPresent(challenge -> {
            if (challenge.getUnlocksBase() == null) {
                return;
            }

            List<Base> fixedBases = baseRepository.findByFixedChallengeId(challengeId);
            UUID unlockTargetBaseId = challenge.getUnlocksBase().getId();

            boolean hasFixedBase = !fixedBases.isEmpty();
            boolean unlocksOwnFixedBase = fixedBases.stream()
                    .anyMatch(base -> base.getId().equals(unlockTargetBaseId));
            boolean locationBound = Boolean.TRUE.equals(challenge.getLocationBound());
            boolean targetHidden = Boolean.TRUE.equals(challenge.getUnlocksBase().getHidden());

            if (!locationBound || !hasFixedBase || unlocksOwnFixedBase || !targetHidden) {
                challenge.setUnlocksBase(null);
                challengeRepository.save(challenge);
            }
        });
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
