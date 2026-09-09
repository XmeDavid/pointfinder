package com.prayer.pointfinder.dto.response;

import java.util.UUID;

/**
 * What the registration page learns from a raw invite token.
 *
 * <p>One token endpoint serves two kinds of invite. An operator invite carries
 * only the address it was sent to. An org invite — the link behind
 * {@code /register/{token}?org=true} — also names the organization, so the
 * page can say which club the visitor is joining before they type anything.
 * {@code orgId} and {@code orgName} are null for an operator invite.
 */
public record InviteTokenResponse(String email, UUID orgId, String orgName) {

    public static InviteTokenResponse forOperator(String email) {
        return new InviteTokenResponse(email, null, null);
    }

    public static InviteTokenResponse forOrg(String email, UUID orgId, String orgName) {
        return new InviteTokenResponse(email, orgId, orgName);
    }
}
