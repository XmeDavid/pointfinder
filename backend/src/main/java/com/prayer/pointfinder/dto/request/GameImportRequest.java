package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.dto.export.GameExportDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.Instant;

@Data
public class GameImportRequest {
    @NotNull
    @Valid
    private GameExportDto gameData;

    private Instant startDate;

    private Instant endDate;
}
