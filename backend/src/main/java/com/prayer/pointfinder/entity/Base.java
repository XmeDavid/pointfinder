package com.prayer.pointfinder.entity;

import com.prayer.pointfinder.converter.StringListJsonConverter;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "bases")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class Base {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private Double lat;

    @Column(nullable = false)
    private Double lng;

    @Column(name = "nfc_linked", nullable = false)
    private Boolean nfcLinked;

    @Column(name = "nfc_token", nullable = false, length = 8)
    private String nfcToken;

    @Column(name = "hidden", nullable = false)
    @Builder.Default
    private Boolean hidden = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fixed_challenge_id")
    private Challenge fixedChallenge;

    /**
     * Operator-only free-text tags for setup organization (grouping, filtering,
     * operational planning). MUST NEVER be exposed to players.
     *
     * <p>Only operator-facing DTOs ({@link com.prayer.pointfinder.dto.response.BaseResponse})
     * carry this field. Player-facing DTOs
     * ({@code PlayerBaseResponse}, {@code BaseProgressResponse},
     * {@code BroadcastBaseResponse}) deliberately omit it, and
     * {@code PlayerControllerTest} asserts the absence via JSON path plus a
     * full-body substring check on the {@code GET /api/player/games/{gameId}/data}
     * and {@code GET /api/player/games/{gameId}/bases} endpoints.
     *
     * <p>Length is capped at 20 entries at the DTO layer; storage is JSON
     * via {@link StringListJsonConverter}, matching the existing
     * {@code Challenge.correctAnswer} convention.
     */
    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "tags", columnDefinition = "TEXT")
    private List<String> tags;

    /**
     * Operator-only fixed-palette color (7-char hex, e.g. {@code #3b82f6}).
     * MUST NEVER be exposed to players. Matches the existing
     * {@code Team.color} storage convention ({@code VARCHAR(7)}). The
     * client uses a fixed 12-swatch palette; the server accepts any valid
     * hex via {@code @Pattern} on the request DTO.
     */
    @Column(name = "color", length = 7)
    private String color;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @PrePersist
    private void generateNfcTokenIfMissing() {
        if (this.nfcToken == null) {
            String chars = "abcdefghijklmnopqrstuvwxyz0123456789";
            StringBuilder sb = new StringBuilder(8);
            for (int i = 0; i < 8; i++) {
                sb.append(chars.charAt(SECURE_RANDOM.nextInt(chars.length())));
            }
            this.nfcToken = sb.toString();
        }
    }
}
