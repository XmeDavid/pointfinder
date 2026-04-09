package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Request body for bulk reorder endpoints.
 *
 * <p>The caller sends the full ordered list of entity IDs (bases or challenges)
 * for the game. The service sets {@code order_index = position} for each ID.
 * IDs that belong to a different game are silently ignored (idempotent).
 */
@Data
public class ReorderRequest {

    @NotNull
    @Size(max = 500, message = "Cannot reorder more than 500 items at once")
    private List<UUID> ids;
}
