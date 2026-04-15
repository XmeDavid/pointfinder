package com.prayer.pointfinder.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class InvoiceLineItemResponse {
    private String description;
    private long amount;
    private long quantity;
}
