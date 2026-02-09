package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class UpdateBaseRequest {
    @NotBlank
    private String name;

    private String description = "";

    @NotNull
    private Double lat;

    @NotNull
    private Double lng;

    private Boolean nfcLinked;

    private Boolean requirePresenceToSubmit;

    private UUID fixedChallengeId;
}
