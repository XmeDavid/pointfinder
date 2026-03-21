package com.prayer.pointfinder.util;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraintvalidation.SupportedValidationTarget;
import jakarta.validation.valueextraction.Unwrapping;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Validates that a number is finite (not NaN, Infinity, or -Infinity).
 */
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Constraint(validatedBy = FiniteNumberValidator.class)
public @interface ValidFiniteNumber {
    String message() default "Number must be finite (not NaN or Infinity)";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
