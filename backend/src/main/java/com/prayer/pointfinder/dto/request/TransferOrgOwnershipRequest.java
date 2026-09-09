package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/** The member who becomes the org's owner. They must already be a member. */
@Data
public class TransferOrgOwnershipRequest {

    @NotNull
    private UUID userId;
}
