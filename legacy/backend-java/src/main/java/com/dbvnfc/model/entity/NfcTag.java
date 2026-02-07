package com.dbvnfc.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "nfc_tags")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class NfcTag {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @Column(name = "base_id", nullable = false)
    private String baseId;

    @Column(name = "tag_uuid", unique = true, nullable = false)
    private String tagUuid;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_by_operator_id")
    private Operator linkedByOperator;

    @Column(name = "linked_at", nullable = false)
    private Instant linkedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        linkedAt = Instant.now();
    }
}
