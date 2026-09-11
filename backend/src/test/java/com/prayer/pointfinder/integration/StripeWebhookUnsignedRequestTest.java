package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Through the real servlet chain, not MockMvc: a webhook call with no
 * Stripe-Signature header is a 400, the same as a forged one.
 */
class StripeWebhookUnsignedRequestTest extends IntegrationTestBase {

    private ResponseEntity<String> post(HttpHeaders headers) {
        headers.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange("/api/webhooks/stripe", HttpMethod.POST,
                new HttpEntity<>("{}", headers), String.class);
    }

    @Test
    void noSignatureHeaderIsABadRequest() {
        ResponseEntity<String> response = post(new HttpHeaders());
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), response.getBody());
    }

    @Test
    void forgedSignatureIsABadRequest() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Stripe-Signature", "t=1,v1=deadbeef");
        ResponseEntity<String> response = post(headers);
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), response.getBody());
    }
}
