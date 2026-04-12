package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "user_subscriptions")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class UserSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "individual_tier")
    @Builder.Default
    private IndividualTier tier = IndividualTier.free;

    @Column(name = "stripe_customer_id")
    private String stripeCustomerId;

    @Column(name = "stripe_subscription_id")
    private String stripeSubscriptionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "subscription_status")
    @Builder.Default
    private SubscriptionStatus status = SubscriptionStatus.active;

    @Column(name = "grace_period_end")
    private Instant gracePeriodEnd;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quota_overrides", columnDefinition = "jsonb")
    private Map<String, Object> quotaOverrides;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", columnDefinition = "billing_cycle")
    private BillingCycle billingCycle;

    @Column(name = "current_period_end")
    private Instant currentPeriodEnd;

    @Column(name = "admin_note")
    private String adminNote;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
