package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateInviteRequest {
    @NotBlank @Email
    private String email;

    private UUID gameId; // null = global invite
}
