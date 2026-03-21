package com.prayer.pointfinder.util;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.lang.reflect.Field;
import java.time.Instant;

/**
 * Validator that checks if endDate is after startDate.
 */
public class DateRangeValidator implements ConstraintValidator<ValidDateRange, Object> {

    private String startDateField;
    private String endDateField;

    @Override
    public void initialize(ValidDateRange annotation) {
        this.startDateField = annotation.startDateField();
        this.endDateField = annotation.endDateField();
    }

    @Override
    public boolean isValid(Object value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }

        try {
            Field startField = value.getClass().getDeclaredField(startDateField);
            Field endField = value.getClass().getDeclaredField(endDateField);
            startField.setAccessible(true);
            endField.setAccessible(true);

            Instant startDate = (Instant) startField.get(value);
            Instant endDate = (Instant) endField.get(value);

            // If both dates are null, it's valid (dates are optional)
            if (startDate == null && endDate == null) {
                return true;
            }

            // If only startDate is null, endDate can be anything
            if (startDate == null) {
                return true;
            }

            // If only endDate is null, startDate can be anything
            if (endDate == null) {
                return true;
            }

            // Both are non-null: endDate must be after startDate
            return endDate.isAfter(startDate);
        } catch (Exception e) {
            // If reflection fails, it's likely a framework error, not a validation error
            return true;
        }
    }
}
