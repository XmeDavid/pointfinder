package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameTag;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.GameTagRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BaseService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static String generateNfcToken() {
        String chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            sb.append(chars.charAt(SECURE_RANDOM.nextInt(chars.length())));
        }
        return sb.toString();
    }

    private final BaseRepository baseRepository;
    private final com.prayer.pointfinder.repository.GameRepository gameRepository;
    private final BaseOrderService baseOrderService;
    private final ChallengeRepository challengeRepository;
    private final SubmissionRepository submissionRepository;
    private final GameAccessService gameAccessService;
    private final GameEventBroadcaster eventBroadcaster;
    private final GameTagRepository gameTagRepository;
    private final ResourceEmbedService resourceEmbedService;

    @Transactional(readOnly = true)
    public List<BaseResponse> getBasesByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        List<Base> bases = baseRepository.findByGameIdOrderByOrderIndexAscCreatedAtAsc(gameId).stream()
                .sorted(BaseOrderService.ROUTE_ORDER).toList();
        java.util.Map<UUID, Integer> numbers = new java.util.HashMap<>();
        if (!bases.isEmpty() && Boolean.TRUE.equals(bases.getFirst().getGame().getEnforceBaseOrder())) {
            for (int i = 0; i < bases.size(); i++) numbers.put(bases.get(i).getId(), i + 1);
        }
        return bases.stream().map(base -> toResponse(base, numbers.get(base.getId()))).toList();
    }

    @Transactional(timeout = 10)
    public void reorderBases(UUID gameId, ReorderRequest request) {
        Game game = lockAccessibleGame(gameId);
        requireSetup(game);
        if (!Boolean.TRUE.equals(game.getEnforceBaseOrder())) {
            throw new BadRequestException("Enable base order before arranging the route",
                    com.prayer.pointfinder.exception.ErrorCode.BASE_ORDER_DISABLED);
        }
        List<UUID> ids = request.getIds();
        Set<UUID> expected = baseRepository.findByGameId(gameId).stream()
                .map(Base::getId).collect(Collectors.toSet());
        if (ids == null || ids.size() != expected.size() || !new HashSet<>(ids).equals(expected)) {
            throw new BadRequestException("Route must contain every game base exactly once",
                    com.prayer.pointfinder.exception.ErrorCode.BASE_ORDER_INVALID);
        }
        for (int i = 0; i < ids.size(); i++) {
            baseRepository.updateOrderIndex(ids.get(i), gameId, i);
        }
        eventBroadcaster.broadcastGameConfig(gameId, "bases", "reordered");
    }

    @Transactional(timeout = 10)
    public BaseResponse createBase(UUID gameId, CreateBaseRequest request) {
        Game game = lockAccessibleGame(gameId);
        if (Boolean.TRUE.equals(game.getEnforceBaseOrder())) requireSetup(game);

        Challenge fixedChallenge = null;
        if (request.getFixedChallengeId() != null) {
            fixedChallenge = challengeRepository.findById(request.getFixedChallengeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Challenge", request.getFixedChallengeId()));
            ensureChallengeBelongsToGame(fixedChallenge, gameId);
        }

        CheckInMethod checkInMethod = request.getCheckInMethod() != null
                ? parseCheckInMethod(request.getCheckInMethod())
                : (game.getDefaultCheckInMethod() != null ? game.getDefaultCheckInMethod() : CheckInMethod.NFC);
        Integer checkInRadiusM = clampRadius(request.getCheckInRadiusM());
        requireUsableCoordinates(checkInMethod, request.getLat(), request.getLng());

        Base base = Base.builder()
                .game(game)
                .orderIndex(baseRepository.findByGameId(gameId).stream()
                        .mapToInt(Base::getOrderIndex).max().orElse(-1) + 1)
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .lat(request.getLat())
                .lng(request.getLng())
                .nfcLinked(false)
                .nfcToken(generateNfcToken())
                .hidden(request.getHidden() != null ? request.getHidden() : false)
                .fixedChallenge(fixedChallenge)
                .checkInMethod(checkInMethod)
                .checkInRadiusM(checkInRadiusM)
                .build();

        base = baseRepository.save(base);

        // Resolve and link tags
        Set<GameTag> resolvedTags = resolveTagIds(request.getTagIds(), gameId);
        base.setTags(resolvedTags);
        base = baseRepository.save(base);

        if (base.getFixedChallenge() != null) {
            Challenge fc = base.getFixedChallenge();
            if (!Boolean.TRUE.equals(fc.getLocationBound())) {
                fc.setLocationBound(true);
                challengeRepository.save(fc);
            }
            enforceChallengeUnlockGuardrails(fc.getId());
        }
        resourceEmbedService.syncBaseEmbeds(base.getId(), base.getDescription());
        eventBroadcaster.broadcastGameConfig(gameId, "bases", "created");
        return toResponse(base);
    }

    @Transactional(timeout = 10)
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
        if (request.getCheckInMethod() != null) {
            base.setCheckInMethod(parseCheckInMethod(request.getCheckInMethod()));
        }
        if (request.getCheckInRadiusM() != null) {
            base.setCheckInRadiusM(clampRadius(request.getCheckInRadiusM()));
        }
        requireUsableCoordinates(base.getCheckInMethod(), request.getLat(), request.getLng());

        if (request.getNfcLinked() != null) {
            base.setNfcLinked(request.getNfcLinked());
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

        // Stage assignment — write through (null clears)
        base.setStageId(request.getStageId());

        // Always write through tags — null clears all tags
        Set<GameTag> resolvedTags = resolveTagIds(request.getTagIds(), gameId);
        base.setTags(resolvedTags);

        base = baseRepository.save(base);
        if (wasHidden && !Boolean.TRUE.equals(base.getHidden())) {
            clearUnlockTarget(base.getId());
        }

        // Sync locationBound on the new fixed challenge
        if (base.getFixedChallenge() != null) {
            Challenge fc = base.getFixedChallenge();
            if (!Boolean.TRUE.equals(fc.getLocationBound())) {
                fc.setLocationBound(true);
                challengeRepository.save(fc);
            }
        }

        // If the previous fixed challenge was removed or changed, clear locationBound if no other base uses it
        if (previousFixedChallengeId != null &&
                (base.getFixedChallenge() == null || !previousFixedChallengeId.equals(base.getFixedChallenge().getId()))) {
            challengeRepository.findById(previousFixedChallengeId).ifPresent(oldChallenge -> {
                if (Boolean.TRUE.equals(oldChallenge.getLocationBound()) &&
                        baseRepository.findByFixedChallengeId(previousFixedChallengeId).isEmpty()) {
                    oldChallenge.setLocationBound(false);
                    challengeRepository.save(oldChallenge);
                }
            });
        }

        Set<UUID> impactedChallengeIds = new HashSet<>();
        if (previousFixedChallengeId != null) {
            impactedChallengeIds.add(previousFixedChallengeId);
        }
        if (base.getFixedChallenge() != null) {
            impactedChallengeIds.add(base.getFixedChallenge().getId());
        }
        impactedChallengeIds.forEach(this::enforceChallengeUnlockGuardrails);

        resourceEmbedService.syncBaseEmbeds(base.getId(), base.getDescription());
        eventBroadcaster.broadcastGameConfig(gameId, "bases", "updated");
        return toResponse(base);
    }

    @Transactional(timeout = 10)
    public BaseResponse setNfcLinked(UUID gameId, UUID baseId, boolean linked) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBaseBelongsToGame(base, gameId);
        base.setNfcLinked(linked);
        base = baseRepository.save(base);
        eventBroadcaster.broadcastGameConfig(gameId, "bases", "updated");
        return toResponse(base);
    }

    @Transactional(timeout = 10)
    public void deleteBase(UUID gameId, UUID baseId) {
        Game game = lockAccessibleGame(gameId);
        if (Boolean.TRUE.equals(game.getEnforceBaseOrder())) requireSetup(game);
        Base base = baseRepository.findById(baseId)
                .orElseThrow(() -> new ResourceNotFoundException("Base", baseId));
        ensureBaseBelongsToGame(base, gameId);
        if (submissionRepository.countByBaseId(baseId) > 0) {
            throw new BadRequestException("Cannot delete base with existing submissions");
        }
        UUID fixedChallengeId = base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null;
        clearUnlockTarget(base.getId());
        baseRepository.delete(base);
        if (fixedChallengeId != null) {
            challengeRepository.findById(fixedChallengeId).ifPresent(challenge -> {
                if (Boolean.TRUE.equals(challenge.getLocationBound()) &&
                        baseRepository.findByFixedChallengeId(fixedChallengeId).isEmpty()) {
                    challenge.setLocationBound(false);
                    challengeRepository.save(challenge);
                }
            });
            enforceChallengeUnlockGuardrails(fixedChallengeId);
        }
        eventBroadcaster.broadcastGameConfig(gameId, "bases", "deleted");
    }

    private Game lockAccessibleGame(UUID gameId) {
        Game game = gameRepository.findByIdForUpdate(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        gameAccessService.ensureCurrentUserCanAccessGame(game);
        return game;
    }

    private void requireSetup(Game game) {
        if (game.getStatus() != com.prayer.pointfinder.entity.GameStatus.setup) {
            throw new BadRequestException("Base order can only be changed during setup",
                    com.prayer.pointfinder.exception.ErrorCode.BASE_ORDER_LOCKED);
        }
    }

    private void clearUnlockTarget(UUID targetBaseId) {
        challengeRepository.findByUnlocksBasesContaining(targetBaseId).ifPresent(challenge -> {
            challenge.getUnlocksBases().removeIf(b -> b.getId().equals(targetBaseId));
            challengeRepository.save(challenge);
        });
    }

    private void enforceChallengeUnlockGuardrails(UUID challengeId) {
        challengeRepository.findById(challengeId).ifPresent(challenge -> {
            if (challenge.getUnlocksBases().isEmpty()) {
                return;
            }

            List<Base> fixedBases = baseRepository.findByFixedChallengeId(challengeId);
            boolean hasFixedBase = !fixedBases.isEmpty();
            boolean locationBound = Boolean.TRUE.equals(challenge.getLocationBound());
            Set<UUID> fixedBaseIds = fixedBases.stream()
                    .map(Base::getId)
                    .collect(Collectors.toSet());

            if (!locationBound || !hasFixedBase) {
                challenge.getUnlocksBases().clear();
                challengeRepository.save(challenge);
                return;
            }

            // Remove any unlock targets that are the challenge's own fixed base or no longer hidden
            boolean changed = challenge.getUnlocksBases().removeIf(target ->
                    fixedBaseIds.contains(target.getId()) || !Boolean.TRUE.equals(target.getHidden()));
            if (changed) {
                challengeRepository.save(challenge);
            }
        });
    }

    private void ensureBaseBelongsToGame(Base base, UUID gameId) {
        gameAccessService.ensureBelongsToGame("Base", base.getGame().getId(), gameId);
    }

    private void ensureChallengeBelongsToGame(Challenge challenge, UUID gameId) {
        gameAccessService.ensureBelongsToGame("Challenge", challenge.getGame().getId(), gameId);
    }

    private BaseResponse toResponse(Base base) {
        return toResponse(base, Boolean.TRUE.equals(base.getGame().getEnforceBaseOrder())
                ? baseOrderService.sequenceNumbers(base.getGame()).get(base.getId()) : null);
    }

    private BaseResponse toResponse(Base base, Integer sequenceNumber) {
        List<UUID> tagIds = base.getTags().stream()
                .map(GameTag::getId)
                .collect(Collectors.toList());
        return new BaseResponse(
                base.getId(),
                base.getGame().getId(),
                base.getName(),
                base.getDescription(),
                base.getLat(),
                base.getLng(),
                base.getNfcLinked(),
                base.getNfcToken(),
                base.getHidden(),
                base.getFixedChallenge() != null ? base.getFixedChallenge().getId() : null,
                tagIds.isEmpty() ? null : tagIds,
                base.getStageId(),
                sequenceNumber,
                base.getCheckInMethod() != null ? base.getCheckInMethod().name() : CheckInMethod.NFC.name(),
                base.getCheckInRadiusM()
        );
    }

    private CheckInMethod parseCheckInMethod(String raw) {
        try {
            return CheckInMethod.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new BadRequestException(
                    "Invalid check-in method: " + raw + ". Must be one of: NFC, QR, LOCATION");
        }
    }

    /** Null keeps the inherit-from-game behaviour; a value is clamped to 5..200. */
    private Integer clampRadius(Integer raw) {
        return raw == null ? null : CheckInVerificationService.clampRadiusM(raw);
    }

    /**
     * A location base at exactly 0,0 is never real — it is what a failed
     * coordinate parse used to produce. Since the ring is the only way to
     * reach such a base, saving one silently strands the whole game, so the
     * write is refused here as well as at go-live.
     */
    private void requireUsableCoordinates(CheckInMethod method, Double lat, Double lng) {
        if (method != CheckInMethod.LOCATION) {
            return;
        }
        if (lat == null || lng == null || (lat == 0.0 && lng == 0.0)) {
            throw new BadRequestException(
                    "A location base needs real coordinates — pick the spot on the map");
        }
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
