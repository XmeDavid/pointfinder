package com.prayer.pointfinder.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AssignmentExportDto {
    private String baseTempId;
    private String challengeTempId;
    private String teamTempId;
}
