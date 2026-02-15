package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "operator_notification_settings",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_operator_notification_settings_game_user",
                columnNames = {"game_id", "user_id"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OperatorNotificationSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Builder.Default
    @Column(name = "notify_pending_submissions", nullable = false)
    private Boolean notifyPendingSubmissions = true;

    @Builder.Default
    @Column(name = "notify_all_submissions", nullable = false)
    private Boolean notifyAllSubmissions = false;

    @Builder.Default
    @Column(name = "notify_check_ins", nullable = false)
    private Boolean notifyCheckIns = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}

