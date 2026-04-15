package com.prayer.pointfinder.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UpdateProfileResponse {
    private UserResponse user;
    private String message;
}
