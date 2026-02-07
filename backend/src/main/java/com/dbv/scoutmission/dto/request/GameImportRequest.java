package com.dbv.scoutmission.dto.request;

import com.dbv.scoutmission.dto.export.GameExportDto;
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
