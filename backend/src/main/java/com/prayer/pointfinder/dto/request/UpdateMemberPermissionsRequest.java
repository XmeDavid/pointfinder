package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateMemberPermissionsRequest {
    @NotNull
    @Min(1)
    private Integer permissions;
}
