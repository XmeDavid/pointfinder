package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record PlayerAuthResponse(
        String token,
        PlayerInfo player,
        TeamInfo team,
        GameInfo game
) {

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
