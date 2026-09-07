package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

/**
 * Upsert body for {@code PUT /api/users/me/tutorials/{scenarioId}}.
 *
 * <p>{@code status} is lowercase on the wire: {@code in_progress|completed|skipped}.
 * {@code currentStep} may be null; {@code in_progress} with a null step means
 * "restart this scenario". {@code gameId} binds a {@code setup-game} scenario to
 * the game it runs on so Resume can return to it.
 */
@Data
public class UpdateTutorialProgressRequest {

    @NotNull
    private String status;

    @Size(max = 64)
    private String currentStep;

    private UUID gameId;
}
