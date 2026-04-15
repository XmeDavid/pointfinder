package com.prayer.pointfinder.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;

@Data
@Builder
public class InvoiceResponse {
    private String id;
    private Instant date;
    private long amount;
    private String currency;
    private String status;
    private String planName;
    private Instant billingPeriodStart;
    private Instant billingPeriodEnd;
    private String paymentMethodLast4;
    private String paymentMethodBrand;
    private List<InvoiceLineItemResponse> lineItems;
    private long tax;
    private long refundedAmount;
    private String pdfUrl;
}
