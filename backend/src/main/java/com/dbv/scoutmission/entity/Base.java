package com.dbv.scoutmission.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fixed_challenge_id")
    private Challenge fixedChallenge;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
