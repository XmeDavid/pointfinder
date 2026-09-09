package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The admin role gate, over a real HTTP client.
 *
 * <p>MockMvc alone did not catch this: it never performs the container's ERROR
 * dispatch. A real request did, and because the filter chain is stateless and
 * re-runs on that dispatch with an empty context, the authentication entry
 * point overwrote the handler's 403 with a 401 — telling an operator who was
 * already logged in to log in again. {@code SecurityConfig} now writes the 403
 * body itself, which commits the response and leaves nothing to re-dispatch.
 */
class AdminRoleDenialTest extends IntegrationTestBase {

    private ResponseEntity<String> get(String authHeader, String path) {
        return restTemplate.exchange(path, HttpMethod.GET,
                new HttpEntity<>(null, headersWithAuth(authHeader)), String.class);
    }

    @Test
    void anAuthenticatedOperatorAskingForTheAdminTreeGets403NotA401() {
        User operator = createOperator("admin-denial-" + UUID.randomUUID() + "@test.com", "password");

        ResponseEntity<String> denied = get(operatorAuthHeader(operator), "/api/admin/orgs");

        assertEquals(HttpStatus.FORBIDDEN, denied.getStatusCode(),
                "an operator with a valid session is forbidden, not unauthenticated");
    }

    @Test
    void theDenialIsStill403OnANestedAdminPath() {
        User operator = createOperator("admin-denial-" + UUID.randomUUID() + "@test.com", "password");

        assertEquals(HttpStatus.FORBIDDEN,
                get(operatorAuthHeader(operator), "/api/admin/orgs/" + UUID.randomUUID() + "/invoices")
                        .getStatusCode());
    }

    @Test
    void noTokenAtAllIsStill401() {
        assertEquals(HttpStatus.UNAUTHORIZED,
                restTemplate.getForEntity("/api/admin/orgs", String.class).getStatusCode());
    }

    @Test
    void anAdminPassesTheGate() {
        User admin = createAdmin("real-admin-" + UUID.randomUUID() + "@test.com", "password");

        HttpStatus status = (HttpStatus) get(operatorAuthHeader(admin), "/api/admin/orgs").getStatusCode();

        assertEquals(HttpStatus.OK, status);
    }
}
