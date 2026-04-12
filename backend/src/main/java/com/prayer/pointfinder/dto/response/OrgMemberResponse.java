package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class OrgMemberResponse {
    private UUID id;
    private UUID userId;
    private String name;
    private String email;
    private Integer permissions;
    private Instant joinedAt;
}
