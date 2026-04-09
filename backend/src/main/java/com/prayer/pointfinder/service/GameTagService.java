package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateTagRequest;
import com.prayer.pointfinder.dto.request.UpdateTagRequest;
import com.prayer.pointfinder.dto.response.TagResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameTag;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameTagRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.util.TagPalette;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class GameTagService {

    /** Maximum number of tags per game (enforced on POST). */
    public static final int MAX_TAGS_PER_GAME = 50;

    private final GameTagRepository gameTagRepository;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<TagResponse> listByGame(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return gameTagRepository.findByGameIdOrderByCreatedAtAsc(gameId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(timeout = 10)
    public TagResponse createTag(UUID gameId, CreateTagRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        // Cap check
        long count = gameTagRepository.countByGameId(gameId);
        if (count >= MAX_TAGS_PER_GAME) {
            throw new BadRequestException(
                    "Maximum " + MAX_TAGS_PER_GAME + " tags per game",
                    ErrorCode.TAG_CAP_EXCEEDED
            );
        }

        String label = request.getLabel().trim();

        // Duplicate label check (case-insensitive)
        if (gameTagRepository.findByGameIdAndLabelIgnoreCase(gameId, label).isPresent()) {
            throw new ConflictException(
                    "A tag with this name already exists in this game",
                    ErrorCode.TAG_LABEL_DUPLICATE
            );
        }

        // Resolve color — use provided or pick next unused palette swatch
        String color;
        if (request.getColor() != null && !request.getColor().isBlank()) {
            color = request.getColor();
        } else {
            Set<String> usedColors = gameTagRepository.findByGameIdOrderByCreatedAtAsc(gameId)
                    .stream()
                    .map(GameTag::getColor)
                    .collect(Collectors.toSet());
            color = TagPalette.nextUnused(usedColors);
        }

        log.info("[OP] operation=createTag gameId={} label={} color={} operatorId={}",
                gameId, label, color, currentOperatorId());

        GameTag tag = GameTag.builder()
                .game(game)
                .label(label)
                .color(color)
                .build();

        tag = gameTagRepository.save(tag);
        return toResponse(tag);
    }

    @Transactional(timeout = 10)
    public TagResponse updateTag(UUID gameId, UUID tagId, UpdateTagRequest request) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);

        GameTag tag = gameTagRepository.findById(tagId)
                .orElseThrow(() -> new ResourceNotFoundException("Tag", tagId));
        ensureTagBelongsToGame(tag, gameId);

        if (request.getLabel() != null) {
            String newLabel = request.getLabel().trim();
            // Check duplicate only if label is actually changing
            if (!newLabel.equalsIgnoreCase(tag.getLabel())) {
                if (gameTagRepository.findByGameIdAndLabelIgnoreCase(gameId, newLabel).isPresent()) {
                    throw new ConflictException(
                            "A tag with this name already exists in this game",
                            ErrorCode.TAG_LABEL_DUPLICATE
                    );
                }
            }
            tag.setLabel(newLabel);
        }

        if (request.getColor() != null) {
            tag.setColor(request.getColor());
        }

        log.info("[OP] operation=updateTag gameId={} tagId={} label={} color={} operatorId={}",
                gameId, tagId, tag.getLabel(), tag.getColor(), currentOperatorId());

        tag = gameTagRepository.save(tag);
        return toResponse(tag);
    }

    @Transactional(timeout = 10)
    public void deleteTag(UUID gameId, UUID tagId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);

        GameTag tag = gameTagRepository.findById(tagId)
                .orElseThrow(() -> new ResourceNotFoundException("Tag", tagId));
        ensureTagBelongsToGame(tag, gameId);

        // CRITICAL-1 guard: reject the delete if any base or challenge still
        // references this tag. Checked inside the same @Transactional so that
        // a concurrent assignment cannot slip in between this check and the
        // DELETE. The native query reads directly from the join tables
        // (base_tags / challenge_tags) rather than relying on the JPA cache.
        if (gameTagRepository.existsByTagIdInUse(tagId)) {
            throw new BadRequestException(
                    "Tag is assigned to at least one base or challenge and cannot be deleted",
                    ErrorCode.TAG_IN_USE
            );
        }

        log.info("[OP] operation=deleteTag gameId={} tagId={} label={} operatorId={}",
                gameId, tagId, tag.getLabel(), currentOperatorId());

        gameTagRepository.delete(tag);
    }

    // ── Helpers ──────────────────────────────────────────────────────

    public TagResponse toResponse(GameTag tag) {
        return TagResponse.builder()
                .id(tag.getId())
                .gameId(tag.getGame().getId())
                .label(tag.getLabel())
                .color(tag.getColor())
                .createdAt(tag.getCreatedAt())
                .updatedAt(tag.getUpdatedAt())
                .build();
    }

    private void ensureTagBelongsToGame(GameTag tag, UUID gameId) {
        if (!tag.getGame().getId().equals(gameId)) {
            throw new BadRequestException("Tag does not belong to game " + gameId);
        }
    }

    private UUID currentOperatorId() {
        try {
            return SecurityUtils.getCurrentUser().getId();
        } catch (Exception ex) {
            return null;
        }
    }
}
