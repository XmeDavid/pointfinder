package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class ChallengeResponse {
    private UUID id;
    private UUID gameId;
    private String title;
    private String description;
    private String content;
    private String completionContent;
    private String answerType;
    private Boolean autoValidate;
    private String correctAnswer;
    private Integer points;
    private Boolean locationBound;
    private UUID unlocksBaseId;
}
