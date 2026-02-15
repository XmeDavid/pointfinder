package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateOperatorNotificationSettingsRequest {

    @NotNull
    private Boolean notifyPendingSubmissions;

    @NotNull
    private Boolean notifyAllSubmissions;

    @NotNull
    private Boolean notifyCheckIns;
}

