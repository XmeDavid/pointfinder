package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpdateTeamRequest {
    @NotBlank
    private String name;
}
