package com.dbv.scoutmission.dto.request;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerJoinRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsOutOfBoundsFieldLengths() {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("A");
        request.setDisplayName("x".repeat(101));
        request.setDeviceId("d".repeat(129));

        Set<ConstraintViolation<PlayerJoinRequest>> violations = validator.validate(request);
        Set<String> fields = violations.stream()
                .map(v -> v.getPropertyPath().toString())
                .collect(Collectors.toSet());

        assertTrue(fields.contains("joinCode"));
        assertTrue(fields.contains("displayName"));
        assertTrue(fields.contains("deviceId"));
    }

    @Test
    void acceptsValuesWithinBounds() {
        PlayerJoinRequest request = new PlayerJoinRequest();
        request.setJoinCode("ABC1234");
        request.setDisplayName("Explorer Team");
        request.setDeviceId("ios-device-001");

        Set<ConstraintViolation<PlayerJoinRequest>> violations = validator.validate(request);
        assertFalse(violations.iterator().hasNext());
    }
}
