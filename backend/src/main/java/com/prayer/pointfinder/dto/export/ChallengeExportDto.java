package com.prayer.pointfinder.dto.export;

import com.prayer.pointfinder.entity.AnswerType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

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
    private List<String> correctAnswer;
    private Integer points;
    private Boolean locationBound;
    private String unlocksBaseTempId;
}
