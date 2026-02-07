package com.dbv.scoutmission.dto.response;

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
    private String email;
    private String token;
    private String status;
    private UUID invitedBy;
    private Instant createdAt;
}
