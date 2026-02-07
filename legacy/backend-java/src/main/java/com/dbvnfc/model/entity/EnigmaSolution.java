package com.dbvnfc.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "enigma_solutions")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class EnigmaSolution {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @Column(name = "base_id", nullable = false)
    private String baseId;

    @Column(name = "enigma_id", nullable = false)
    private String enigmaId;

    @Column(name = "answer_given", nullable = false)
    private String answerGiven;

    @Column(name = "is_correct", nullable = false)
    private Boolean isCorrect;

    @Column(name = "solved_at", nullable = false)
    private Instant solvedAt = Instant.now();

    @Column(name = "device_id", nullable = false)
    private String deviceId;

    @PrePersist
    protected void onCreate() {
        solvedAt = Instant.now();
    }
}
