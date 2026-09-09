package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * What an admin fills in to bill a club for an agreed term.
 * {@code amountCents} is the whole deal price, not a monthly rate — a club is
 * invoiced once per term.
 */
@Data
public class CreateOrgInvoiceRequest {

    @NotNull
    @Min(1)
    private Long amountCents;

    /** ISO 4217, lower case as Stripe wants it. Defaults to euro. */
    @Size(min = 3, max = 3)
    private String currency = "eur";

    @NotBlank
    @Size(max = 500)
    private String description;

    /** Days until the invoice is due. Stripe's {@code days_until_due}. */
    @Min(1)
    private Integer dueDays = 30;

    /** How many months of club term paying this invoice buys. */
    @Min(1)
    private Integer termMonths = 12;
}
