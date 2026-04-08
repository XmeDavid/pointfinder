package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class UploadSessionClearResponse {
    private int cancelledSessions;
    private int clearedSessions;
}
