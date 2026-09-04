package com.prayer.pointfinder.dto.response;

import java.util.List;
import java.util.UUID;

public record BroadcastDataResponse(
    UUID gameId, String gameName, String gameStatus, String tileSource,
    List<LeaderboardEntry> leaderboard, List<BroadcastTeamResponse> teams,
    List<BroadcastBaseResponse> bases, List<TeamLocationResponse> locations,
    List<TeamBaseProgressResponse> progress
) {}
