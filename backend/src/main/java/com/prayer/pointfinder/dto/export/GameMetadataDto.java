package com.prayer.pointfinder.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GameMetadataDto {
    private String name;
    private String description;
    private Boolean uniformAssignment;
    private Boolean enforceBaseOrder;
    private String tileSource;
    private String unlockTrigger;
    private Boolean broadcastEnabled;
    private String broadcastCode;

    /** {@code NFC}, {@code QR}, or {@code LOCATION}. Null on pre-V60 templates. */
    private String defaultCheckInMethod;
    /** Default location radius in metres. Null on pre-V60 templates. */
    private Integer defaultCheckInRadiusM;
}
