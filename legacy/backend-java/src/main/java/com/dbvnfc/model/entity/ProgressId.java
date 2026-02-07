package com.dbvnfc.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

@Embeddable
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProgressId implements Serializable {

    @Column(name = "team_id")
    private UUID teamId;

    @Column(name = "base_id")
    private String baseId;
}
