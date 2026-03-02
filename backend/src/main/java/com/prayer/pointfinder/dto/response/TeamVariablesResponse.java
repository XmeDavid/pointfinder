package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class TeamVariablesResponse {

    private List<VariableDefinition> variables;

    @Data
    @Builder
    @AllArgsConstructor
    public static class VariableDefinition {
        private String key;
        private Map<UUID, String> teamValues;
    }
}
