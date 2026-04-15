package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateProfileRequest {
    @Size(min = 1, max = 100)
    private String name;

    @Email
    private String email;
}
