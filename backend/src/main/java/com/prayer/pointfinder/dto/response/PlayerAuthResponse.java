package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class PlayerAuthResponse {
    private String token;
    private PlayerInfo player;
    private TeamInfo team;
    private GameInfo game;

    @Data
    @Builder
    @AllArgsConstructor
    public static class PlayerInfo {
        private UUID id;
        private String displayName;
        private String deviceId;
    }

    @Data
    @Builder
    @AllArgsConstructor
    public static class TeamInfo {
        private UUID id;
        private String name;
        private String color;
    }

    @Data
    @Builder
    @AllArgsConstructor
    public static class GameInfo {
        private UUID id;
        private String name;
        private String description;
        private String status;
    }
}
