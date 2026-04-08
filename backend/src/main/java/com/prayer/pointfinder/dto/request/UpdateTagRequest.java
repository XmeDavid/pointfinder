package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateTagRequest {

    @Size(min = 1, max = 40, message = "Tag label must be between 1 and 40 characters")
    private String label;

    @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must be a 7-character hex code like #3b82f6")
    private String color;
}
