package com.prayer.pointfinder.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TeamExportDto {
    private String tempId;
    private String name;
    private String color;
    /** OW-05: most players the team takes; absent or null means no limit. */
    private Integer maxPlayers;
}
