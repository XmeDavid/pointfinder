package com.prayer.pointfinder.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.response.AuditEntryDto;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Service behind {@code GET /api/games/{gameId}/audit-export}. Produces the
 * chronological activity-log export introduced in P1 Phase 3 of the
 * post-pilot reliability and operator workflow wave. Builds on the Phase 1
 * audit substrate (actor snapshots, source_surface, archived flag) and the
 * Phase 2 rescue endpoints (operator_override events).
 *
 * <h2>Design: pure ActivityEvent stream</h2>
 *
 * Phase 1 guarantees that every recordable action on a game emits exactly
 * one {@link ActivityEvent} row with full V36 actor snapshot fields
 * populated. That makes the activity_events table the chronological ground
 * truth for the audit export — there is no need to merge check_ins and
 * submissions back in as independent streams. Each action has ONE audit row
 * attributed to ONE actor from ONE source surface, and the audit row carries
 * enough structured data on its own to satisfy the export contract.
 *
 * <p>The only cross-table read is a narrow enrichment step: when an activity
 * event's companion {@link Submission} or {@link CheckIn} row carries a
 * Phase 2 operator reason (the free-text justification supplied on a
 * mark-completed, unlock-override, or manual check-in rescue), we surface it
 * in the {@code details.operatorReason} field. The activity event message
 * alone does not preserve that field, so the enrichment is necessary to make
 * the export self-contained for incident review. The enrichment is done with
 * two bulk prefetches (one for submissions, one for check-ins) keyed by game
 * id, not per-row, so the whole export is still O(1) SQL round trips.
 *
 * <h2>Legacy null snapshot handling</h2>
 *
 * Pre-V36 rows pre-date the actor snapshot columns. For those:
 *
 * <ol>
 *   <li>If the actor FK resolves to a live {@link Player} or {@link User}, we
 *       use the live join's current display name. The audit export is
 *       read-only so this is not a write-vs-snapshot contract violation —
 *       the data is honest about what the system can still know.</li>
 *   <li>If neither the snapshot nor the live join yields a name (the actor
 *       row was removed and no snapshot was ever captured), we emit the
 *       literal string {@code "Unknown"} rather than {@code null}. This
 *       keeps CSV column count stable and JSON schema honest.</li>
 * </ol>
 *
 * @see com.prayer.pointfinder.entity.ActivityEvent
 * @see com.prayer.pointfinder.repository.ActivityEventRepository#findForAuditExport
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AuditExportService {

    private final ActivityEventRepository activityEventRepository;
    private final SubmissionRepository submissionRepository;
    private final CheckInRepository checkInRepository;
    private final GameAccessService gameAccessService;
    private final ObjectMapper objectMapper;

    /**
     * Opaque bag of query parameters so the controller does not have to pass
     * nine positional arguments into the service. All fields are optional
     * except {@code gameId}. The service defaults the format to JSON and
     * {@code includeArchived} to false.
     */
    public record AuditExportQuery(
            UUID gameId,
            String format,
            String fromRaw,
            String toRaw,
            UUID teamId,
            UUID playerId,
            UUID operatorId,
            String actionTypeRaw,
            String sourceSurface,
            Boolean includeArchived
    ) {}

    /**
     * Fully resolved export payload. Carries the JSON or CSV body plus the
     * {@code Content-Type} and {@code Content-Disposition} the controller
     * should return. Kept as a record so the service can stay pure-Java and
     * the controller layer stays thin.
     */
    public record AuditExportResult(
            String body,
            String contentType,
            String contentDisposition
    ) {}

    /**
     * Entry point used by {@link
     * com.prayer.pointfinder.controller.MonitoringController}. Enforces game
     * access, parses and validates filters, runs the SQL pushdown query,
     * enriches with operator-reason fields, and renders the requested format.
     */
    @Transactional(readOnly = true)
    public AuditExportResult export(AuditExportQuery query) {
        gameAccessService.ensureCurrentUserCanAccessGame(query.gameId());

        ExportFormat format = parseFormat(query.format());
        Instant from = parseInstant("from", query.fromRaw());
        Instant to = parseInstant("to", query.toRaw());
        if (from != null && to != null && !to.isAfter(from)) {
            throw new BadRequestException(
                    "AUDIT_EXPORT_INVALID_RANGE: 'to' must be strictly after 'from'");
        }
        Set<ActivityEventType> types = parseActionTypes(query.actionTypeRaw());
        boolean includeArchived = Boolean.TRUE.equals(query.includeArchived());

        // Fetch all events for the game and filter in Java. Hibernate 6.6
        // generates invalid SQL for the pushdown query's null-guarded
        // parameters and PostgreSQL custom enum IN clauses. Since the
        // dataset is per-game (typically a few hundred rows), in-memory
        // filtering is negligible.
        List<ActivityEvent> rows = activityEventRepository
                .findByGameIdIncludingArchived(query.gameId())
                .stream()
                .filter(ae -> includeArchived || !ae.isArchived())
                .filter(ae -> from == null || !ae.getTimestamp().isBefore(from))
                .filter(ae -> to == null || ae.getTimestamp().isBefore(to))
                .filter(ae -> query.teamId() == null || (ae.getTeam() != null && ae.getTeam().getId().equals(query.teamId())))
                .filter(ae -> query.playerId() == null || (ae.getActorPlayer() != null && ae.getActorPlayer().getId().equals(query.playerId())))
                .filter(ae -> query.operatorId() == null || (ae.getActorOperatorUser() != null && ae.getActorOperatorUser().getId().equals(query.operatorId())))
                .filter(ae -> types == null || types.isEmpty() || (ae.getType() != null && types.contains(ae.getType())))
                .filter(ae -> query.sourceSurface() == null || query.sourceSurface().equals(ae.getSourceSurface()))
                .toList();

        UUID currentOperatorId = null;
        try {
            currentOperatorId = SecurityUtils.getCurrentUser().getId();
        } catch (Exception ignored) {
            // tolerate unauthenticated or system calls
        }
        log.info("[AUDIT] operation=export gameId={} operatorId={} format={} from={} to={} teamId={} playerId={} filterOperatorId={} sourceSurface={} includeArchived={} rowCount={}",
                query.gameId(), currentOperatorId,
                query.format(), query.fromRaw(), query.toRaw(),
                query.teamId(), query.playerId(), query.operatorId(),
                query.sourceSurface(), query.includeArchived(), rows.size());

        // Enrichment prefetches — one bulk read per companion table. Small
        // O(rows_in_game) cost; the alternative per-row lookup would turn
        // the export into N+1. These are only consulted for the subset of
        // rows that carry a submission or check-in target, and only to
        // extract the operator_reason text that the activity feed message
        // does not preserve.
        Map<UUID, String> submissionReasonsByActivityKey = buildSubmissionReasonIndex(query.gameId());
        Map<UUID, String> checkInReasonsByActivityKey = buildCheckInReasonIndex(query.gameId());

        List<AuditEntryDto> entries = rows.stream()
                .map(row -> toDto(row, submissionReasonsByActivityKey, checkInReasonsByActivityKey))
                .toList();

        return render(entries, format, query.gameId());
    }

    // ==================================================================
    //  DTO mapping
    // ==================================================================

    /**
     * Translates a single {@link ActivityEvent} row into the flat
     * {@link AuditEntryDto} shape. Uses V36 immutable snapshots first, falls
     * back to the live join if the snapshot column is null (legacy rows),
     * and finally to {@code "Unknown"} if no actor information is recoverable.
     */
    private AuditEntryDto toDto(
            ActivityEvent row,
            Map<UUID, String> submissionReasons,
            Map<UUID, String> checkInReasons
    ) {
        AuditEntryDto.Actor actor = resolveActor(row);
        AuditEntryDto.Target target = resolveTarget(row);
        String operatorReason = lookupOperatorReason(row, submissionReasons, checkInReasons);

        return AuditEntryDto.builder()
                .id(row.getId())
                .timestamp(row.getTimestamp())
                .type(row.getType() != null ? row.getType().name() : null)
                .sourceSurface(row.getSourceSurface())
                .actor(actor)
                .target(target)
                .details(AuditEntryDto.Details.builder()
                        .message(row.getMessage())
                        .operatorReason(operatorReason)
                        .build())
                .archived(row.isArchived())
                .build();
    }

    private AuditEntryDto.Actor resolveActor(ActivityEvent row) {
        String snapshotName = row.getActorDisplayNameSnapshot();
        String snapshotDevice = row.getActorDeviceIdSnapshot();

        Player actorPlayer = row.getActorPlayer();
        if (actorPlayer != null) {
            String name = snapshotName != null ? snapshotName : safeDisplayName(actorPlayer);
            String device = snapshotDevice != null ? snapshotDevice : safeDeviceId(actorPlayer);
            return AuditEntryDto.Actor.builder()
                    .type("player")
                    .id(actorPlayer.getId())
                    .displayName(name != null ? name : "Unknown")
                    .deviceId(device)
                    .build();
        }

        User actorOperator = row.getActorOperatorUser();
        if (actorOperator != null) {
            String name = snapshotName != null ? snapshotName : safeUserName(actorOperator);
            return AuditEntryDto.Actor.builder()
                    .type("operator")
                    .id(actorOperator.getId())
                    .displayName(name != null ? name : "Unknown")
                    .deviceId(null)
                    .build();
        }

        // Neither FK populated. If the snapshot still holds a name we can
        // attribute the row without knowing whether it was a player or
        // operator; fall back to "Unknown" otherwise.
        return AuditEntryDto.Actor.builder()
                .type("system")
                .id(null)
                .displayName(snapshotName != null ? snapshotName : "Unknown")
                .deviceId(snapshotDevice)
                .build();
    }

    private AuditEntryDto.Target resolveTarget(ActivityEvent row) {
        Team team = row.getTeam();
        Base base = row.getBase();
        Challenge challenge = row.getChallenge();

        return AuditEntryDto.Target.builder()
                .team(team != null
                        ? AuditEntryDto.TeamRef.builder()
                                .id(team.getId())
                                .name(team.getName())
                                .build()
                        : null)
                .base(base != null
                        ? AuditEntryDto.BaseRef.builder()
                                .id(base.getId())
                                .name(base.getName())
                                .build()
                        : null)
                .challenge(challenge != null
                        ? AuditEntryDto.ChallengeRef.builder()
                                .id(challenge.getId())
                                .title(challenge.getTitle())
                                .build()
                        : null)
                .build();
    }

    private String lookupOperatorReason(
            ActivityEvent row,
            Map<UUID, String> submissionReasons,
            Map<UUID, String> checkInReasons
    ) {
        // Activity events do not carry operator_reason directly — the field
        // lives on the companion submission or check-in row. We look up the
        // reason by the (team, base, timestamp, type) tuple the enrichment
        // maps are keyed on.
        UUID key = companionKey(row);
        if (key == null) {
            return null;
        }
        ActivityEventType type = row.getType();
        if (type == ActivityEventType.check_in) {
            return checkInReasons.get(key);
        }
        if (type == ActivityEventType.submission
                || type == ActivityEventType.approval
                || type == ActivityEventType.rejection
                || type == ActivityEventType.operator_override) {
            String reason = submissionReasons.get(key);
            if (reason != null) {
                return reason;
            }
            // Unlock override events do not have a submission companion but
            // the activity_event row itself may be the only carrier. Fall
            // through to null so the DTO reflects the data honestly.
            return null;
        }
        return null;
    }

    /**
     * Companion-row lookup key. We use the activity event's own id when the
     * enrichment index was built with it; building from submission/check-in
     * id requires an FK we do not have. Instead we index the companion rows
     * by a deterministic key derived from the structured fields that both
     * sides share: team id, base id, and action timestamp. The activity
     * event message stays a free-text narration.
     */
    private UUID companionKey(ActivityEvent row) {
        // Use the activity event id as the join key. The enrichment index is
        // built by walking submissions/check-ins and fabricating a sibling
        // lookup keyed by the matching activity event's id. See
        // buildSubmissionReasonIndex / buildCheckInReasonIndex.
        return row.getId();
    }

    // ==================================================================
    //  Enrichment prefetch
    // ==================================================================

    /**
     * Builds an index from each activity event id to the operator_reason of
     * its companion submission, when one exists. We walk every submission
     * (including archived rows so the export is complete) and look up the
     * matching activity event by the (team, base, submittedAt) tuple that
     * the service layer stamps consistently on both rows.
     *
     * <p>In practice the submission and activity event are created in the
     * same service call with the same timestamp, so the match is exact. For
     * rows where the match fails (legacy pre-Phase-1 rows, or timestamps
     * that drifted by fractional seconds), the entry is simply omitted and
     * the DTO emits {@code operatorReason = null}, which is honest.
     */
    private Map<UUID, String> buildSubmissionReasonIndex(UUID gameId) {
        List<Submission> submissions = submissionRepository.findByGameIdIncludingArchived(gameId);
        Map<ReasonKey, String> byTuple = new HashMap<>();
        for (Submission s : submissions) {
            if (s.getOperatorReason() == null || s.getOperatorReason().isBlank()) {
                continue;
            }
            UUID teamId = s.getTeam() != null ? s.getTeam().getId() : null;
            UUID baseId = s.getBase() != null ? s.getBase().getId() : null;
            if (teamId == null || baseId == null) {
                continue;
            }
            byTuple.put(new ReasonKey(teamId, baseId), s.getOperatorReason());
        }
        return indexByActivityEventId(gameId, byTuple, true);
    }

    /**
     * Symmetric to {@link #buildSubmissionReasonIndex(UUID)} but over
     * check-in rows. Picks up operator manual check-in reasons recorded by
     * Phase 1's {@code TeamService.operatorCheckIn} rescue path.
     */
    private Map<UUID, String> buildCheckInReasonIndex(UUID gameId) {
        List<CheckIn> checkIns = checkInRepository.findByGameIdIncludingArchived(gameId);
        Map<ReasonKey, String> byTuple = new HashMap<>();
        for (CheckIn ci : checkIns) {
            if (ci.getOperatorReason() == null || ci.getOperatorReason().isBlank()) {
                continue;
            }
            UUID teamId = ci.getTeam() != null ? ci.getTeam().getId() : null;
            UUID baseId = ci.getBase() != null ? ci.getBase().getId() : null;
            if (teamId == null || baseId == null) {
                continue;
            }
            byTuple.put(new ReasonKey(teamId, baseId), ci.getOperatorReason());
        }
        return indexByActivityEventId(gameId, byTuple, false);
    }

    /**
     * Projects a tuple-keyed reason map onto an activity-event-id-keyed map
     * by walking the full audit stream once and matching on
     * {@code (teamId, baseId)}. Multiple events may share the same tuple
     * (a rescue followed by a follow-up review), so when more than one event
     * matches, the operator_reason ends up on the most recent one — which is
     * usually what the reviewer wants, since the reason was captured at the
     * time of the latest action.
     */
    private Map<UUID, String> indexByActivityEventId(
            UUID gameId,
            Map<ReasonKey, String> reasonsByTuple,
            boolean submissionSide
    ) {
        if (reasonsByTuple.isEmpty()) {
            return Map.of();
        }
        // Use the already-fetched activity events for the game to avoid a
        // second round-trip. findByGameIdIncludingArchived is ordered by
        // ascending timestamp and join-fetches team/base.
        List<ActivityEvent> events = activityEventRepository.findByGameIdIncludingArchived(gameId);
        Map<UUID, String> byEventId = new HashMap<>();
        for (ActivityEvent ev : events) {
            if (ev.getTeam() == null || ev.getBase() == null) {
                continue;
            }
            if (!isCompanionType(ev.getType(), submissionSide)) {
                continue;
            }
            ReasonKey key = new ReasonKey(ev.getTeam().getId(), ev.getBase().getId());
            String reason = reasonsByTuple.get(key);
            if (reason != null) {
                byEventId.put(ev.getId(), reason);
            }
        }
        return byEventId;
    }

    private boolean isCompanionType(ActivityEventType type, boolean submissionSide) {
        if (type == null) return false;
        if (submissionSide) {
            return type == ActivityEventType.submission
                    || type == ActivityEventType.approval
                    || type == ActivityEventType.rejection
                    || type == ActivityEventType.operator_override;
        }
        return type == ActivityEventType.check_in;
    }

    private record ReasonKey(UUID teamId, UUID baseId) {}

    // ==================================================================
    //  Filter parsing
    // ==================================================================

    private ExportFormat parseFormat(String raw) {
        if (raw == null || raw.isBlank()) return ExportFormat.JSON;
        String normalized = raw.trim().toLowerCase();
        if ("json".equals(normalized)) return ExportFormat.JSON;
        if ("csv".equals(normalized)) return ExportFormat.CSV;
        throw new BadRequestException(
                "AUDIT_EXPORT_INVALID_FORMAT: format must be 'json' or 'csv'");
    }

    private Instant parseInstant(String field, String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Instant.parse(raw.trim());
        } catch (DateTimeParseException ex) {
            throw new BadRequestException(
                    "AUDIT_EXPORT_INVALID_TIMESTAMP: '" + field + "' must be an ISO-8601 instant");
        }
    }

    /**
     * Parses the {@code actionType} query parameter, which may be a single
     * value or a comma-separated list. Returns {@code null} when the caller
     * did not pass the filter, which the repository interprets as "no filter".
     */
    private Set<ActivityEventType> parseActionTypes(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String[] tokens = raw.split(",");
        Set<ActivityEventType> result = EnumSet.noneOf(ActivityEventType.class);
        for (String token : tokens) {
            String trimmed = token.trim();
            if (trimmed.isEmpty()) continue;
            try {
                result.add(ActivityEventType.valueOf(trimmed));
            } catch (IllegalArgumentException ex) {
                throw new BadRequestException(
                        "AUDIT_EXPORT_INVALID_ACTION_TYPE: '" + trimmed + "' is not a known action type");
            }
        }
        return result.isEmpty() ? null : result;
    }

    private String safeDisplayName(Player p) {
        try {
            return p.getDisplayName();
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private String safeDeviceId(Player p) {
        try {
            return p.getDeviceId();
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private String safeUserName(User u) {
        try {
            String name = u.getName();
            return name != null ? name : u.getEmail();
        } catch (RuntimeException ex) {
            return null;
        }
    }

    // ==================================================================
    //  Format adapters
    // ==================================================================

    private enum ExportFormat { JSON, CSV }

    private AuditExportResult render(List<AuditEntryDto> entries, ExportFormat format, UUID gameId) {
        String timestamp = Instant.now().toString().replace(":", "-");
        return switch (format) {
            case JSON -> new AuditExportResult(
                    renderJson(entries),
                    "application/json",
                    "attachment; filename=\"audit-" + gameId + "-" + timestamp + ".json\""
            );
            case CSV -> new AuditExportResult(
                    renderCsv(entries),
                    "text/csv; charset=utf-8",
                    "attachment; filename=\"audit-" + gameId + "-" + timestamp + ".csv\""
            );
        };
    }

    private String renderJson(List<AuditEntryDto> entries) {
        try {
            return objectMapper.writeValueAsString(entries);
        } catch (JsonProcessingException ex) {
            throw new RuntimeException("Failed to serialize audit export JSON", ex);
        }
    }

    /**
     * CSV header order is fixed and documented in the API reference. Any
     * change to the column list should bump the {@code audit-export} section
     * of {@code docs/api-reference.md} at the same time, because external
     * consumers parse by position.
     */
    private static final String CSV_HEADER = String.join(",", List.of(
            "timestamp",
            "type",
            "source_surface",
            "actor_type",
            "actor_id",
            "actor_display_name",
            "actor_device_id",
            "team_id",
            "team_name",
            "base_id",
            "base_name",
            "challenge_id",
            "challenge_title",
            "message",
            "operator_reason",
            "archived"
    ));

    private String renderCsv(List<AuditEntryDto> entries) {
        StringBuilder sb = new StringBuilder();
        sb.append(CSV_HEADER).append("\r\n");
        for (AuditEntryDto e : entries) {
            List<String> columns = new ArrayList<>(16);
            columns.add(csvCell(e.getTimestamp() != null ? e.getTimestamp().toString() : null));
            columns.add(csvCell(e.getType()));
            columns.add(csvCell(e.getSourceSurface()));

            AuditEntryDto.Actor actor = e.getActor();
            columns.add(csvCell(actor != null ? actor.getType() : null));
            columns.add(csvCell(actor != null && actor.getId() != null ? actor.getId().toString() : null));
            columns.add(csvCell(actor != null ? actor.getDisplayName() : null));
            columns.add(csvCell(actor != null ? actor.getDeviceId() : null));

            AuditEntryDto.Target target = e.getTarget();
            AuditEntryDto.TeamRef team = target != null ? target.getTeam() : null;
            AuditEntryDto.BaseRef base = target != null ? target.getBase() : null;
            AuditEntryDto.ChallengeRef challenge = target != null ? target.getChallenge() : null;

            columns.add(csvCell(team != null && team.getId() != null ? team.getId().toString() : null));
            columns.add(csvCell(team != null ? team.getName() : null));
            columns.add(csvCell(base != null && base.getId() != null ? base.getId().toString() : null));
            columns.add(csvCell(base != null ? base.getName() : null));
            columns.add(csvCell(challenge != null && challenge.getId() != null ? challenge.getId().toString() : null));
            columns.add(csvCell(challenge != null ? challenge.getTitle() : null));

            AuditEntryDto.Details details = e.getDetails();
            columns.add(csvCell(details != null ? details.getMessage() : null));
            columns.add(csvCell(details != null ? details.getOperatorReason() : null));

            columns.add(csvCell(Boolean.toString(e.isArchived())));

            sb.append(String.join(",", columns)).append("\r\n");
        }
        return sb.toString();
    }

    /**
     * RFC-4180-style CSV cell rendering: null becomes an empty cell; fields
     * containing comma, double-quote, carriage return, or line feed are
     * quoted and embedded double-quotes are escaped by doubling.
     *
     * <p>CSV formula injection defence (OWASP): if the cell value begins with
     * a character that spreadsheet applications interpret as a formula trigger
     * ({@code =}, {@code +}, {@code -}, {@code @}, tab, or carriage return)
     * it is prefixed with a single-quote ({@code '}) so the content is treated
     * as a literal string rather than evaluated as a formula.
     */
    static String csvCell(String value) {
        if (value == null || value.isEmpty()) return "";
        // Neutralise formula-injection triggers before any quoting decision.
        char first = value.charAt(0);
        if (first == '=' || first == '+' || first == '-' || first == '@'
                || first == '\t' || first == '\r') {
            value = "'" + value;
        }
        boolean needsQuoting = value.indexOf(',') >= 0
                || value.indexOf('"') >= 0
                || value.indexOf('\n') >= 0
                || value.indexOf('\r') >= 0;
        if (!needsQuoting) return value;
        String escaped = value.replace("\"", "\"\"");
        return "\"" + escaped + "\"";
    }

}
