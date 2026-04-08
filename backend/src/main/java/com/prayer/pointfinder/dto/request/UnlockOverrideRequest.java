package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Optional request body for the base unlock override rescue endpoints
 * ({@code POST} and {@code DELETE /api/games/{gameId}/teams/{teamId}/bases/
 * {baseId}/unlock-override}).
 *
 * <p>The body is OPTIONAL on both verbs. When supplied, the free-text
 * {@link #reason} is captured on the audit trail:
 * <ul>
 *   <li>{@code base_unlock_overrides.operator_reason} when the body is
 *       supplied on the POST path.</li>
 *   <li>The same column is NOT mutated on DELETE; the remove action
 *       captures its own reason on the activity event message instead.</li>
 * </ul>
 *
 * <p>The operator identity is recovered from
 * {@code SecurityUtils.getCurrentUser()} — never from the request body —
 * so the actor cannot be spoofed by a client.
 */
@Getter
@Setter
@NoArgsConstructor
public class UnlockOverrideRequest {

    /**
     * Optional free-text justification for creating or removing the
     * unlock override. Stored on the override row for create; narrated on
     * the activity event for remove.
     */
    @Size(max = 500)
    private String reason;
}
