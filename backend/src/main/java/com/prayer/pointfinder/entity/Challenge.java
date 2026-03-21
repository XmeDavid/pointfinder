package com.prayer.pointfinder.entity;

import com.prayer.pointfinder.converter.StringListJsonConverter;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "challenges")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class Challenge {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "completion_content", nullable = false, columnDefinition = "TEXT")
    private String completionContent;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer_type", nullable = false, columnDefinition = "answer_type")
    private AnswerType answerType;

    @Column(name = "auto_validate", nullable = false)
    private Boolean autoValidate;

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "correct_answer", columnDefinition = "TEXT")
    private List<String> correctAnswer;

    @Column(nullable = false)
    private Integer points;

    @Column(name = "location_bound", nullable = false)
    private Boolean locationBound;

    @Column(name = "require_presence_to_submit", nullable = false)
    @Builder.Default
    private Boolean requirePresenceToSubmit = false;

    @ManyToMany
    @JoinTable(
            name = "challenge_unlocks_bases",
            joinColumns = @JoinColumn(name = "challenge_id"),
            inverseJoinColumns = @JoinColumn(name = "base_id")
    )
    @Builder.Default
    private Set<Base> unlocksBases = new HashSet<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
