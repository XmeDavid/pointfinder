package com.dbv.scoutmission.dto.export;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

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
}
