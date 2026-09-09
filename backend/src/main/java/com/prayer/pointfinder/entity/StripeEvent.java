package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * One row per Stripe event this backend has already applied. Stripe redelivers
 * events on any non-2xx reply and on its own retry schedule, so every handler
 * records the event id in the same transaction as its effect; a redelivery
 * finds the row and skips. See docs/business-logic.md, "Webhook idempotency".
 */
@Entity
@Table(name = "stripe_events")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class StripeEvent {

    /** The Stripe event id (evt_...). */
    @Id
    private String id;

    @Column(nullable = false)
    private String type;

    @Column(name = "processed_at", nullable = false)
    @Builder.Default
    private Instant processedAt = Instant.now();
}
