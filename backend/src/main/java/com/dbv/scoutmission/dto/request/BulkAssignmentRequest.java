package com.dbv.scoutmission.dto.request;

import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

@Data
public class BulkAssignmentRequest {
    @Valid
    private List<CreateAssignmentRequest> assignments;
}
