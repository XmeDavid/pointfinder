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
@Table(name = "organizations")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class Organization {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String slug;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "stripe_customer_id")
    private String stripeCustomerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "subscription_tier", nullable = false, columnDefinition = "org_tier")
    @Builder.Default
    private OrgTier subscriptionTier = OrgTier.free;

    @Enumerated(EnumType.STRING)
    @Column(name = "subscription_status", nullable = false, columnDefinition = "subscription_status")
    @Builder.Default
    private SubscriptionStatus subscriptionStatus = SubscriptionStatus.active;

    @Column(name = "stripe_subscription_id")
    private String stripeSubscriptionId;

    @Column(name = "grace_period_end")
    private Instant gracePeriodEnd;

    /**
     * End of the paid club term. Null means no term: a free org, or a club an
     * admin drives by hand. A term that has passed moves the org into a grace
     * period; a paid invoice pushes it out by the invoice's termMonths.
     */
    @Column(name = "term_end")
    private Instant termEnd;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quota_overrides", columnDefinition = "jsonb")
    private Map<String, Object> quotaOverrides;

    @Column(name = "admin_note")
    private String adminNote;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
