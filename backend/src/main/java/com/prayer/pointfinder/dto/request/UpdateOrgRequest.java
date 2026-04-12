package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateOrgRequest {
    @Size(min = 2, max = 100)
    private String name;
}
