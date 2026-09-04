package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record OperatorNotificationSettingsResponse(
    UUID gameId,
    UUID userId,
    Boolean notifyPendingSubmissions,
    Boolean notifyAllSubmissions,
    Boolean notifyCheckIns
) {}
