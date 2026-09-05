package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "player_locations")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class PlayerLocation {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "player_id")
    private Player player;

    @Column(nullable = false)
    private Double lat;

    @Column(nullable = false)
    private Double lng;

    /** Reported horizontal accuracy of the fix, in metres. Null for legacy rows. */
    @Column(name = "accuracy_m")
    private Double accuracyM;

    /**
     * When the phone captured the fix, as opposed to {@link #updatedAt} which
     * is when the server stored it. The two diverge when a queued report syncs
     * after a reconnect.
     */
    @Column(name = "captured_at")
    private Instant capturedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
