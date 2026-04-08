package com.prayer.pointfinder.dto.request;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BulkAssignmentRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    // ------------------------------------------------------------------
    //  H1: BulkAssignmentRequest size cap
    // ------------------------------------------------------------------

    @Test
    void rejectsListLargerThan500() {
        var req = new BulkAssignmentRequest();
        req.setAssignments(buildList(501));
        assertThat(validator.validate(req))
                .anyMatch(v -> v.getPropertyPath().toString().equals("assignments"));
    }

    @Test
    void rejectsNullAssignmentsList() {
        var req = new BulkAssignmentRequest();
        req.setAssignments(null);
        assertThat(validator.validate(req))
                .anyMatch(v -> v.getPropertyPath().toString().equals("assignments"));
    }

    @Test
    void acceptsListExactlyAt500() {
        var req = new BulkAssignmentRequest();
        req.setAssignments(buildList(500));
        // @Size(max=500) is inclusive — 500 items must pass.
        assertThat(validator.validate(req)).isEmpty();
    }

    @Test
    void acceptsEmptyList() {
        var req = new BulkAssignmentRequest();
        req.setAssignments(new ArrayList<>());
        assertThat(validator.validate(req)).isEmpty();
    }

    @Test
    void acceptsSingleItemList() {
        var req = new BulkAssignmentRequest();
        req.setAssignments(buildList(1));
        assertThat(validator.validate(req)).isEmpty();
    }

    // ------------------------------------------------------------------
    //  Helpers
    // ------------------------------------------------------------------

    private List<CreateAssignmentRequest> buildList(int size) {
        List<CreateAssignmentRequest> list = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            var item = new CreateAssignmentRequest();
            item.setBaseId(UUID.randomUUID());
            item.setChallengeId(UUID.randomUUID());
            list.add(item);
        }
        return list;
    }
}
