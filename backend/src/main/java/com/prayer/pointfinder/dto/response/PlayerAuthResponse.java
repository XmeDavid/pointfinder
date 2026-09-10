package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record PlayerAuthResponse(
        String token,
        PlayerInfo player,
        TeamInfo team,
        GameInfo game
) {
    /** The one shape every player session starts from: join today, recover since PF-01. */
    public static PlayerAuthResponse of(String token, com.prayer.pointfinder.entity.Player player,
                                        com.prayer.pointfinder.entity.Team team,
                                        com.prayer.pointfinder.entity.Game game) {
        return new PlayerAuthResponse(
                token,
                new PlayerInfo(player.getId(), player.getDisplayName(), player.getDeviceId()),
                new TeamInfo(team.getId(), team.getName(), team.getColor()),
                new GameInfo(game.getId(), game.getName(), game.getDescription(), game.getStatus().name(), game.getTileSource())
        );
    }


    public record PlayerInfo(
            UUID id,
            String displayName,
            String deviceId
    ) {}

    public record TeamInfo(
            UUID id,
            String name,
            String color
    ) {}

    public record GameInfo(
            UUID id,
            String name,
            String description,
            String status,
            String tileSource
    ) {}
}
