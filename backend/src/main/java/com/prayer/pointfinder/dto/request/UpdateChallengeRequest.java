package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class UpdateChallengeRequest {
    @NotBlank
    private String title;

    private String description = "";

    private String content = "";

    private String completionContent = "";

    @NotBlank
    private String answerType;

    private Boolean autoValidate = false;

    private List<String> correctAnswer;

    @NotNull @Min(0)
    private Integer points;

    private Boolean locationBound = false;

    private UUID fixedBaseId;

    private UUID unlocksBaseId;
}
