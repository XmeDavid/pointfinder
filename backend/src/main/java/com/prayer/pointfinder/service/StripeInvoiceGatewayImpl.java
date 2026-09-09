package com.prayer.pointfinder.service;

import com.prayer.pointfinder.config.StripeConfig;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.stripe.model.Invoice;
import com.stripe.model.InvoiceItem;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.InvoiceCreateParams;
import com.stripe.param.InvoiceItemCreateParams;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

/**
 * The one class that calls the Stripe SDK for club invoicing. Kept deliberately
 * thin: it translates a command into SDK calls and the SDK's reply into a
 * record, and turns every {@link StripeException} into a
 * {@link BadRequestException} the API layer already knows how to render.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class StripeInvoiceGatewayImpl implements StripeInvoiceGateway {

    private final StripeConfig stripeConfig;

    @Override
    public boolean isConfigured() {
        return stripeConfig.getSecretKey() != null && !stripeConfig.getSecretKey().isBlank();
    }

    @Override
    public String ensureCustomer(String existingCustomerId, String email, String name, UUID orgId) {
        if (existingCustomerId != null && !existingCustomerId.isBlank()) {
            return existingCustomerId;
        }
        try {
            Customer customer = Customer.create(CustomerCreateParams.builder()
                .setEmail(email)
                .setName(name)
                .putMetadata("orgId", orgId.toString())
                .build());
            log.info("[CLUB_BILLING] operation=createCustomer orgId={} customerId={}", orgId, customer.getId());
            return customer.getId();
        } catch (StripeException e) {
            throw stripeFailure("create the Stripe customer", e);
        }
    }

    @Override
    public IssuedInvoice issueInvoice(IssueInvoiceCommand command) {
        try {
            // Create the invoice first, then attach the single line item to it
            // by id. Creating the item first would leave it pending on the
            // customer and risk it landing on some other invoice.
            Invoice invoice = Invoice.create(InvoiceCreateParams.builder()
                .setCustomer(command.customerId())
                .setCollectionMethod(InvoiceCreateParams.CollectionMethod.SEND_INVOICE)
                .setDaysUntilDue((long) command.dueDays())
                .setCurrency(command.currency())
                .setDescription(command.description())
                .setAutoAdvance(false)
                .putMetadata("orgId", command.orgId().toString())
                .putMetadata("termMonths", String.valueOf(command.termMonths()))
                .build());

            InvoiceItem.create(InvoiceItemCreateParams.builder()
                .setCustomer(command.customerId())
                .setInvoice(invoice.getId())
                .setAmount(command.amountCents())
                .setCurrency(command.currency())
                .setDescription(command.description())
                .build());

            Invoice finalized = invoice.finalizeInvoice();
            Invoice sent = finalized.sendInvoice();

            log.info("[CLUB_BILLING] operation=issueInvoice orgId={} invoiceId={} amountCents={} status={}",
                command.orgId(), sent.getId(), command.amountCents(), sent.getStatus());

            return new IssuedInvoice(
                sent.getId(),
                sent.getStatus(),
                sent.getHostedInvoiceUrl(),
                sent.getInvoicePdf(),
                sent.getDueDate() != null ? Instant.ofEpochSecond(sent.getDueDate()) : null);
        } catch (StripeException e) {
            throw stripeFailure("issue the invoice", e);
        }
    }

    private BadRequestException stripeFailure(String what, StripeException e) {
        log.error("[CLUB_BILLING] Stripe call failed while trying to {}: {}", what, e.getMessage());
        return new BadRequestException(
            "Stripe could not " + what + ": " + e.getMessage(),
            ErrorCode.INVOICE_STRIPE_CALL_FAILED);
    }
}
