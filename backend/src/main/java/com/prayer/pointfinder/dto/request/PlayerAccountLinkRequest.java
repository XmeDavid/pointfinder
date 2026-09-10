package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Attach the calling guest participation to an account, creating the account first when asked. */
@Data
public class PlayerAccountLinkRequest {
    @NotBlank @Email @Size(max = 255)
    private String email;

    @NotBlank @Size(max = 128)
    private String password;

    /** Required when {@code createAccount} is true. */
    @Size(max = 255)
    private String name;

    private boolean createAccount;
}
