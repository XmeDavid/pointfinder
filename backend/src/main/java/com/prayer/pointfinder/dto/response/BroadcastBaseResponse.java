package com.prayer.pointfinder.dto.response;

import java.util.UUID;

public record BroadcastBaseResponse(
    UUID id,
    String name,
    Double lat,
    Double lng
) {}
