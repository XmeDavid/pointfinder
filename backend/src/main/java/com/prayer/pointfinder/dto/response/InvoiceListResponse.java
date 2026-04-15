package com.prayer.pointfinder.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class InvoiceListResponse {
    private List<InvoiceResponse> invoices;
    private boolean hasMore;
}
