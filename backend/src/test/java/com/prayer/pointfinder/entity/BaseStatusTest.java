package com.prayer.pointfinder.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BaseStatusTest {

    @Test
    void computeReturnsNotVisitedWhenNoSubmissionOrCheckIn() {
        assertEquals(BaseStatus.not_visited, BaseStatus.compute(null, null));
    }

    @Test
    void computeReturnsCheckedInWhenOnlyCheckInPresent() {
        CheckIn checkIn = CheckIn.builder().build();
        assertEquals(BaseStatus.checked_in, BaseStatus.compute(null, checkIn));
    }

    @Test
    void computeReturnsSubmittedForPendingSubmission() {
        Submission sub = Submission.builder().status(SubmissionStatus.pending).build();
        assertEquals(BaseStatus.submitted, BaseStatus.compute(sub, null));
    }

    @Test
    void computeReturnsCompletedForApprovedSubmission() {
        Submission sub = Submission.builder().status(SubmissionStatus.approved).build();
        assertEquals(BaseStatus.completed, BaseStatus.compute(sub, null));
    }

    @Test
    void computeReturnsCompletedForCorrectSubmission() {
        Submission sub = Submission.builder().status(SubmissionStatus.correct).build();
        assertEquals(BaseStatus.completed, BaseStatus.compute(sub, null));
    }

    @Test
    void computeReturnsRejectedForRejectedSubmission() {
        Submission sub = Submission.builder().status(SubmissionStatus.rejected).build();
        assertEquals(BaseStatus.rejected, BaseStatus.compute(sub, null));
    }

    @Test
    void computePrioritizesSubmissionOverCheckIn() {
        CheckIn checkIn = CheckIn.builder().build();
        Submission sub = Submission.builder().status(SubmissionStatus.pending).build();
        assertEquals(BaseStatus.submitted, BaseStatus.compute(sub, checkIn));
    }

    @Test
    void fromSubmissionStatusCoversAllValues() {
        assertEquals(BaseStatus.submitted, BaseStatus.fromSubmissionStatus(SubmissionStatus.pending));
        assertEquals(BaseStatus.completed, BaseStatus.fromSubmissionStatus(SubmissionStatus.approved));
        assertEquals(BaseStatus.completed, BaseStatus.fromSubmissionStatus(SubmissionStatus.correct));
        assertEquals(BaseStatus.rejected, BaseStatus.fromSubmissionStatus(SubmissionStatus.rejected));
    }
}
