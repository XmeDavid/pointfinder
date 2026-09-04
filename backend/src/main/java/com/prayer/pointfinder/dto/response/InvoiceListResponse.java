package com.prayer.pointfinder.dto.response;

import java.util.List;

public record InvoiceListResponse(
    List<InvoiceResponse> invoices,
    boolean hasMore
) {}
