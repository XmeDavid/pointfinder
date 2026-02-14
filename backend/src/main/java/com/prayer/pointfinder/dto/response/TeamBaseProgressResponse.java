package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class TeamBaseProgressResponse {
    private UUID baseId;
    private UUID teamId;
    private String status; // not_visited, checked_in, submitted, completed, rejected
    private Instant checkedInAt;
    private UUID challengeId;
    private String submissionStatus; // null if no submission
}
