package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class OperatorNotificationSettingsResponse {

    private UUID gameId;
    private UUID userId;
    private Boolean notifyPendingSubmissions;
    private Boolean notifyAllSubmissions;
    private Boolean notifyCheckIns;
}

