package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Why a platform admin blocks an account; kept with the block for other admins. */
@Data
public class BlockAccountRequest {
    @NotBlank
    @Size(max = 500, message = "Reason must not exceed 500 characters")
    private String reason;
}
