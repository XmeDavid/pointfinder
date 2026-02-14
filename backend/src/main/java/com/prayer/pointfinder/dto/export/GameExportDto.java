package com.prayer.pointfinder.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GameExportDto {
    private String exportVersion;
    private Instant exportedAt;
    private GameMetadataDto game;
    private List<BaseExportDto> bases;
    private List<ChallengeExportDto> challenges;
    private List<AssignmentExportDto> assignments;
    private List<TeamExportDto> teams;
}
