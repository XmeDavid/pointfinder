package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateOrgInviteRequest {
    @NotBlank
    @Email
    private String email;
}
