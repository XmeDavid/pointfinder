package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record GameResponse(
        UUID id,
        String name,
        String description,
        Instant startDate,
        Instant endDate,
        String status,
        UUID createdBy,
        List<UUID> operatorIds,
        Boolean uniformAssignment,
        Boolean broadcastEnabled,
        String broadcastCode,
        String tileSource,
        String unlockTrigger,
        UUID orgId,
        String orgName,
        Boolean enforceBaseOrder,
        /** Method copied onto new bases: {@code NFC}, {@code QR}, {@code LOCATION}. */
        String defaultCheckInMethod,
        /** Radius in metres used by location bases with no override. */
        Integer defaultCheckInRadiusM,
        /** Scenario id when this is a tutorial's practice game; null for a normal game. */
        String tutorialScenario,
        /** When the scheduler ends a practice game; null for a normal game. */
        Instant tutorialExpiresAt,
        /**
         * Whether this game may use location check-in under the plan that
         * owns it, as the server will actually enforce it: {@code false}
         * only when enforcement is on and the plan excludes it. Null when
         * the caller did not resolve it (admin listings).
         */
        Boolean locationCheckInAllowed,
        /** ISO 639-1 code of the content's language, or null when the organizer did not say. */
        String contentLanguage,
        /**
         * OW-40: whether any route of the game (the default route, or a stage's) is
         * enforced; what the route editor should key on. Null when the caller did not
         * resolve it (admin listings, imports).
         */
        Boolean routeOrderEnforced
) {
    public GameResponse(UUID id, String name, String description, Instant startDate, Instant endDate, String status, UUID createdBy, List<UUID> operatorIds, Boolean uniformAssignment, Boolean broadcastEnabled, String broadcastCode, String tileSource, String unlockTrigger, UUID orgId, String orgName, Boolean enforceBaseOrder, String defaultCheckInMethod, Integer defaultCheckInRadiusM) {
        this(id, name, description, startDate, endDate, status, createdBy, operatorIds, uniformAssignment, broadcastEnabled, broadcastCode, tileSource, unlockTrigger, orgId, orgName, enforceBaseOrder, defaultCheckInMethod, defaultCheckInRadiusM, null, null, null, null, null);
    }
    public GameResponse(UUID id, String name, String description, Instant startDate, Instant endDate, String status, UUID createdBy, List<UUID> operatorIds, Boolean uniformAssignment, Boolean broadcastEnabled, String broadcastCode, String tileSource, String unlockTrigger, UUID orgId, String orgName) {
        this(id, name, description, startDate, endDate, status, createdBy, operatorIds, uniformAssignment, broadcastEnabled, broadcastCode, tileSource, unlockTrigger, orgId, orgName, false, "NFC", 15);
    }

    public GameResponse(UUID id, String name, String description, Instant startDate, Instant endDate, String status, UUID createdBy, List<UUID> operatorIds, Boolean uniformAssignment, Boolean broadcastEnabled, String broadcastCode, String tileSource, String unlockTrigger, UUID orgId, String orgName, Boolean enforceBaseOrder) {
        this(id, name, description, startDate, endDate, status, createdBy, operatorIds, uniformAssignment, broadcastEnabled, broadcastCode, tileSource, unlockTrigger, orgId, orgName, enforceBaseOrder, "NFC", 15);
    }
}
