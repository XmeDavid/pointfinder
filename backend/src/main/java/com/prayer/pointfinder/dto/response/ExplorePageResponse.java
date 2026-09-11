package com.prayer.pointfinder.dto.response;

import java.util.List;

/** PF-08: one bounded page of listings. */
public record ExplorePageResponse(
        List<ExploreGameResponse> items,
        int page,
        int size,
        long total,
        boolean hasMore
) {}
