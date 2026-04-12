package com.prayer.pointfinder.dto.request;

import lombok.Data;

import java.util.UUID;

@Data
public class UpdateResourceRequest {
    private String name;
    private UUID folderId;
    private Boolean sharedWithPlayers;
    private String content;
}
