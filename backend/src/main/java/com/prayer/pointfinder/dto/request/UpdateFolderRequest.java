package com.prayer.pointfinder.dto.request;

import lombok.Data;

import java.util.UUID;

@Data
public class UpdateFolderRequest {
    private String name;
    private UUID parentId;
}
