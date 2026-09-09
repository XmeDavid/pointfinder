package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateCheckoutRequest;
import com.prayer.pointfinder.dto.response.CheckoutResponse;
import com.prayer.pointfinder.dto.response.InvoiceListResponse;
import com.prayer.pointfinder.dto.response.UserSubscriptionResponse;
import com.prayer.pointfinder.service.BillingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Self-serve personal billing. Clubs are sales-led and never touch this
 * controller: see {@code /api/admin/orgs/**} for issuing a club invoice and
 * {@code GET /api/orgs/{orgId}/invoices} for a club's billing history.
 */
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController {

    private final BillingService billingService;

    @PostMapping("/checkout")
    public ResponseEntity<CheckoutResponse> createCheckout(@Valid @RequestBody CreateCheckoutRequest request) {
        return ResponseEntity.ok(billingService.createCheckoutSession(request));
    }

    @PostMapping("/portal")
    public ResponseEntity<Map<String, String>> createPortal() {
        String url = billingService.createPortalSession();
        return ResponseEntity.ok(Map.of("url", url));
    }

    @GetMapping("/status")
    public ResponseEntity<UserSubscriptionResponse> getStatus() {
        return ResponseEntity.ok(billingService.getSubscriptionStatus());
    }

    @GetMapping("/invoices")
    public ResponseEntity<InvoiceListResponse> getInvoices(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String startingAfter) {
        return ResponseEntity.ok(billingService.getInvoices(Math.min(limit, 100), startingAfter));
    }
}
