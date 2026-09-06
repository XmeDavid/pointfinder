package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

public record TutorialProgressResponse(
    String scenarioId,
    String status,
    String currentStep,
    UUID gameId,
    Instant startedAt,
    Instant completedAt
) {}
