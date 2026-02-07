package com.dbvnfc.model.entity;

import com.dbvnfc.model.enums.GameStatus;
import com.dbvnfc.model.jsonb.Base;
import com.dbvnfc.model.jsonb.Enigma;
import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Type;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "games")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Game {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(name = "rules_html", columnDefinition = "TEXT")
    private String rulesHtml;

    @Type(JsonBinaryType.class)
    @Column(name = "bases", columnDefinition = "jsonb", nullable = false)
    private List<Base> bases = new ArrayList<>();

    @Type(JsonBinaryType.class)
    @Column(name = "enigmas", columnDefinition = "jsonb", nullable = false)
    private List<Enigma> enigmas = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private GameStatus status = GameStatus.SETUP;

    @Column(name = "bases_linked", nullable = false)
    private Boolean basesLinked = false;

    @Column(name = "created_by_operator_id")
    private UUID createdByOperatorId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
