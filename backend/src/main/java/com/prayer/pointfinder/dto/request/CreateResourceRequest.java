package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateResourceRequest {
    @NotBlank
    private String name;

    @NotBlank
    private String type;

    private UUID folderId;

    private Boolean sharedWithPlayers;

    private String content;
}
