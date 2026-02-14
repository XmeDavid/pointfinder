package com.prayer.pointfinder.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    public record ErrorResponse(int status, String message, Map<String, String> errors, Instant timestamp) {}

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(error(HttpStatus.NOT_FOUND, ex.getMessage()));
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(BadRequestException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(error(HttpStatus.BAD_REQUEST, ex.getMessage()));
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(ConflictException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(error(HttpStatus.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        String message = mapDataIntegrityMessage(ex);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(error(HttpStatus.CONFLICT, message));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(ForbiddenException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(error(HttpStatus.FORBIDDEN, ex.getMessage()));
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(error(HttpStatus.UNAUTHORIZED, "Invalid email or password"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String field = ((FieldError) error).getField();
            String msg = error.getDefaultMessage();
            errors.put(field, msg);
        });
        return ResponseEntity.badRequest().body(error(HttpStatus.BAD_REQUEST, "Validation failed", errors));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ErrorResponse> handleIllegalState(IllegalStateException ex) {
        if (ex.getMessage() != null && ex.getMessage().startsWith("No authenticated")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(error(HttpStatus.UNAUTHORIZED, "Authentication required"));
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(error(HttpStatus.BAD_REQUEST, ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(error(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error"));
    }

    private ErrorResponse error(HttpStatus status, String message) {
        return error(status, message, null);
    }

    private ErrorResponse error(HttpStatus status, String message, Map<String, String> errors) {
        return new ErrorResponse(status.value(), message, errors, Instant.now());
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
