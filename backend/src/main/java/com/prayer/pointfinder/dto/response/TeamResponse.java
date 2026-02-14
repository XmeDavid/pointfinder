package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class TeamResponse {
    private UUID id;
    private UUID gameId;
    private String name;
    private String joinCode;
    private String color;
}
