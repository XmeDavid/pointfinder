package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class WorkspaceResponse {
    private PersonalWorkspace personal;
    private List<OrgWorkspace> organizations;

    @Data
    @Builder
    @AllArgsConstructor
    public static class PersonalWorkspace {
        private String tier;
        private String status;
        private int activeGames;
    }

    @Data
    @Builder
    @AllArgsConstructor
    public static class OrgWorkspace {
        private UUID id;
        private String name;
        private String slug;
        private String tier;
        private String status;
        private int memberCount;
        private int liveGames;
        private Integer permissions;
    }
}
