package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class BroadcastDataResponse {
    private UUID gameId;
    private String gameName;
    private String gameStatus;
    private String tileSource;
    private List<LeaderboardEntry> leaderboard;
    private List<BroadcastTeamResponse> teams;
    private List<BroadcastBaseResponse> bases;
    private List<TeamLocationResponse> locations;
    private List<TeamBaseProgressResponse> progress;
}
