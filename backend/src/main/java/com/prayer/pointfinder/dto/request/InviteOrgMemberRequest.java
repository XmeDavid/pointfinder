package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class InviteOrgMemberRequest {
    @NotBlank
    @Email
    private String email;
}
