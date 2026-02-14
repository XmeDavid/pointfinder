package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateLocationRequest {
    @NotNull
    private Double lat;

    @NotNull
    private Double lng;
}
