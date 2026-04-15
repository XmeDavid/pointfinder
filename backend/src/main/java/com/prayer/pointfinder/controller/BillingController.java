package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateCheckoutRequest;
import com.prayer.pointfinder.dto.request.CreateOrgCheckoutRequest;
import com.prayer.pointfinder.dto.response.CheckoutResponse;
import com.prayer.pointfinder.dto.response.InvoiceListResponse;
import com.prayer.pointfinder.dto.response.UserSubscriptionResponse;
import com.prayer.pointfinder.service.BillingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController {

    private final BillingService billingService;

    @PostMapping("/checkout")
    public ResponseEntity<CheckoutResponse> createCheckout(@Valid @RequestBody CreateCheckoutRequest request) {
        return ResponseEntity.ok(billingService.createCheckoutSession(request));
    }

    @PostMapping("/org-checkout")
    public ResponseEntity<CheckoutResponse> createOrgCheckout(@Valid @RequestBody CreateOrgCheckoutRequest request) {
        return ResponseEntity.ok(billingService.createOrgCheckoutSession(
            request.getOrgName(), request.getPlan(), request.getCycle()));
    }

    @PostMapping("/portal")
    public ResponseEntity<Map<String, String>> createPortal() {
        String url = billingService.createPortalSession();
        return ResponseEntity.ok(Map.of("url", url));
    }

    @PostMapping("/org-portal")
    public ResponseEntity<Map<String, String>> createOrgPortal(@RequestBody Map<String, String> request) {
        UUID orgId = UUID.fromString(request.get("orgId"));
        String url = billingService.createOrgPortalSession(orgId);
        return ResponseEntity.ok(Map.of("url", url));
    }

    @GetMapping("/status")
    public ResponseEntity<UserSubscriptionResponse> getStatus() {
        return ResponseEntity.ok(billingService.getSubscriptionStatus());
    }

    @GetMapping("/invoices")
    public ResponseEntity<InvoiceListResponse> getInvoices(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String startingAfter,
            @RequestParam(required = false) UUID orgId) {
        return ResponseEntity.ok(billingService.getInvoices(orgId, Math.min(limit, 100), startingAfter));
    }
}
