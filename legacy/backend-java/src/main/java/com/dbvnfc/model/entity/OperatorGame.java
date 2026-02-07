package com.dbvnfc.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "operator_games")
@Data
@NoArgsConstructor
@AllArgsConstructor
@IdClass(OperatorGameId.class)
public class OperatorGame {

    @Id
    @Column(name = "operator_id")
    private UUID operatorId;

    @Id
    @Column(name = "game_id")
    private UUID gameId;

    @Column(nullable = false)
    private String role = "operator";

    @Column(name = "added_at", nullable = false)
    private Instant addedAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        addedAt = Instant.now();
    }
}
