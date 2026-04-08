package com.prayer.pointfinder.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Dashboard view of a game's realtime health (P0 Track 2 Slice 5).
 *
 * <p>Numbers are sampled on read from
 * {@link com.prayer.pointfinder.service.RealtimeMetricsService}. Active
 * sessions are instantaneous; the {@code …LastHour} fields are rolling
 * one-hour totals. Cumulative counters still live on Micrometer's
 * {@code /actuator/metrics/realtime.*} surface for long-range dashboards.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RealtimeStatsResponse {

    /** Web-admin STOMP sessions subscribed to this game right now. */
    private int stompActiveSessions;

    /** Mobile (iOS + Android) native websocket sessions for this game right now. */
    private int mobileActiveSessions;

    /** Sum of {@link #stompActiveSessions} and {@link #mobileActiveSessions}. */
    private int totalActiveSessions;

    private long stompConnectsLastHour;
    private long mobileConnectsLastHour;
    private long stompDisconnectsLastHour;
    private long mobileDisconnectsLastHour;

    /**
     * Heuristic reconnect total across both hubs for the last hour. A
     * connect from the same client identifier arriving within 30 s of a
     * prior disconnect is counted as a reconnect. See
     * {@code RealtimeMetricsService} for the full definition and
     * limitations.
     */
    private long estimatedReconnectsLastHour;

    /** Server wall clock at which this snapshot was produced. */
    private Instant lastUpdated;
}
