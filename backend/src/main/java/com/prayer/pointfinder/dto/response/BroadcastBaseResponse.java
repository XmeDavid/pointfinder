package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class BroadcastBaseResponse {
    private UUID id;
    private String name;
    private Double lat;
    private Double lng;
}
