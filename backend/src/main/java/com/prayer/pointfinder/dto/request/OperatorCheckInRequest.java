package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Optional request body for the operator manual check-in endpoint
 * ({@code POST /api/games/{gameId}/teams/{teamId}/check-in/{baseId}}).
 *
 * <p>The body is OPTIONAL — legacy clients that POST without a body still
 * work and the {@code reason} is recorded as NULL. New clients can supply a
 * short free-text justification that flows through to the audit columns on
 * {@code check_ins} and to the {@link com.prayer.pointfinder.entity.ActivityEvent}
 * created for the manual rescue. The operator user is recovered from the
 * security context, not from the request body, so the actor identity cannot
 * be spoofed by a client.
 */
@Getter
@Setter
@NoArgsConstructor
public class OperatorCheckInRequest {

    /**
     * Optional free-text justification for the manual check-in. Stored on
     * {@code check_ins.operator_reason} as part of the audit trail; empty
     * or NULL is allowed because legacy clients send no body at all.
     */
    @Size(max = 500)
    private String reason;
}
