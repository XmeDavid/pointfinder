package com.dbv.scoutmission.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class BaseResponse {
    private UUID id;
    private UUID gameId;
    private String name;
    private String description;
    private Double lat;
    private Double lng;
    private Boolean nfcLinked;
    private UUID fixedChallengeId;
}
