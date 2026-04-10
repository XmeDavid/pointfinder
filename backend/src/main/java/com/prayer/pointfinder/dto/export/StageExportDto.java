package com.prayer.pointfinder.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Exported representation of a game stage. Uses tempId-based references
 * for the trigger base (same pattern as other export DTOs).
 * On import, stages are recreated in order; triggerBaseTempId is resolved
 * to a real base ID via the import's tempId mapping.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StageExportDto {
    private String tempId;
    private String name;
    private String description;
    private int orderIndex;
    private String transitionType;
    private String scheduledAt;
    /** References a base tempId (not a real UUID). Null unless transitionType is 'trigger'. */
    private String triggerBaseTempId;
}
