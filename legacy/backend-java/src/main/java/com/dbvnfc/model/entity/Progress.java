package com.dbvnfc.model.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "progress")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Progress {

    @EmbeddedId
    private ProgressId id;

    @Column(name = "arrived_at")
    private Instant arrivedAt;

    @Column(name = "solved_at")
    private Instant solvedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(nullable = false)
    private Integer score = 0;

    @Column(name = "nfc_tag_uuid")
    private String nfcTagUuid;
}
