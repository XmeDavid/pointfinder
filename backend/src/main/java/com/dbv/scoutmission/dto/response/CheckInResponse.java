package com.dbv.scoutmission.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class CheckInResponse {
    private UUID checkInId;
    private UUID baseId;
    private String baseName;
    private Instant checkedInAt;
    private ChallengeInfo challenge;

    @Data
    @Builder
    @AllArgsConstructor
    public static class ChallengeInfo {
        private UUID id;
        private String title;
        private String description;
        private String content;
        private String answerType;
        private Integer points;
    }
}
