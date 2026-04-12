package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateCheckoutRequest;
import com.prayer.pointfinder.dto.response.CheckoutResponse;
import com.prayer.pointfinder.dto.response.UserSubscriptionResponse;
import com.prayer.pointfinder.service.BillingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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
}
