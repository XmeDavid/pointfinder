package com.prayer.pointfinder.exception;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.*;
import io.jsonwebtoken.JwtException;

/**
 * Minimal stub controller used by {@link GlobalExceptionHandlerIT} to trigger
 * every exception type handled by {@link GlobalExceptionHandler}.
 *
 * <p>Kept as a top-level class (not an inner class of the test) so that
 * {@code @WebMvcTest(ExceptionHandlerStubController.class)} can locate it
 * through Spring Boot's component scan slice.
 *
 * <p>Each endpoint throws exactly one exception so the handler's response
 * can be asserted in isolation. This controller is registered only in test
 * configuration; it is never deployed in production.
 *
 * <p><strong>Usage:</strong> Test classes wire this controller via
 * {@code @WebMvcTest(ExceptionHandlerStubController.class)} and then invoke
 * its endpoints to verify that {@link GlobalExceptionHandler} produces the
 * correct HTTP status, error code, and response structure for each exception type.
 * Each endpoint in this class maps to a single exception scenario (e.g.,
 * {@code /not-found} throws {@link ResourceNotFoundException},
 * {@code /bad-request-with-code} throws {@link BadRequestException} with
 * an {@link ErrorCode}). The test framework then asserts on the
 * {@code GlobalExceptionHandler} response (status, body shape, error code).
 *
 * <p><strong>Coverage:</strong> All exceptions handled by
 * {@link GlobalExceptionHandler} are covered: resource not found, bad request,
 * conflict, forbidden, JWT errors, upload session errors, data integrity
 * violations, file storage errors, bad credentials, illegal state, and
 * unhandled/generic exceptions.
 */
@RestController
@RequestMapping("/test-exceptions")
public class ExceptionHandlerStubController {

    @GetMapping("/not-found")
    public void notFound() {
        throw new ResourceNotFoundException("Widget not found");
    }

    @GetMapping("/not-found-with-id")
    public void notFoundWithId() {
        throw new ResourceNotFoundException("Game", java.util.UUID.randomUUID());
    }

    @GetMapping("/bad-request")
    public void badRequest() {
        throw new BadRequestException("Invalid input value");
    }

    @GetMapping("/bad-request-with-code")
    public void badRequestWithCode() {
        throw new BadRequestException(
                "Team is not checked in at this base.",
                ErrorCode.MARK_COMPLETED_REQUIRES_CHECKIN);
    }

    @GetMapping("/conflict")
    public void conflict() {
        throw new ConflictException("Resource already exists");
    }

    @GetMapping("/conflict-with-code")
    public void conflictWithCode() {
        throw new ConflictException(
                "An active unlock override already exists",
                ErrorCode.UNLOCK_OVERRIDE_ALREADY_EXISTS);
    }

    @GetMapping("/forbidden-spring")
    public void accessDenied() {
        throw new AccessDeniedException("You shall not pass");
    }

    @GetMapping("/forbidden-custom")
    public void forbiddenCustom() {
        throw new ForbiddenException("You are not an operator of this game");
    }

    @GetMapping("/jwt")
    public void jwtError() {
        throw new JwtException("JWT expired");
    }

    @GetMapping("/upload-session-permanent")
    public void uploadSessionPermanent() {
        throw UploadSessionException.permanent(
                HttpStatus.BAD_REQUEST,
                "UPLOAD_SESSION_NOT_FOUND",
                "Upload session not found");
    }

    @GetMapping("/upload-session-retryable")
    public void uploadSessionRetryable() {
        throw UploadSessionException.retryable(
                HttpStatus.SERVICE_UNAVAILABLE,
                "UPLOAD_STORAGE_UNAVAILABLE",
                "Storage temporarily unavailable");
    }

    @GetMapping("/data-integrity-known")
    public void dataIntegrityKnown() {
        throw new DataIntegrityViolationException(
                "ERROR: duplicate key value violates unique constraint \"submissions_idempotency_key_key\"");
    }

    @GetMapping("/data-integrity-upload-race")
    public void dataIntegrityUploadRace() {
        throw new DataIntegrityViolationException(
                "ERROR: duplicate key value violates unique constraint \"uq_upload_sessions_game_player_media_item_recoverable\"");
    }

    @GetMapping("/data-integrity-unknown")
    public void dataIntegrityUnknown() {
        throw new DataIntegrityViolationException("some_unknown_constraint");
    }

    @GetMapping("/file-storage")
    public void fileStorage() {
        throw new FileStorageException("Disk full", new RuntimeException("root cause"));
    }

    @GetMapping("/bad-credentials")
    public void badCredentials() {
        throw new BadCredentialsException("wrong password");
    }

    @GetMapping("/illegal-state-auth")
    public void illegalStateAuth() {
        throw new IllegalStateException("No authenticated operator found for context");
    }

    @GetMapping("/illegal-state-generic")
    public void illegalStateGeneric() {
        throw new IllegalStateException("Something went wrong in business logic");
    }

    @GetMapping("/unhandled")
    public void unhandled() {
        throw new RuntimeException("completely unexpected");
    }

    @PostMapping("/validation")
    public void validationEndpoint(@Valid @RequestBody ValidatedBody body) {
        // Body with @NotBlank will trigger MethodArgumentNotValidException
    }

    public static class ValidatedBody {
        @NotBlank
        private String name;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
    }
}
