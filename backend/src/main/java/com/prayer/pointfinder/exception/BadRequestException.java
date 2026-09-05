package com.prayer.pointfinder.exception;

import lombok.Getter;

@Getter
public class BadRequestException extends RuntimeException {

    private final ErrorCode errorCode;
    private final java.util.Map<String, String> errors;

    public BadRequestException(String message) {
        super(message);
        this.errorCode = null;
        this.errors = null;
    }

    public BadRequestException(String message, ErrorCode errorCode) {
        super(message);
        this.errorCode = errorCode;
        this.errors = null;
    }
    public BadRequestException(String message, ErrorCode errorCode, java.util.Map<String, String> errors) {
        super(message);
        this.errorCode = errorCode;
        this.errors = java.util.Map.copyOf(errors);
    }
}
