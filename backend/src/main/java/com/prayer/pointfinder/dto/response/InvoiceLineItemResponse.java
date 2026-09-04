package com.prayer.pointfinder.dto.response;

public record InvoiceLineItemResponse(
    String description,
    long amount,
    long quantity
) {}
