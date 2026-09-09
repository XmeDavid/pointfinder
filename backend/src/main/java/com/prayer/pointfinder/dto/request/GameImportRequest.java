package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.dto.export.GameExportDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
public class GameImportRequest {
    @NotNull
    @Valid
    private GameExportDto gameData;

    private Instant startDate;

    private Instant endDate;

    /**
     * Imports into this organization instead of the caller's personal
     * workspace. The caller must be a member with {@code CREATE_GAMES}.
     */
    private UUID orgId;
}
