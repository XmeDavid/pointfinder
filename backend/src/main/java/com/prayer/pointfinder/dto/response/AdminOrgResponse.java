package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class AdminOrgResponse {
    private UUID id;
    private String name;
    private String slug;
    private String subscriptionTier;
    private String subscriptionStatus;
    private int memberCount;
    private Instant createdAt;
}
