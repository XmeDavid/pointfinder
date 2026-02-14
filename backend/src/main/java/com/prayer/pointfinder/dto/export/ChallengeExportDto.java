package com.prayer.pointfinder.dto.export;

import com.prayer.pointfinder.entity.AnswerType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChallengeExportDto {
    private String tempId;
    private String title;
    private String description;
    private String content;
    private String completionContent;
    private AnswerType answerType;
    private Boolean autoValidate;
    private String correctAnswer;
    private Integer points;
    private Boolean locationBound;
}
