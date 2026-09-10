package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Attach the calling guest participation to an account, creating the account first when asked. */
@Data
public class PlayerAccountLinkRequest {
    /** Credentials, or {@code accountAccessToken} for a phone that is already signed in. */
    @Email @Size(max = 255)
    private String email;

    @Size(max = 128)
    private String password;

    /** The player app's account session token; links without retyping credentials. */
    @Size(max = 4096)
    private String accountAccessToken;

    /** Required when {@code createAccount} is true. */
    @Size(max = 255)
    private String name;

    private boolean createAccount;
}
