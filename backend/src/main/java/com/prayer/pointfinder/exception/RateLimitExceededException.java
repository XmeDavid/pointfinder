package com.prayer.pointfinder.exception;

import lombok.Getter;

/**
 * Thrown when a caller exceeds a rate-limit bucket (per IP or per device).
 * The global exception handler maps this to HTTP 429 with error code
 * {@link ErrorCode#RATE_LIMITED}.
 */
@Getter
public class RateLimitExceededException extends RuntimeException {

    private final ErrorCode errorCode;

    public RateLimitExceededException(String message) {
        super(message);
        this.errorCode = ErrorCode.RATE_LIMITED;
    }
}
