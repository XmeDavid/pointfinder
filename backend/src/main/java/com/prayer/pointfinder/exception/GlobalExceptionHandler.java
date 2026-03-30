package com.prayer.pointfinder.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Pattern AUTH_MESSAGE_PATTERN = Pattern.compile(
            "No authenticated (user|player|operator) found", Pattern.CASE_INSENSITIVE);

    public record ErrorResponse(int status, String message, Map<String, String> errors, Instant timestamp, String traceId) {}

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        return jsonError(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(BadRequestException ex) {
        return jsonError(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(ConflictException ex) {
        return jsonError(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        String message = mapDataIntegrityMessage(ex);
        if ("Data integrity violation".equals(message)) {
            log.warn("Unmapped data integrity violation", ex);
        }
        return jsonError(HttpStatus.CONFLICT, message);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(ForbiddenException ex) {
        return jsonError(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    @ExceptionHandler(FileStorageException.class)
    public ResponseEntity<ErrorResponse> handleFileStorage(FileStorageException ex) {
        log.error("File storage error", ex);
        return jsonError(HttpStatus.INTERNAL_SERVER_ERROR, "File storage error");
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleBadCredentials(BadCredentialsException ex) {
        return jsonError(HttpStatus.UNAUTHORIZED, "Invalid email or password");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            if (error instanceof FieldError fieldError) {
                errors.put(fieldError.getField(), fieldError.getDefaultMessage());
            } else {
                errors.put(error.getObjectName(), error.getDefaultMessage());
            }
        });
        return jsonError(HttpStatus.BAD_REQUEST, "Validation failed", errors);
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ErrorResponse> handleIllegalState(IllegalStateException ex) {
        String msg = ex.getMessage();
        if (msg != null && AUTH_MESSAGE_PATTERN.matcher(msg).find()) {
            return jsonError(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return jsonError(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception ex) {
        String traceId = UUID.randomUUID().toString();
        log.error("Unhandled exception [traceId={}]", traceId, ex);
        return jsonError(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error", null, traceId);
    }

    /** Build a JSON error response that always sets Content-Type: application/json,
     *  preventing Spring from trying to serialize ErrorResponse as video/mp4 etc.
     *  when the original request targeted a file endpoint. */
    private ResponseEntity<ErrorResponse> jsonError(HttpStatus status, String message) {
        return jsonError(status, message, null, null);
    }

    private ResponseEntity<ErrorResponse> jsonError(HttpStatus status, String message, Map<String, String> errors) {
        return jsonError(status, message, errors, null);
    }

    private ResponseEntity<ErrorResponse> jsonError(HttpStatus status, String message, Map<String, String> errors, String traceId) {
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new ErrorResponse(status.value(), message, errors, Instant.now(), traceId));
    }

    private String mapDataIntegrityMessage(DataIntegrityViolationException ex) {
        String source = ex.getMostSpecificCause() != null
                ? ex.getMostSpecificCause().getMessage()
                : ex.getMessage();
        if (source == null) {
            return "Data integrity violation";
        }

        String normalized = source.toLowerCase();
        if (normalized.contains("uq_assignments_game_base_team")
                || normalized.contains("uq_assignments_game_base_allteams")) {
            return "Assignment conflicts with an existing assignment for this base/team scope";
        }
        if (normalized.contains("submissions_idempotency_key_key")) {
            return "A submission with this idempotency key already exists";
        }
        if (normalized.contains("idx_check_ins_team_base")) {
            return "Team has already checked in at this base";
        }
        if (normalized.contains("users_email_key")) {
            return "A user with this email already exists";
        }
        if (normalized.contains("teams_join_code_key")) {
            return "Generated team join code already exists. Please retry";
        }
        if (normalized.contains("operator_invites_token_key")) {
            return "Generated invite token already exists. Please retry";
        }

        return "Data integrity violation";
    }
}
