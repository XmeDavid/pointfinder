package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class PlayerResponse {
    private UUID id;
    private UUID teamId;
    private String deviceId;
    private String displayName;
}
