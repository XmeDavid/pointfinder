package com.prayer.pointfinder.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class BulkAssignmentRequest {
    @Valid
    @NotNull
    @Size(max = 500, message = "Bulk assignment limited to 500 items per request")
    private List<CreateAssignmentRequest> assignments;
}
