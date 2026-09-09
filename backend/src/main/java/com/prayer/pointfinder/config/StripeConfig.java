package com.prayer.pointfinder.config;

import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
@Getter
public class StripeConfig {

    @Value("${app.stripe.secret-key:}")
    private String secretKey;

    @Value("${app.stripe.webhook-secret:}")
    private String webhookSecret;

    @Value("${app.stripe.prices.individual-pro-monthly:}")
    private String priceProMonthly;

    @Value("${app.stripe.prices.individual-pro-annual:}")
    private String priceProAnnual;

    // Clubs have no Stripe price: an admin issues a one-off invoice for the
    // agreed amount, so there is nothing here to map. The retired
    // STRIPE_PRICE_ORG_* variables can be removed from the deployment.

    @Value("${app.stripe.success-url:}")
    private String successUrl;

    @Value("${app.stripe.cancel-url:}")
    private String cancelUrl;

    @PostConstruct
    public void init() {
        if (secretKey != null && !secretKey.isBlank()) {
            Stripe.apiKey = secretKey;
        }
    }
}
