package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.security.SecureRandom;
import java.time.Instant;
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
