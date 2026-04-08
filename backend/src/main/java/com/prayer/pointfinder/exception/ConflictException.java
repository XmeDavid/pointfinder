package com.prayer.pointfinder.exception;

import lombok.Getter;

@Getter
public class ConflictException extends RuntimeException {

    private final ErrorCode errorCode;

    public ConflictException(String message) {
        super(message);
        this.errorCode = null;
    }

    public ConflictException(String message, ErrorCode errorCode) {
        super(message);
        this.errorCode = errorCode;
    }
}
