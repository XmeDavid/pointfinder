package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateChallengeRequest;
import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.dto.request.UpdateChallengeRequest;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameTag;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.GameTagRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.util.HtmlSanitizer;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChallengeService {

    private final ChallengeRepository challengeRepository;
    private final BaseRepository baseRepository;
    private final SubmissionRepository submissionRepository;
    private final GameAccessService gameAccessService;
    private final GameEventBroadcaster eventBroadcaster;
    private final GameTagRepository gameTagRepository;
    private final ResourceEmbedService resourceEmbedService;

    @Transactional(readOnly = true)
    public List<ChallengeResponse> getChallengesByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return challengeRepository.findByGameIdOrderByOrderIndexAscCreatedAtAsc(gameId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public void reorderChallenges(UUID gameId, ReorderRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        List<UUID> ids = request.getIds();
        for (int i = 0; i < ids.size(); i++) {
            challengeRepository.updateOrderIndex(ids.get(i), gameId, i);
        }
        eventBroadcaster.broadcastGameConfig(gameId, "challenges", "reordered");
    }

    @Transactional(timeout = 10)
    public ChallengeResponse createChallenge(UUID gameId, CreateChallengeRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        long contentSize = (request.getContent() != null ? request.getContent().length() : 0)
                + (request.getCompletionContent() != null ? request.getCompletionContent().length() : 0);
        if (contentSize > 8_000_000) {
            throw new BadRequestException("Combined content and completion content size exceeds the 8 MB limit");
        }

        Challenge challenge = Challenge.builder()
                .game(game)
                .title(request.getTitle())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .content(HtmlSanitizer.sanitize(request.getContent() != null ? request.getContent() : ""))
                .completionContent(HtmlSanitizer.sanitize(request.getCompletionContent() != null ? request.getCompletionContent() : ""))
                .answerType(AnswerType.valueOf(request.getAnswerType()))
                .autoValidate(request.getAutoValidate() != null ? request.getAutoValidate() : false)
                .correctAnswer(request.getCorrectAnswer())
                .points(request.getPoints())
                .locationBound(request.getLocationBound() != null ? request.getLocationBound() : false)
                .requirePresenceToSubmit(request.getRequirePresenceToSubmit() != null ? request.getRequirePresenceToSubmit() : false)
                .operatorNotes(normalizeOperatorNotes(request.getOperatorNotes()))
                .build();

        // Enforce: answerType=none → requirePresenceToSubmit must be false
        if (challenge.getAnswerType() == AnswerType.none) {
            challenge.setRequirePresenceToSubmit(false);
        }

        challenge = challengeRepository.save(challenge);

        // Resolve and link tags
        Set<GameTag> resolvedTags = resolveTagIds(request.getTagIds(), gameId);
        challenge.setTags(resolvedTags);
        challenge = challengeRepository.save(challenge);

        if (request.getFixedBaseId() != null) {
            assignChallengeToBase(challenge, request.getFixedBaseId(), gameId);
        }

        UUID effectiveFixedBaseId = resolveEffectiveFixedBaseId(challenge.getId(), request.getFixedBaseId());
        List<UUID> unlocksBaseIds = normalizeUnlocksBasesRequest(
                request.getLocationBound(),
                effectiveFixedBaseId,
                request.getUnlocksBaseIds()
        );
        handleUnlocksBases(challenge, unlocksBaseIds, gameId, effectiveFixedBaseId);

        resourceEmbedService.syncChallengeEmbeds(challenge.getId(), challenge.getDescription(),
                challenge.getContent(), challenge.getCompletionContent());
        eventBroadcaster.broadcastGameConfig(game.getId(), "challenges", "created");
        return toResponse(challenge);
    }

    @Transactional(timeout = 10)
    public ChallengeResponse updateChallenge(UUID gameId, UUID challengeId, UpdateChallengeRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureChallengeBelongsToGame(challenge, gameId);

        long contentSize = (request.getContent() != null ? request.getContent().length() : 0)
                + (request.getCompletionContent() != null ? request.getCompletionContent().length() : 0);
        if (contentSize > 8_000_000) {
            throw new BadRequestException("Combined content and completion content size exceeds the 8 MB limit");
        }

        challenge.setTitle(request.getTitle());
        challenge.setDescription(request.getDescription() != null ? request.getDescription() : "");
        challenge.setContent(HtmlSanitizer.sanitize(request.getContent() != null ? request.getContent() : ""));
        challenge.setCompletionContent(HtmlSanitizer.sanitize(request.getCompletionContent() != null ? request.getCompletionContent() : ""));
        challenge.setAnswerType(AnswerType.valueOf(request.getAnswerType()));
        challenge.setAutoValidate(request.getAutoValidate() != null ? request.getAutoValidate() : false);
        challenge.setCorrectAnswer(request.getCorrectAnswer());
        challenge.setPoints(request.getPoints());
        challenge.setLocationBound(request.getLocationBound() != null ? request.getLocationBound() : false);
        challenge.setRequirePresenceToSubmit(request.getRequirePresenceToSubmit() != null ? request.getRequirePresenceToSubmit() : false);
        challenge.setOperatorNotes(normalizeOperatorNotes(request.getOperatorNotes()));

        // Always write through tags — null clears all tags
        Set<GameTag> resolvedTags = resolveTagIds(request.getTagIds(), gameId);
        challenge.setTags(resolvedTags);

        // Enforce: answerType=none → requirePresenceToSubmit must be false
        if (challenge.getAnswerType() == AnswerType.none) {
            challenge.setRequirePresenceToSubmit(false);
        }

        challenge = challengeRepository.save(challenge);

        if (request.getFixedBaseId() != null) {
            assignChallengeToBase(challenge, request.getFixedBaseId(), gameId);
        }

        UUID effectiveFixedBaseId = resolveEffectiveFixedBaseId(challenge.getId(), request.getFixedBaseId());
        List<UUID> unlocksBaseIds = normalizeUnlocksBasesRequest(
                request.getLocationBound(),
                effectiveFixedBaseId,
                request.getUnlocksBaseIds()
        );
        handleUnlocksBases(challenge, unlocksBaseIds, gameId, effectiveFixedBaseId);

        resourceEmbedService.syncChallengeEmbeds(challenge.getId(), challenge.getDescription(),
                challenge.getContent(), challenge.getCompletionContent());
        eventBroadcaster.broadcastGameConfig(gameId, "challenges", "updated");
        return toResponse(challenge);
    }

    @Transactional(timeout = 10)
    public void deleteChallenge(UUID gameId, UUID challengeId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Challenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new ResourceNotFoundException("Challenge", challengeId));
        ensureChallengeBelongsToGame(challenge, gameId);
        if (submissionRepository.countByChallengeId(challengeId) > 0) {
            throw new BadRequestException("Cannot delete challenge with existing submissions");
        }
        challengeRepository.delete(challenge);
        eventBroadcaster.broadcastGameConfig(gameId, "challenges", "deleted");
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

    private UUID resolveEffectiveFixedBaseId(UUID challengeId, UUID requestedFixedBaseId) {
        if (requestedFixedBaseId != null) {
            return requestedFixedBaseId;
        }
        return baseRepository.findByFixedChallengeId(challengeId).stream()
                .map(Base::getId)
                .findFirst()
                .orElse(null);
    }

    private List<UUID> normalizeUnlocksBasesRequest(Boolean locationBound, UUID effectiveFixedBaseId, List<UUID> requestedUnlocksBaseIds) {
        boolean isLocationBound = Boolean.TRUE.equals(locationBound);
        List<UUID> ids = requestedUnlocksBaseIds != null ? requestedUnlocksBaseIds : List.of();
        if (!ids.isEmpty() && (!isLocationBound || effectiveFixedBaseId == null)) {
            throw new BadRequestException("Unlock target requires challenge to be location-bound and fixed to a base");
        }
        return isLocationBound && effectiveFixedBaseId != null ? ids : List.of();
    }

    private void handleUnlocksBases(Challenge challenge, List<UUID> unlocksBaseIds, UUID gameId, UUID effectiveFixedBaseId) {
        if (unlocksBaseIds.isEmpty()) {
            if (!challenge.getUnlocksBases().isEmpty()) {
                challenge.getUnlocksBases().clear();
                challengeRepository.save(challenge);
            }
            return;
        }
        if (effectiveFixedBaseId == null) {
            throw new BadRequestException("Unlock target requires challenge to be fixed to a base");
        }

        Set<Base> newUnlocksBases = new LinkedHashSet<>();
        for (UUID unlocksBaseId : unlocksBaseIds) {
            Base targetBase = baseRepository.findById(unlocksBaseId)
                    .orElseThrow(() -> new ResourceNotFoundException("Base", unlocksBaseId));
            if (!targetBase.getGame().getId().equals(gameId)) {
                throw new BadRequestException("Target base does not belong to this game");
            }
            if (!Boolean.TRUE.equals(targetBase.getHidden())) {
                throw new BadRequestException("Target base must be hidden to be used as an unlock target");
            }

            // Ensure target is not the challenge's own fixed base
            if (effectiveFixedBaseId.equals(unlocksBaseId)) {
                throw new BadRequestException("Cannot unlock the same base the challenge is fixed to");
            }

            // Ensure no other challenge already unlocks this base
            challengeRepository.findByUnlocksBasesContaining(unlocksBaseId).ifPresent(existing -> {
                if (!existing.getId().equals(challenge.getId())) {
                    throw new BadRequestException("Another challenge already unlocks this base");
                }
            });

            newUnlocksBases.add(targetBase);
        }

        challenge.getUnlocksBases().clear();
        challenge.getUnlocksBases().addAll(newUnlocksBases);
        challengeRepository.save(challenge);
    }

    private void ensureChallengeBelongsToGame(Challenge challenge, UUID gameId) {
        gameAccessService.ensureBelongsToGame("Challenge", challenge.getGame().getId(), gameId);
    }

    private ChallengeResponse toResponse(Challenge c) {
        List<UUID> unlocksBaseIds = c.getUnlocksBases().stream()
                .map(Base::getId)
                .collect(Collectors.toList());
        List<Base> fixedBases = baseRepository.findByFixedChallengeId(c.getId());
        UUID fixedBaseId = fixedBases.isEmpty() ? null : fixedBases.get(0).getId();
        List<UUID> tagIds = c.getTags().stream()
                .map(GameTag::getId)
                .collect(Collectors.toList());
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
                .requirePresenceToSubmit(c.getRequirePresenceToSubmit())
                .unlocksBaseIds(unlocksBaseIds)
                .fixedBaseId(fixedBaseId)
                .operatorNotes(c.getOperatorNotes())
                .tagIds(tagIds.isEmpty() ? null : tagIds)
                .build();
    }

    /**
     * Normalizes operator notes from a request: null and blank strings
     * collapse to {@code null} so the database stores a single canonical
     * "no notes" representation.
     */
    private String normalizeOperatorNotes(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Resolves a list of tag IDs to GameTag entities, validating they belong
     * to the game. Returns an empty set when the list is null or empty
     * (write-through semantics: null = clear all tags).
     *
     * @throws BadRequestException with code {@code tag.not_in_game} if any
     *   UUID refers to a tag from a different game.
     */
    private Set<GameTag> resolveTagIds(List<UUID> tagIds, UUID gameId) {
        if (tagIds == null || tagIds.isEmpty()) {
            return new HashSet<>();
        }
        Set<GameTag> result = new HashSet<>();
        for (UUID tagId : tagIds) {
            GameTag tag = gameTagRepository.findById(tagId)
                    .orElseThrow(() -> new BadRequestException(
                            "tag.not_in_game: Tag " + tagId + " does not belong to game " + gameId));
            if (!tag.getGame().getId().equals(gameId)) {
                throw new BadRequestException(
                        "tag.not_in_game: Tag " + tagId + " does not belong to game " + gameId);
            }
            result.add(tag);
        }
        return result;
    }
}
