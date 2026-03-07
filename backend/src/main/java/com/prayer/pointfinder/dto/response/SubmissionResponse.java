package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class SubmissionResponse {
    private UUID id;
    private UUID teamId;
    private UUID challengeId;
    private UUID baseId;
    private String answer;
    private String fileUrl;
    private List<String> fileUrls;
    private String status;
    private Instant submittedAt;
    private UUID reviewedBy;
    private String feedback;
    private Integer points;
    private String completionContent;
}
