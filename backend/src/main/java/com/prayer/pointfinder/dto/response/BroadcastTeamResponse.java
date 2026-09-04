package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record BroadcastTeamResponse(
    UUID id,
    String name,
    String color
) {}
