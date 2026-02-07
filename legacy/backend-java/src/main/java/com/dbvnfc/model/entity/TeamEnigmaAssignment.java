package com.dbvnfc.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "team_enigma_assignments")
@Data
@NoArgsConstructor
@AllArgsConstructor
@IdClass(TeamEnigmaAssignmentId.class)
public class TeamEnigmaAssignment {

    @Id
    @Column(name = "team_id")
    private UUID teamId;

    @Id
    @Column(name = "base_id")
    private String baseId;

    @Column(name = "enigma_id", nullable = false)
    private String enigmaId;

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        assignedAt = Instant.now();
    }
}
