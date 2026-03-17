package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Assignment;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

public final class AssignmentResolver {

    public static final Comparator<Assignment> RECENCY_COMPARATOR =
            Comparator.comparing(
                            Assignment::getCreatedAt,
                            Comparator.nullsLast(Comparator.reverseOrder())
                    )
                    .thenComparing(a -> a.getId().toString(), Comparator.reverseOrder());

    private AssignmentResolver() {}

    public static Challenge resolve(Base base, UUID teamId, List<Assignment> sortedAssignments) {
        Assignment teamSpecific = sortedAssignments.stream()
                .filter(a -> a.getTeam() != null && a.getTeam().getId().equals(teamId)
                        && a.getBase().getId().equals(base.getId()))
                .findFirst()
                .orElse(null);
        Assignment global = sortedAssignments.stream()
                .filter(a -> a.getTeam() == null && a.getBase().getId().equals(base.getId()))
                .findFirst()
                .orElse(null);
        Assignment assignment = teamSpecific != null ? teamSpecific : global;
        return assignment != null ? assignment.getChallenge() : base.getFixedChallenge();
    }
}
