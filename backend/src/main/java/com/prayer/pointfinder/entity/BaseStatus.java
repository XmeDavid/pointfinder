package com.prayer.pointfinder.entity;

public enum BaseStatus {
    not_visited,
    checked_in,
    submitted,
    completed,
    rejected;

    public static BaseStatus compute(Submission sub, CheckIn checkIn) {
        if (sub != null) {
            return fromSubmissionStatus(sub.getStatus());
        }
        return checkIn != null ? checked_in : not_visited;
    }

    public static BaseStatus fromSubmissionStatus(SubmissionStatus status) {
        return switch (status) {
            case approved, correct -> completed;
            case rejected -> rejected;
            case pending -> submitted;
        };
    }
}
