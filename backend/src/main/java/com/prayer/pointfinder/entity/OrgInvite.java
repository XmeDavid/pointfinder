package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "org_invites")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class OrgInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "org_id", nullable = false)
    private Organization organization;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false, unique = true)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "invite_status")
    @Builder.Default
    private InviteStatus status = InviteStatus.pending;

    @Column(name = "default_permissions", nullable = false)
    @Builder.Default
    private Integer defaultPermissions = OrgPermission.OPERATE_GAMES.getBit();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invited_by")
    private User invitedBy;

    /**
     * Set when an admin creates a club for an email that has no account yet.
     * The creating admin owns the org meanwhile; accepting this invite makes
     * the invitee the org creator and grants ALL permissions.
     */
    @Column(name = "transfer_ownership", nullable = false)
    @Builder.Default
    private boolean transferOwnership = false;

    /**
     * When this invite stops being acceptable. Set on every new invite; null
     * on rows that predate expiry and on rows already accepted, declined or
     * expired, which have no deadline left to keep. A null deadline never
     * expires, so nothing already answered is disturbed.
     */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** Whether this invite's deadline has passed, as of {@code now}. */
    public boolean isExpiredAt(Instant now) {
        return expiresAt != null && expiresAt.isBefore(now);
    }
}
