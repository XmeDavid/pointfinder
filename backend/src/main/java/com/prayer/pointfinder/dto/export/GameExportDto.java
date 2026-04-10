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
    private List<TeamVariableExportDto> teamVariables;
    private List<ChallengeTeamVariableExportDto> challengeTeamVariables;
    /** Full tag vocabulary for this game. Null when no tags exist. */
    private List<TagExportDto> tags;
    /** Stage progression configuration. Null when no stages exist (flat game). */
    private List<StageExportDto> stages;
}
