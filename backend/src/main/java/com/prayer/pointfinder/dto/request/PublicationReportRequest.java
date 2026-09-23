package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** OW-06: why a signed-in account reports a listed game. */
@Data
public class PublicationReportRequest {
    /** inappropriate, misleading, unsafe, spam or other. */
    @NotBlank
    @Size(max = 32)
    private String reason;

    @Size(max = 1000, message = "Details must not exceed 1000 characters")
    private String details;
}
