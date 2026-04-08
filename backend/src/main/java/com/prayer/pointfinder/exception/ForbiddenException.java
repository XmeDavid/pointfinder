package com.prayer.pointfinder.exception;

import lombok.Getter;

@Getter
public class ForbiddenException extends RuntimeException {

    private final ErrorCode errorCode;

    public ForbiddenException(String message) {
        super(message);
        this.errorCode = null;
    }

    public ForbiddenException(String message, ErrorCode errorCode) {
        super(message);
        this.errorCode = errorCode;
    }
}
