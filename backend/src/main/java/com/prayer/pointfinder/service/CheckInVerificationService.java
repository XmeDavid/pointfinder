package com.prayer.pointfinder.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Single home for every check-in proof rule.
 *
 * <p>The service is deliberately separate from {@code PlayerService}: the
 * rules are the security boundary of the whole game (they are what stops a
 * team collecting bases from the car park), they are shared by the player
 * endpoint and any future intake, and they are the part the phone mirrors in
 * {@code packages/game-core} so the client pre-check and the server verdict
 * agree. Keeping them in one class means the mirror has exactly one source.
 *
 * <p>Spec: docs/specs/2026-09-05-check-in-methods-design.md
 */
@Service
@RequiredArgsConstructor
public class CheckInVerificationService {

    /** Radius clamp, shared with the operator write paths. */
    public static final int MIN_RADIUS_M = 5;
    public static final int MAX_RADIUS_M = 200;

    /** A fix worse than this cannot confirm an automatic arrival. */
    public static final double AUTO_ACCURACY_CAP_M = 50.0;
    /** How much accuracy credit an automatic proof may borrow, at most. */
    public static final double ACCURACY_CREDIT_CAP_M = 30.0;
    /** A claim tolerates a worse fix, because it is gated by the dwell instead. */
    public static final double CLAIM_ACCURACY_CAP_M = 100.0;

    /** Offline queues replay late; clock skew runs slightly fast. */
    public static final Duration STALE_PAST = Duration.ofHours(24);
    public static final Duration STALE_FUTURE = Duration.ofMinutes(10);

    public static final int DWELL_MIN_FIXES = 4;
    public static final long DWELL_MIN_SPAN_MS = 60_000L;
    public static final long DWELL_MAX_GAP_TO_MAIN_MS = 120_000L;

    public static final double EARTH_RADIUS_M = 6_371_000.0;

    private final PlayerRepository playerRepository;
    private final PlayerLocationRepository playerLocationRepository;
    private final ObjectMapper objectMapper;

    /**
     * Everything the caller needs to write the check-in row. Returned instead
     * of mutating a passed-in entity so the verification step stays free of
     * persistence concerns and is trivial to unit-test.
     *
     * @param teammatesInRing  teammates inside the wider ring at claim time;
     *                         null unless the verification is CLAIMED
     * @param teammatesTotal   players on the team at claim time; null unless CLAIMED
     */
    public record VerifiedProof(
            CheckInMethod method,
            CheckInVerification verification,
            Double proofLat,
            Double proofLng,
            Double proofAccuracyM,
            Double proofDistanceM,
            Instant proofCapturedAt,
            String teamPositionsSnapshotJson,
            Instant checkedInAt,
            Integer teammatesInRing,
            Integer teammatesTotal
    ) {}

    /**
     * Verifies the submitted proof against the base's configured method.
     * Called after the live-game, team and base guards, after the dedup, and
     * after the base-order rule — so a team blocked by the route never learns
     * whether its proof would have been good.
     */
    public VerifiedProof verify(Base base, Team team, CheckInRequest request, Instant now) {
        CheckInMethod baseMethod = base.getCheckInMethod() != null
                ? base.getCheckInMethod() : CheckInMethod.NFC;
        boolean legacyBody = request == null || request.getMethod() == null;
        String proofType = resolveProofType(request);

        if (legacyBody) {
            // The legacy body carries no method discriminator, so we can only
            // honour it where it has always meant the same thing.
            if (baseMethod != CheckInMethod.NFC) {
                throw methodMismatch(baseMethod);
            }
        } else if (!proofType.equals(expectedProofType(baseMethod))) {
            throw methodMismatch(baseMethod);
        }

        return switch (baseMethod) {
            case NFC, QR -> verifyToken(base, baseMethod, request, legacyBody, now);
            case LOCATION -> Boolean.TRUE.equals(request.getClaimed())
                    ? verifyClaim(base, team, request, now)
                    : verifyAuto(base, request, now);
        };
    }

    // ── Dispatch helpers ─────────────────────────────────────────────────

