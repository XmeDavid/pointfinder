package com.prayer.pointfinder.dto.request;

import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

@Data
public class BulkAssignmentRequest {
    @Valid
    private List<CreateAssignmentRequest> assignments;
}
