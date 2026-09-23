package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * OW-06: one account's report of a listed game. {@code reporterNameSnapshot}
 * survives the account being deleted. Resolution records the admin and when.
 */
@Entity
@Table(name = "publication_reports")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class PublicationReport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporter_user_id")
    private User reporter;

    @Column(name = "reporter_name_snapshot", nullable = false)
    private String reporterNameSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private PublicationReportReason reason;

    @Column(length = 1000)
    private String details;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private PublicationReportStatus status = PublicationReportStatus.open;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by_user_id")
    private User resolvedBy;
}
