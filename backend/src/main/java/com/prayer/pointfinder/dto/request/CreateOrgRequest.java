package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateOrgRequest {
    @NotBlank
    @Size(min = 2, max = 100)
    private String name;
}
