package com.prayer.pointfinder.dto.response;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record TeamVariablesResponse(
        List<VariableDefinition> variables
) {
    public record VariableDefinition(
            String key,
            Map<UUID, String> teamValues
    ) {}
}
