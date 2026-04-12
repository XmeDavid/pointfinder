package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class OrgResponse {
    private UUID id;
    private String name;
    private String slug;
    private UUID createdBy;
    private String subscriptionTier;
    private String subscriptionStatus;
    private Integer memberCount;
    private Map<String, Object> quotaOverrides;
    private Instant createdAt;
}
