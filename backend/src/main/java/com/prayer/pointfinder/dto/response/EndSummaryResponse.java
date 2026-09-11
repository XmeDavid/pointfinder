package com.prayer.pointfinder.dto.response;

/** The end confirmation: ending freezes results and leaves pending submissions unreviewed. */
public record EndSummaryResponse(String status, long pendingReviews, long teams, long players) {}
