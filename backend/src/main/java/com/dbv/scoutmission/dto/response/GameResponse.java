package com.dbv.scoutmission.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class GameResponse {
    private UUID id;
    private String name;
    private String description;
    private Instant startDate;
    private Instant endDate;
    private String status;
    private UUID createdBy;
    private List<UUID> operatorIds;
    private Boolean uniformAssignment;
}
