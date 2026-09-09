package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.config.StripeConfig;
import com.prayer.pointfinder.service.StripeWebhookService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * A webhook call that is not from Stripe is refused before anything is
 * parsed: no header is a 400, a bad signature is a 400, and the service is
 * never touched either way.
 */
class StripeWebhookControllerSignatureTest {

    private final StripeConfig config = mock(StripeConfig.class);
    private final StripeWebhookService service = mock(StripeWebhookService.class);
    private final StripeWebhookController controller = new StripeWebhookController(config, service);

    @Test
    void aMissingSignatureHeaderIsABadRequestNotAServerError() {
        ResponseEntity<String> response = controller.handleStripeWebhook("{}", null);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verifyNoInteractions(service);
    }

    @Test
    void aBlankSignatureHeaderIsABadRequest() {
        ResponseEntity<String> response = controller.handleStripeWebhook("{}", "   ");

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verifyNoInteractions(service);
    }

    @Test
    void aForgedSignatureIsABadRequest() {
        when(config.getWebhookSecret()).thenReturn("whsec_test");

        ResponseEntity<String> response =
                controller.handleStripeWebhook("{\"id\":\"evt_1\"}", "t=1,v1=deadbeef");

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verifyNoInteractions(service);
    }
}
