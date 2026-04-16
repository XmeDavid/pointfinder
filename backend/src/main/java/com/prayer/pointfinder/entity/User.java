package com.prayer.pointfinder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String name;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "user_role")
    private UserRole role;

    @Column(name = "push_token")
    private String pushToken;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "push_platform", nullable = false)
    private PushPlatform pushPlatform = PushPlatform.ios;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Monotonically-increasing version used to invalidate JWTs issued before
     * a security-sensitive event (password reset, role change, or explicit
     * logout-everywhere). Every issued token embeds this value; the
     * authentication filter rejects any token whose embedded version is less
     * than the user's current version.
     *
     * <p>Defaults to 0 for backward compatibility with pre-V54 rows. Bumps
     * happen inside the same transaction that mutates the triggering field
     * (password, role) so a token minted before the bump can never outlive
     * the commit.
     */
    @Builder.Default
    @Column(name = "token_version", nullable = false)
    private Integer tokenVersion = 0;

    @ManyToMany(mappedBy = "operators")
    @Builder.Default
    private Set<Game> operatedGames = new HashSet<>();
}
