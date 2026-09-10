package com.prayer.pointfinder.service.ratelimit;

/**
 * The shared rate-limit store could not answer. Limiters throw this instead
 * of allowing the request so a database problem fails closed. Mapped to
 * {@code 503 Service Unavailable} by the global handler.
 */
public class RateLimitStoreUnavailableException extends RuntimeException {
    public RateLimitStoreUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
