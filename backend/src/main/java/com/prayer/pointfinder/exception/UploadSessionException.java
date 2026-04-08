package com.prayer.pointfinder.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class UploadSessionException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final boolean retryable;

    public UploadSessionException(HttpStatus status, String code, boolean retryable, String message) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }

    public static UploadSessionException permanent(HttpStatus status, String code, String message) {
        return new UploadSessionException(status, code, false, message);
    }

    public static UploadSessionException retryable(HttpStatus status, String code, String message) {
        return new UploadSessionException(status, code, true, message);
    }
}