    private String resolveProofType(CheckInRequest request) {
        if (request == null) {
            throw new BadRequestException("A check-in proof is required", ErrorCode.NFC_TOKEN_REQUIRED);
        }
        String method = request.getMethod();
        if (method == null) {
            if (request.getNfcToken() == null || request.getNfcToken().isBlank()) {
                throw new BadRequestException("NFC token is required for check-in",
                        ErrorCode.NFC_TOKEN_REQUIRED);
            }
            return "nfc";
        }
        String normalized = method.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "nfc", "qr", "geo" -> normalized;
            default -> throw new BadRequestException("Unknown check-in method: " + method,
                    ErrorCode.CHECK_IN_METHOD_MISMATCH);
        };
    }

    private String expectedProofType(CheckInMethod method) {
        return switch (method) {
            case NFC -> "nfc";
            case QR -> "qr";
            case LOCATION -> "geo";
        };
    }

    private BadRequestException methodMismatch(CheckInMethod baseMethod) {
        return new BadRequestException(
                "This base is checked in by " + baseMethod.name().toLowerCase(Locale.ROOT),
                ErrorCode.CHECK_IN_METHOD_MISMATCH);
    }

    // ── Token proofs ─────────────────────────────────────────────────────

    private VerifiedProof verifyToken(Base base, CheckInMethod method, CheckInRequest request,
                                      boolean legacyBody, Instant now) {
        String submitted = legacyBody ? request.getNfcToken() : request.getToken();
        if (submitted == null || submitted.isBlank()) {
            throw new BadRequestException("A check-in token is required", ErrorCode.NFC_TOKEN_REQUIRED);
        }
        String expected = base.getNfcToken() != null ? base.getNfcToken() : "";
        // Constant-time compare: the token is short and guessable-by-timing is
        // a real attack when the reward is a base you never walked to.
        if (!MessageDigest.isEqual(submitted.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8))) {
            throw new BadRequestException("Invalid check-in token", ErrorCode.CHECK_IN_TOKEN_INVALID);
        }
        return new VerifiedProof(method, CheckInVerification.VERIFIED,
                null, null, null, null, null, null, now, null, null);
    }

    // ── Automatic geo proof ──────────────────────────────────────────────

    private VerifiedProof verifyAuto(Base base, CheckInRequest request, Instant now) {
        double accuracy = requireAccuracy(request.getAccuracy(), AUTO_ACCURACY_CAP_M);
        Instant capturedAt = requireFreshFix(request.getCapturedAt(), now);
        double lat = requireCoordinate(request.getLat(), 90.0);
        double lng = requireCoordinate(request.getLng(), 180.0);

        int radiusM = clampRadiusM(base.resolvedCheckInRadiusM());
        double distanceM = haversineMeters(lat, lng, base.getLat(), base.getLng());
        // A phone that says "±25 m" is honestly uncertain, so we widen the ring
        // by its own stated uncertainty — but only up to 30 m, otherwise a
        // deliberately degraded fix would unlock a base from streets away.
        double allowedM = radiusM + Math.min(accuracy, ACCURACY_CREDIT_CAP_M);

        if (distanceM > allowedM) {
            throw new BadRequestException("You are too far from this base",
                    ErrorCode.CHECK_IN_OUT_OF_RANGE,
                    Map.of("distanceM", metres(distanceM), "allowedM", metres(allowedM)));
        }

        // checked_in_at is the capture time, not receipt time: a proof queued
        // offline and synced an hour later still records when the team arrived.
        return new VerifiedProof(CheckInMethod.LOCATION, CheckInVerification.VERIFIED,
                lat, lng, accuracy, distanceM, capturedAt, null, capturedAt, null, null);
    }

    // ── Claimed geo proof ────────────────────────────────────────────────

    private VerifiedProof verifyClaim(Base base, Team team, CheckInRequest request, Instant now) {
        double accuracy = requireAccuracy(request.getAccuracy(), CLAIM_ACCURACY_CAP_M);
        Instant capturedAt = requireFreshFix(request.getCapturedAt(), now);
        double lat = requireCoordinate(request.getLat(), 90.0);
        double lng = requireCoordinate(request.getLng(), 180.0);

        int radiusM = clampRadiusM(base.resolvedCheckInRadiusM());
        double ringM = wideRingM(radiusM);
        double distanceM = haversineMeters(lat, lng, base.getLat(), base.getLng());
        if (distanceM > ringM) {
            throw claimNotDwelled("outside_ring");
        }

        List<CheckInRequest.FixDto> dwell = request.getDwell();
        if (dwell == null || dwell.size() < DWELL_MIN_FIXES) {
            throw claimNotDwelled("too_few_fixes");
        }

        Instant firstAt = null;
        Instant lastAt = null;
        for (CheckInRequest.FixDto sample : dwell) {
            if (sample == null || sample.getCapturedAt() == null) {
                throw claimNotDwelled("buffer_stale");
            }
            Double sampleAccuracy = sample.getAccuracy();
            if (sampleAccuracy == null || !Double.isFinite(sampleAccuracy)
                    || sampleAccuracy < 0 || sampleAccuracy > CLAIM_ACCURACY_CAP_M) {
                throw claimNotDwelled("fix_too_coarse");
            }
            if (sample.getLat() == null || sample.getLng() == null
                    || !Double.isFinite(sample.getLat()) || !Double.isFinite(sample.getLng())) {
                throw claimNotDwelled("outside_ring");
            }
            if (haversineMeters(sample.getLat(), sample.getLng(), base.getLat(), base.getLng()) > ringM) {
                throw claimNotDwelled("outside_ring");
            }
            if (firstAt == null || sample.getCapturedAt().isBefore(firstAt)) {
                firstAt = sample.getCapturedAt();
            }
            if (lastAt == null || sample.getCapturedAt().isAfter(lastAt)) {
                lastAt = sample.getCapturedAt();
            }
        }

        // A full minute inside the ring is what separates "I walked here and
        // the GPS is bad" from "I tapped the button while driving past".
        if (Duration.between(firstAt, lastAt).toMillis() < DWELL_MIN_SPAN_MS) {
            throw claimNotDwelled("span_too_short");
        }
        if (Math.abs(Duration.between(lastAt, capturedAt).toMillis()) > DWELL_MAX_GAP_TO_MAIN_MS) {
            throw claimNotDwelled("buffer_stale");
        }

        TeamSnapshot snapshot = snapshotTeammates(base, team, ringM, now);

        // checked_in_at is receipt time for a claim: nothing here proves the
        // team was at the base at capture time, so we record when they said so.
        return new VerifiedProof(CheckInMethod.LOCATION, CheckInVerification.CLAIMED,
                lat, lng, accuracy, distanceM, capturedAt, snapshot.json(), now,
                snapshot.inRing(), snapshot.total());
    }

    private BadRequestException claimNotDwelled(String reason) {
        return new BadRequestException("Stay near the base a little longer before claiming",
                ErrorCode.CHECK_IN_CLAIM_NOT_DWELLED, Map.of("reason", reason));
    }

    private record TeamSnapshot(String json, int inRing, int total) {}

    /**
     * Records where every teammate's phone last was, relative to this base.
     * This is the evidence behind a claim: one player claiming while the rest
     * of the team is two kilometres away looks very different from a whole
     * team standing in the same clearing under heavy canopy.
     */
    private TeamSnapshot snapshotTeammates(Base base, Team team, double ringM, Instant now) {
        List<Player> players = team != null && team.getId() != null
                ? playerRepository.findByTeamId(team.getId())
                : List.of();
        List<Map<String, Object>> entries = new ArrayList<>(players.size());
        int inRing = 0;

        for (Player player : players) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("playerId", player.getId() != null ? player.getId().toString() : null);
            entry.put("displayName", player.getDisplayName());

            PlayerLocation location = player.getId() != null
                    ? playerLocationRepository.findById(player.getId()).orElse(null)
                    : null;
            if (location == null || location.getLat() == null || location.getLng() == null) {
                entry.put("lat", null);
                entry.put("lng", null);
                entry.put("accuracyM", null);
                entry.put("ageSeconds", null);
                entry.put("distanceM", null);
            } else {
                double distanceM = haversineMeters(location.getLat(), location.getLng(),
                        base.getLat(), base.getLng());
                Instant at = location.getCapturedAt() != null
                        ? location.getCapturedAt() : location.getUpdatedAt();
                entry.put("lat", location.getLat());
                entry.put("lng", location.getLng());
                entry.put("accuracyM", location.getAccuracyM());
                entry.put("ageSeconds", at != null
                        ? Math.max(0L, Duration.between(at, now).getSeconds()) : null);
                entry.put("distanceM", Math.round(distanceM * 10.0) / 10.0);
                if (distanceM <= ringM) {
                    inRing++;
                }
            }
            entries.add(entry);
        }

        return new TeamSnapshot(writeJson(entries), inRing, players.size());
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            // The snapshot is built entirely from primitives we control, so a
            // failure here is a programming error, not a runtime condition.
            throw new IllegalStateException("Failed to serialize team position snapshot", ex);
        }
    }

    // ── Shared fix validation ────────────────────────────────────────────

    private double requireAccuracy(Double accuracy, double capM) {
        if (accuracy == null || !Double.isFinite(accuracy) || accuracy < 0 || accuracy > capM) {
            throw new BadRequestException("The GPS fix is not accurate enough to confirm this base",
                    ErrorCode.CHECK_IN_FIX_TOO_COARSE);
        }
        return accuracy;
    }

    private Instant requireFreshFix(Instant capturedAt, Instant now) {
        if (capturedAt == null
                || capturedAt.isBefore(now.minus(STALE_PAST))
                || capturedAt.isAfter(now.plus(STALE_FUTURE))) {
            throw new BadRequestException("This location fix is out of date",
                    ErrorCode.CHECK_IN_FIX_STALE);
        }
        return capturedAt;
    }

    /**
     * A missing or non-finite coordinate is reported as a coarse fix rather
     * than as its own code: from the player's side it is the same situation —
     * the phone did not produce a usable position.
     */
    private double requireCoordinate(Double value, double absoluteMax) {
        if (value == null || !Double.isFinite(value) || Math.abs(value) > absoluteMax) {
            throw new BadRequestException("The GPS fix is not usable",
                    ErrorCode.CHECK_IN_FIX_TOO_COARSE);
        }
        return value;
    }

    /** Error detail values are strings; metres are rounded so copy reads well. */
    private static String metres(double value) {
        return Long.toString(Math.round(value));
    }

    // ── Geometry ─────────────────────────────────────────────────────────

    /** Great-circle distance in metres. Mirrored in {@code packages/game-core}. */
    public static double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** The wider ring a claim must sit inside: {@code max(3 * radius, 50)}. */
    public static double wideRingM(int radiusM) {
        return Math.max(3.0 * radiusM, 50.0);
    }

    /** Clamps an operator-supplied radius into the supported 5..200 m band. */
    public static int clampRadiusM(int radiusM) {
        return Math.max(MIN_RADIUS_M, Math.min(MAX_RADIUS_M, radiusM));
    }
}
