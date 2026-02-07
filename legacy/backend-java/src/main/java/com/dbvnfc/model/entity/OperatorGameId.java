package com.dbvnfc.model.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OperatorGameId implements Serializable {

    private UUID operatorId;
    private UUID gameId;
}
