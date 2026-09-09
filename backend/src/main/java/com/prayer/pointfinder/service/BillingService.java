package com.prayer.pointfinder.service;

import com.prayer.pointfinder.config.StripeConfig;
import com.prayer.pointfinder.dto.request.CreateCheckoutRequest;
import com.prayer.pointfinder.dto.response.CheckoutResponse;
import com.prayer.pointfinder.dto.response.InvoiceLineItemResponse;
import com.prayer.pointfinder.dto.response.InvoiceListResponse;
import com.prayer.pointfinder.dto.response.InvoiceResponse;
import com.prayer.pointfinder.dto.response.UserSubscriptionResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.stripe.exception.StripeException;
import com.stripe.model.Charge;
import com.stripe.model.Invoice;
import com.stripe.model.InvoiceCollection;
import com.stripe.model.InvoiceLineItem;
import com.stripe.model.checkout.Session;
import com.stripe.param.InvoiceListParams;
import com.stripe.param.checkout.SessionCreateParams;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class BillingService {

    private final StripeConfig stripeConfig;
    private final UserSubscriptionRepository userSubRepository;

    private void ensureStripeConfigured() {
        if (stripeConfig.getSecretKey() == null || stripeConfig.getSecretKey().isBlank()) {
            throw new BadRequestException("Stripe is not configured. Please set STRIPE_SECRET_KEY.");
        }
    }

    /**
     * Self-serve checkout, personal only. Clubs never pass through here: a
     * club is created by an admin and paid by invoice, so the only client
     * reference this backend ever mints is {@code user:<id>}.
     */
    @Transactional
    public CheckoutResponse createCheckoutSession(CreateCheckoutRequest request) {
        ensureStripeConfigured();
        User currentUser = SecurityUtils.getCurrentUser();
        String priceId = resolvePriceId(request.getPlan(), request.getCycle());

        if (priceId == null || priceId.isBlank()) {
            throw new BadRequestException("Stripe price not configured for plan: " + request.getPlan() + "/" + request.getCycle());
        }

        UserSubscription sub = userSubRepository.findByUserId(currentUser.getId()).orElse(null);
        String customerId = sub != null ? sub.getStripeCustomerId() : null;
        String clientReferenceId = "user:" + currentUser.getId();

        try {
            SessionCreateParams.Builder builder = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                .setSuccessUrl(stripeConfig.getSuccessUrl() + "?session_id={CHECKOUT_SESSION_ID}")
                .setCancelUrl(stripeConfig.getCancelUrl())
                .setClientReferenceId(clientReferenceId)
                .putMetadata("plan", request.getPlan())
                .putMetadata("billing_cycle", request.getCycle())
                .addLineItem(SessionCreateParams.LineItem.builder()
                    .setPrice(priceId)
                    .setQuantity(1L)
                    .build());

            if (customerId != null) {
                builder.setCustomer(customerId);
            } else {
                builder.setCustomerEmail(currentUser.getEmail());
            }

            Session session = Session.create(builder.build());

            log.info("[BILLING] operation=createCheckout user={} plan={} cycle={}",
                currentUser.getId(), request.getPlan(), request.getCycle());

            return new CheckoutResponse(session.getUrl(), session.getId());
        } catch (Exception e) {
            log.error("[BILLING] Stripe checkout creation failed: {}", e.getMessage(), e);
            throw new BadRequestException("Failed to create checkout session: " + e.getMessage());
        }
    }

    public String createPortalSession() {
        ensureStripeConfigured();
        User currentUser = SecurityUtils.getCurrentUser();
        UserSubscription sub = userSubRepository.findByUserId(currentUser.getId())
            .orElseThrow(() -> new BadRequestException("No subscription found"));

        if (sub.getStripeCustomerId() == null) {
            throw new BadRequestException("No Stripe customer associated with your account");
        }

        try {
            com.stripe.param.billingportal.SessionCreateParams params =
                com.stripe.param.billingportal.SessionCreateParams.builder()
                    .setCustomer(sub.getStripeCustomerId())
                    .setReturnUrl(stripeConfig.getSuccessUrl())
                    .build();
            com.stripe.model.billingportal.Session portalSession =
                com.stripe.model.billingportal.Session.create(params);
            return portalSession.getUrl();
        } catch (StripeException e) {
            log.error("[BILLING] Stripe portal creation failed: {}", e.getMessage());
            throw new BadRequestException("Failed to create billing portal session");
        }
    }

    @Transactional(readOnly = true)
    public UserSubscriptionResponse getSubscriptionStatus() {
        User currentUser = SecurityUtils.getCurrentUser();
        UserSubscription sub = userSubRepository.findByUserId(currentUser.getId())
            .orElse(UserSubscription.builder().tier(IndividualTier.free).status(SubscriptionStatus.active).build());

        return new UserSubscriptionResponse(
            sub.getId(),
            sub.getTier().name(),
            sub.getStatus().name(),
            sub.getBillingCycle() != null ? sub.getBillingCycle().name() : null,
            sub.getCurrentPeriodEnd(),
            sub.getGracePeriodEnd(),
            sub.getQuotaOverrides()
        );
    }

    /** The only self-serve prices this backend maps. Clubs are invoiced, not priced. */
    private String resolvePriceId(String plan, String cycle) {
        return switch (plan + "-" + cycle) {
            case "pro-monthly" -> stripeConfig.getPriceProMonthly();
            case "pro-annual" -> stripeConfig.getPriceProAnnual();
            default -> null;
        };
    }

    /**
     * Personal Stripe invoices. Club invoices are not Stripe subscription
     * invoices and are served from {@code org_invoices} instead — see
     * {@code GET /api/orgs/{orgId}/invoices}.
     */
    public InvoiceListResponse getInvoices(int limit, String startingAfter) {
        ensureStripeConfigured();
        User currentUser = SecurityUtils.getCurrentUser();

        UserSubscription sub = userSubRepository.findByUserId(currentUser.getId()).orElse(null);
        String customerId = sub != null ? sub.getStripeCustomerId() : null;

        if (customerId == null) {
            log.info("[BILLING] operation=getInvoices user={} result=no_customer", currentUser.getId());
            return new InvoiceListResponse(Collections.emptyList(), false);
        }

        try {
            InvoiceListParams.Builder paramsBuilder = InvoiceListParams.builder()
                .setCustomer(customerId)
                .setLimit((long) limit)
                .addExpand("data.charge");

            if (startingAfter != null && !startingAfter.isBlank()) {
                paramsBuilder.setStartingAfter(startingAfter);
            }

            InvoiceCollection collection = Invoice.list(paramsBuilder.build());

            List<InvoiceResponse> invoices = collection.getData().stream()
                .map(this::mapInvoice)
                .collect(Collectors.toList());

            log.info("[BILLING] operation=getInvoices user={} count={} hasMore={}",
                currentUser.getId(), invoices.size(), collection.getHasMore());

            return new InvoiceListResponse(invoices, Boolean.TRUE.equals(collection.getHasMore()));
        } catch (StripeException e) {
            log.error("[BILLING] Stripe invoice list failed: {}", e.getMessage());
            throw new BadRequestException("Failed to retrieve invoices: " + e.getMessage());
        }
    }

    private InvoiceResponse mapInvoice(Invoice invoice) {
        // Payment method details from expanded charge
        String last4 = null;
        String brand = null;
        long refundedAmount = 0L;

        Charge charge = invoice.getChargeObject();
        if (charge != null) {
            refundedAmount = charge.getAmountRefunded() != null ? charge.getAmountRefunded() : 0L;
            Charge.PaymentMethodDetails pmd = charge.getPaymentMethodDetails();
            if (pmd != null && pmd.getCard() != null) {
                last4 = pmd.getCard().getLast4();
                brand = pmd.getCard().getBrand();
            }
        }

        // Plan name from first line item description
        String planName = null;
        List<InvoiceLineItemResponse> lineItems = Collections.emptyList();
        if (invoice.getLines() != null && invoice.getLines().getData() != null) {
            List<InvoiceLineItem> rawLines = invoice.getLines().getData();
            if (!rawLines.isEmpty() && rawLines.get(0).getDescription() != null) {
                planName = rawLines.get(0).getDescription();
            }
            lineItems = rawLines.stream()
                .map(li -> new InvoiceLineItemResponse(
                    li.getDescription(),
                    li.getAmount() != null ? li.getAmount() : 0L,
                    li.getQuantity() != null ? li.getQuantity() : 0L))
                .collect(Collectors.toList());
        }

        return new InvoiceResponse(
            invoice.getId(),
            invoice.getCreated() != null ? Instant.ofEpochSecond(invoice.getCreated()) : null,
            invoice.getAmountPaid() != null ? invoice.getAmountPaid() : 0L,
            invoice.getCurrency(),
            invoice.getStatus(),
            planName,
            invoice.getPeriodStart() != null ? Instant.ofEpochSecond(invoice.getPeriodStart()) : null,
            invoice.getPeriodEnd() != null ? Instant.ofEpochSecond(invoice.getPeriodEnd()) : null,
            last4,
            brand,
            lineItems,
            invoice.getTax() != null ? invoice.getTax() : 0L,
            refundedAmount,
            invoice.getInvoicePdf()
        );
    }
}
