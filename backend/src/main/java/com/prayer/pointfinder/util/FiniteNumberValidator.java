package com.prayer.pointfinder.util;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Validator that checks if a number is finite (not NaN or Infinity).
 */
public class FiniteNumberValidator implements ConstraintValidator<ValidFiniteNumber, Double> {
    @Override
    public boolean isValid(Double value, ConstraintValidatorContext context) {
        // Null values are allowed (use @NotNull for required)
        if (value == null) {
            return true;
        }
        // Check that the number is finite
        return Double.isFinite(value);
    }
}
