package com.prayer.pointfinder.exception;

import lombok.Getter;

import java.util.Map;

@Getter
public class ConflictException extends RuntimeException {
    private final ErrorCode errorCode;
    /** Machine-readable details a client can act on, e.g. where an account already plays. */
    private final Map<String, String> errors;

    public ConflictException(String message) {
        this(message, null, null);
    }

    public ConflictException(String message, ErrorCode errorCode) {
        this(message, errorCode, null);
    }

    public ConflictException(String message, ErrorCode errorCode, Map<String, String> errors) {
        super(message);
        this.errorCode = errorCode;
        this.errors = errors;
    }
}
