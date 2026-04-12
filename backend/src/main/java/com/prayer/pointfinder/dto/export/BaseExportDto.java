package com.prayer.pointfinder.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BaseExportDto {
    private String tempId;
    private String name;
    private String description;
    private Double lat;
    private Double lng;
    private Boolean hidden;
    private String fixedChallengeTempId;

    /**
     * Operator-only tag labels (not IDs — IDs do not survive export/import).
     * On import, tags are upserted by label into the new game's vocabulary.
     * Max 20 entries.
     */
    private List<String> tagLabels;

    /** References a stage tempId. Null when the base has no stage (flat game). */
    private String stageTempId;
    private Integer orderIndex;
}
