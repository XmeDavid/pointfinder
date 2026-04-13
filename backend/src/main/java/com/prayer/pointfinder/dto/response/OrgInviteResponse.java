package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class OrgInviteResponse {
    private UUID id;
    private UUID orgId;
    private String orgName;
    private String email;
    private String status;
    private UUID invitedBy;
    private String inviterName;
    private Instant createdAt;
}
