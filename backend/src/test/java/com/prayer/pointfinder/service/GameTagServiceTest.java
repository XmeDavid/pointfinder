package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateTagRequest;
import com.prayer.pointfinder.dto.request.UpdateTagRequest;
import com.prayer.pointfinder.dto.response.TagResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameTag;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GameTagRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;


@ExtendWith(MockitoExtension.class)
class GameTagServiceTest {

    @Mock
    private GameTagRepository gameTagRepository;
    @Mock
    private GameAccessService gameAccessService;

    @InjectMocks
    private GameTagService gameTagService;

    private UUID gameId;
    private Game game;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        game = Game.builder().id(gameId).name("Game").description("Desc").build();
    }

    // ── listByGame ────────────────────────────────────────────────────

    @Test
    void listByGameReturnsTagsOrderedByCreatedAt() {
        UUID tagId = UUID.randomUUID();
        GameTag tag = GameTag.builder()
                .id(tagId).game(game).label("trail").color("#3b82f6")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findByGameIdOrderByCreatedAtAsc(gameId)).thenReturn(List.of(tag));

        List<TagResponse> result = gameTagService.listByGame(gameId);

        assertEquals(1, result.size());
        assertEquals(tagId, result.get(0).getId());
        assertEquals("trail", result.get(0).getLabel());
        assertEquals("#3b82f6", result.get(0).getColor());
    }

    // ── createTag ─────────────────────────────────────────────────────

    @Test
    void createTagAssignsPaletteColorWhenNoneProvided() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(gameTagRepository.countByGameId(gameId)).thenReturn(0L);
        when(gameTagRepository.findByGameIdAndLabelIgnoreCase(gameId, "trail")).thenReturn(Optional.empty());
        when(gameTagRepository.findByGameIdOrderByCreatedAtAsc(gameId)).thenReturn(List.of());
        when(gameTagRepository.save(any(GameTag.class))).thenAnswer(inv -> {
            GameTag saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            saved.setCreatedAt(Instant.now());
            saved.setUpdatedAt(Instant.now());
            return saved;
        });

        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("trail");
        // color intentionally omitted

        TagResponse response = gameTagService.createTag(gameId, request);

        assertNotNull(response.getColor());
        assertTrue(response.getColor().startsWith("#"));
        assertEquals("trail", response.getLabel());
    }

    @Test
    void createTagUsesProvidedColor() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(gameTagRepository.countByGameId(gameId)).thenReturn(0L);
        when(gameTagRepository.findByGameIdAndLabelIgnoreCase(gameId, "trail")).thenReturn(Optional.empty());
        when(gameTagRepository.save(any(GameTag.class))).thenAnswer(inv -> {
            GameTag saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            saved.setCreatedAt(Instant.now());
            saved.setUpdatedAt(Instant.now());
            return saved;
        });

        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("trail");
        request.setColor("#ff0000");

        TagResponse response = gameTagService.createTag(gameId, request);

        assertEquals("#ff0000", response.getColor());
    }

    @Test
    void createTagRejectsDuplicateLabelCaseInsensitive() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(gameTagRepository.countByGameId(gameId)).thenReturn(1L);
        GameTag existing = GameTag.builder().id(UUID.randomUUID()).game(game)
                .label("Trail").color("#3b82f6").createdAt(Instant.now()).updatedAt(Instant.now()).build();
        when(gameTagRepository.findByGameIdAndLabelIgnoreCase(gameId, "trail")).thenReturn(Optional.of(existing));

        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("trail");

        ConflictException ex = assertThrows(ConflictException.class, () -> gameTagService.createTag(gameId, request));
        assertEquals(ErrorCode.TAG_LABEL_DUPLICATE, ex.getErrorCode());
        verify(gameTagRepository, never()).save(any());
    }

    @Test
    void createTagRejectsWhenCapReached() {
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(gameTagRepository.countByGameId(gameId)).thenReturn((long) GameTagService.MAX_TAGS_PER_GAME);

        CreateTagRequest request = new CreateTagRequest();
        request.setLabel("overflow");

        BadRequestException ex = assertThrows(BadRequestException.class, () -> gameTagService.createTag(gameId, request));
        assertEquals(ErrorCode.TAG_CAP_EXCEEDED, ex.getErrorCode());
        verify(gameTagRepository, never()).save(any());
    }

    // ── updateTag ─────────────────────────────────────────────────────

    @Test
    void updateTagChangesLabelAndColor() {
        UUID tagId = UUID.randomUUID();
        GameTag tag = GameTag.builder()
                .id(tagId).game(game).label("old").color("#111111")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));
        when(gameTagRepository.findByGameIdAndLabelIgnoreCase(gameId, "new")).thenReturn(Optional.empty());
        when(gameTagRepository.save(any(GameTag.class))).thenAnswer(inv -> inv.getArgument(0));

        UpdateTagRequest request = new UpdateTagRequest();
        request.setLabel("new");
        request.setColor("#222222");

        TagResponse response = gameTagService.updateTag(gameId, tagId, request);

        assertEquals("new", response.getLabel());
        assertEquals("#222222", response.getColor());
    }

    @Test
    void updateTagAllowsSameLabelWithoutConflict() {
        UUID tagId = UUID.randomUUID();
        GameTag tag = GameTag.builder()
                .id(tagId).game(game).label("trail").color("#3b82f6")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));
        when(gameTagRepository.save(any(GameTag.class))).thenAnswer(inv -> inv.getArgument(0));

        UpdateTagRequest request = new UpdateTagRequest();
        request.setLabel("TRAIL"); // same label, different case — no conflict check needed

        assertDoesNotThrow(() -> gameTagService.updateTag(gameId, tagId, request));
        verify(gameTagRepository, never()).findByGameIdAndLabelIgnoreCase(any(), any());
    }

    @Test
    void updateTagRejectsDuplicateLabelOnChange() {
        UUID tagId = UUID.randomUUID();
        GameTag tag = GameTag.builder()
                .id(tagId).game(game).label("old").color("#111111")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();
        GameTag conflict = GameTag.builder()
                .id(UUID.randomUUID()).game(game).label("existing").color("#222222")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));
        when(gameTagRepository.findByGameIdAndLabelIgnoreCase(gameId, "existing")).thenReturn(Optional.of(conflict));

        UpdateTagRequest request = new UpdateTagRequest();
        request.setLabel("existing");

        ConflictException ex = assertThrows(ConflictException.class, () -> gameTagService.updateTag(gameId, tagId, request));
        assertEquals(ErrorCode.TAG_LABEL_DUPLICATE, ex.getErrorCode());
        verify(gameTagRepository, never()).save(any());
    }

    @Test
    void updateTagThrowsWhenTagNotFound() {
        UUID tagId = UUID.randomUUID();
        when(gameTagRepository.findById(tagId)).thenReturn(Optional.empty());

        UpdateTagRequest request = new UpdateTagRequest();
        request.setLabel("x");

        assertThrows(ResourceNotFoundException.class, () -> gameTagService.updateTag(gameId, tagId, request));
    }

    @Test
    void updateTagThrowsWhenTagBelongsToDifferentGame() {
        UUID tagId = UUID.randomUUID();
        Game otherGame = Game.builder().id(UUID.randomUUID()).name("Other").description("").build();
        GameTag tag = GameTag.builder()
                .id(tagId).game(otherGame).label("x").color("#aaaaaa")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));

        UpdateTagRequest request = new UpdateTagRequest();
        request.setLabel("y");

        assertThrows(BadRequestException.class, () -> gameTagService.updateTag(gameId, tagId, request));
    }

    // ── deleteTag ─────────────────────────────────────────────────────

    @Test
    void deleteTagRemovesEntity() {
        UUID tagId = UUID.randomUUID();
        GameTag tag = GameTag.builder()
                .id(tagId).game(game).label("trail").color("#3b82f6")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));
        when(gameTagRepository.existsByTagIdInUse(tagId)).thenReturn(false);

        gameTagService.deleteTag(gameId, tagId);

        verify(gameTagRepository).delete(tag);
    }

    @Test
    void deleteTagThrowsWhenNotFound() {
        UUID tagId = UUID.randomUUID();
        when(gameTagRepository.findById(tagId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> gameTagService.deleteTag(gameId, tagId));
        verify(gameTagRepository, never()).delete(any());
    }

    // ── CRITICAL-1 race guard ────────────────────────────────────────

    @Test
    void deleteTagRejectsWhenTagIsInUse() {
        // Simulates: a base or challenge was assigned this tag (e.g. by a concurrent
        // operator) before the delete transaction completes. The existsByTagIdInUse
        // native query detects this inside the same transaction and blocks the delete.
        UUID tagId = UUID.randomUUID();
        GameTag tag = GameTag.builder()
                .id(tagId).game(game).label("trail").color("#3b82f6")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));
        when(gameTagRepository.existsByTagIdInUse(tagId)).thenReturn(true);

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> gameTagService.deleteTag(gameId, tagId));
        assertEquals(ErrorCode.TAG_IN_USE, ex.getErrorCode());
        verify(gameTagRepository, never()).delete(any());
    }

    @Test
    void deleteTagSucceedsWhenTagIsNotInUse() {
        // Tag exists but is not assigned to any base or challenge — delete proceeds.
        UUID tagId = UUID.randomUUID();
        GameTag tag = GameTag.builder()
                .id(tagId).game(game).label("unused").color("#aabbcc")
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();

        when(gameTagRepository.findById(tagId)).thenReturn(Optional.of(tag));
        when(gameTagRepository.existsByTagIdInUse(tagId)).thenReturn(false);

        assertDoesNotThrow(() -> gameTagService.deleteTag(gameId, tagId));
        verify(gameTagRepository).delete(tag);
    }
}
