package com.prayer.pointfinder.dto.request;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class BaseRequestValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsLatitudeAbove90() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(91.0);
        req.setLng(0.0);
        assertThat(validator.validate(req))
            .anyMatch(v -> v.getPropertyPath().toString().equals("lat"));
    }

    @Test
    void rejectsLatitudeBelow90() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(-91.0);
        req.setLng(0.0);
        assertThat(validator.validate(req))
            .anyMatch(v -> v.getPropertyPath().toString().equals("lat"));
    }

    @Test
    void rejectsLongitudeAbove180() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(0.0);
        req.setLng(181.0);
        assertThat(validator.validate(req))
            .anyMatch(v -> v.getPropertyPath().toString().equals("lng"));
    }

    @Test
    void acceptsValidCoordinates() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(47.3769);
        req.setLng(8.5417);
        assertThat(validator.validate(req)).isEmpty();
    }

    @Test
    void acceptsBoundaryCoordinates() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(90.0);
        req.setLng(-180.0);
        assertThat(validator.validate(req)).isEmpty();
    }
}
