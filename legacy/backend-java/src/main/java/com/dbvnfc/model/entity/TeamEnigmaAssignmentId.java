package com.dbvnfc.model.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TeamEnigmaAssignmentId implements Serializable {

    private UUID teamId;
    private String baseId;
}
