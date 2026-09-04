package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;

public record InvoiceResponse(
    String id, Instant date, long amount, String currency, String status,
    String planName, Instant billingPeriodStart, Instant billingPeriodEnd,
    String paymentMethodLast4, String paymentMethodBrand,
    List<InvoiceLineItemResponse> lineItems, long tax, long refundedAmount,
    String pdfUrl
) {}
