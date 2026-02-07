package com.dbv.scoutmission.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class NotificationResponse {
    private UUID id;
    private UUID gameId;
    private String message;
    private UUID targetTeamId;
    private Instant sentAt;
    private UUID sentBy;
}
