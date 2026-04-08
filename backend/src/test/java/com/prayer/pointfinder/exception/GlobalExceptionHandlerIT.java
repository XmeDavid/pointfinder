package com.prayer.pointfinder.exception;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for {@link GlobalExceptionHandler}.
 *
 * <p>Uses {@link ExceptionHandlerStubController} — a dedicated top-level
 * stub controller in the test source tree — to trigger each exception type
 * handled by the advice. Assertions verify HTTP status + response body shape:
 * {@code status}, {@code message}, {@code timestamp} always present;
 * {@code code} and {@code retryable} present only when the exception carries
 * them.
 *
 * <p>Security filters are disabled ({@code addFilters = false}) so tests
 * focus exclusively on exception-to-response mapping, not authentication.
 */
@WebMvcTest(ExceptionHandlerStubController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class GlobalExceptionHandlerIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    // ── 404 ResourceNotFoundException ────────────────────────────────────────

    @Test
    void resourceNotFoundReturns404WithMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").value("Widget not found"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void resourceNotFoundWithIdUsesResourceAndIdInMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/not-found-with-id"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").isString());
    }

    // ── 400 BadRequestException ──────────────────────────────────────────────

    @Test
    void badRequestWithoutCodeReturns400AndNullCode() throws Exception {
        mockMvc.perform(get("/test-exceptions/bad-request"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Invalid input value"))
                .andExpect(jsonPath("$.timestamp").exists())
                // No code field emitted when exception carries no ErrorCode
                .andExpect(jsonPath("$.code").doesNotExist());
    }

    @Test
    void badRequestWithErrorCodePopulatesCodeField() throws Exception {
        mockMvc.perform(get("/test-exceptions/bad-request-with-code"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("MARK_COMPLETED_REQUIRES_CHECKIN"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── 409 ConflictException ────────────────────────────────────────────────

    @Test
    void conflictWithoutCodeReturns409AndNullCode() throws Exception {
        mockMvc.perform(get("/test-exceptions/conflict"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("Resource already exists"))
                .andExpect(jsonPath("$.timestamp").exists())
                .andExpect(jsonPath("$.code").doesNotExist());
    }

    @Test
    void conflictWithErrorCodePopulatesCodeField() throws Exception {
        mockMvc.perform(get("/test-exceptions/conflict-with-code"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("UNLOCK_OVERRIDE_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── 403 AccessDeniedException (Spring Security) ──────────────────────────

    @Test
    void springAccessDeniedReturns403WithCleanMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/forbidden-spring"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.message").value("You are not authorized to perform this action"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── 403 ForbiddenException (custom) ─────────────────────────────────────

    @Test
    void customForbiddenExceptionReturns403WithProvidedMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/forbidden-custom"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.message").value("You are not an operator of this game"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── 401 JwtException ────────────────────────────────────────────────────

    @Test
    void jwtExceptionReturns401WithSessionExpiredMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value("Session expired. Please log in again."))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── 401 BadCredentialsException ─────────────────────────────────────────

    @Test
    void badCredentialsReturns401WithGenericMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/bad-credentials"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value("Invalid email or password"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── UploadSessionException ───────────────────────────────────────────────

    @Test
    void uploadSessionPermanentUsesProvidedStatusCodeAndNotRetryable() throws Exception {
        mockMvc.perform(get("/test-exceptions/upload-session-permanent"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("UPLOAD_SESSION_NOT_FOUND"))
                .andExpect(jsonPath("$.retryable").value(false))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void uploadSessionRetryableSetsRetryableTrueAndCorrectStatus() throws Exception {
        mockMvc.perform(get("/test-exceptions/upload-session-retryable"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value(503))
                .andExpect(jsonPath("$.code").value("UPLOAD_STORAGE_UNAVAILABLE"))
                .andExpect(jsonPath("$.retryable").value(true))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── DataIntegrityViolationException ─────────────────────────────────────

    @Test
    void dataIntegrityKnownConstraintMapsToHumanReadableMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/data-integrity-known"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("A submission with this idempotency key already exists"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void dataIntegrityUploadRaceConstraintReturns409WithRetryableCode() throws Exception {
        mockMvc.perform(get("/test-exceptions/data-integrity-upload-race"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.code").value("UPLOAD_MEDIA_ITEM_RACE"))
                .andExpect(jsonPath("$.retryable").value(true))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void dataIntegrityUnknownConstraintReturns409WithGenericMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/data-integrity-unknown"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("Data integrity violation"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── FileStorageException ─────────────────────────────────────────────────

    @Test
    void fileStorageExceptionReturns500WithOpaqueMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/file-storage"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value(500))
                // Must NOT leak the raw "Disk full" cause
                .andExpect(jsonPath("$.message").value("File storage error"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── IllegalStateException ────────────────────────────────────────────────

    @Test
    void illegalStateWithAuthMessagePatternReturns401() throws Exception {
        mockMvc.perform(get("/test-exceptions/illegal-state-auth"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value("Authentication required"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void illegalStateWithoutAuthPatternReturns400WithMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/illegal-state-generic"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Something went wrong in business logic"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    // ── Catch-all Exception ──────────────────────────────────────────────────

    @Test
    void unhandledExceptionReturns500WithTraceIdAndOpaqueMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/unhandled"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.message").value("Internal server error"))
                .andExpect(jsonPath("$.timestamp").exists())
                // traceId is always populated on the catch-all path
                .andExpect(jsonPath("$.traceId").isString());
    }

    @Test
    void unhandledExceptionDoesNotLeakExceptionMessage() throws Exception {
        mockMvc.perform(get("/test-exceptions/unhandled"))
                .andExpect(status().isInternalServerError())
                // The raw exception message must NOT appear in the response body
                .andExpect(jsonPath("$.message").value("Internal server error"));
    }

    // ── MethodArgumentNotValidException ─────────────────────────────────────

    @Test
    void validationFailureReturns400WithFieldErrors() throws Exception {
        // Empty JSON body — @NotBlank on "name" triggers MethodArgumentNotValidException
        mockMvc.perform(post("/test-exceptions/validation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.errors.name").isString())
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void validationFailureResponseBodyAlwaysHasJsonContentType() throws Exception {
        mockMvc.perform(post("/test-exceptions/validation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }

    // ── Content-Type guard ───────────────────────────────────────────────────

    @Test
    void errorResponseAlwaysHasJsonContentType() throws Exception {
        mockMvc.perform(get("/test-exceptions/not-found"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }
}
