package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record OrgInviteResponse(
    UUID id,
    UUID orgId,
    String orgName,
    String email,
    String status,
    UUID invitedBy,
    String inviterName,
    Instant createdAt
) {}
