package com.dbv.scoutmission.dto.export;

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
}
