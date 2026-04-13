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

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
