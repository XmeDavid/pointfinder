package com.prayer.pointfinder.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Exported representation of a game tag. Labels are used as the round-trip
 * key (not IDs — IDs do not survive export/import). On import, tags are
 * upserted by label into the new game's vocabulary.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TagExportDto {
    private String label;
    /** 7-char hex color, e.g. {@code #3b82f6}. */
    private String color;
}
