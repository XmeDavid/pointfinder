package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

@Data
public class UploadSessionInitRequest {

    private String originalFileName;

    @NotBlank
    private String contentType;

    @NotNull
    @Positive
    private Long totalSizeBytes;

    @Min(1024)
    @Max(16 * 1024 * 1024)
    private Integer chunkSizeBytes;
}
