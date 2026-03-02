package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
public class TeamVariablesBulkRequest {

    @NotNull
    private List<TeamVariableEntry> variables;

    @Data
    public static class TeamVariableEntry {
        @NotBlank
        private String key;

        @NotNull
        private Map<UUID, String> teamValues;
    }
}
