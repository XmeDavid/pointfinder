package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class InviteResponse {
    private UUID id;
    private UUID gameId;
    private String gameName;
    private String email;
    private String status;
    private UUID invitedBy;
    private String inviterName;
    private Instant createdAt;
}
