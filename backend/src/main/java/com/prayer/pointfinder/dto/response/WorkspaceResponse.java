package com.prayer.pointfinder.dto.response;

import java.util.List;
import java.util.UUID;

public record WorkspaceResponse(
    PersonalWorkspace personal,
    List<OrgWorkspace> organizations
) {
    public record PersonalWorkspace(
        String tier,
        String status,
        int activeGames
    ) {}

    public record OrgWorkspace(
        UUID id,
        String name,
        String slug,
        String tier,
        String status,
        int memberCount,
        int liveGames,
        Integer permissions
    ) {}
}
