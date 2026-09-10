package com.prayer.pointfinder.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for running more than one active backend instance.
 *
 * <p>Every knob here has a single-instance-safe default so the same image can
 * run as one replica today and as two replicas after the rollout gates in
 * {@code docs/ha-application-readiness.md} pass. Nothing under {@code app.ha}
 * references billing configuration.
 */
@Data
@ConfigurationProperties(prefix = "app.ha")
public class HaProperties {

    private Outbox outbox = new Outbox();
    private Presence presence = new Presence();
    private RateLimit rateLimit = new RateLimit();
    private Jobs jobs = new Jobs();

    @Data
    public static class Outbox {
        /** Write realtime events to the durable outbox and consume other instances' rows. */
        private boolean enabled = true;
        /** Open a dedicated LISTEN connection so cross-instance delivery does not wait for the poll interval. */
        private boolean listenEnabled = true;
        /** Fallback poll period; the durable delivery path even when LISTEN is unavailable. */
        private long pollIntervalMs = 1000;
        /** Rows per poll. A full page keeps the cursor on the last row read. */
        private int batchSize = 500;
        /**
         * How long a consumer keeps retrying a failing row before dead-lettering
         * it; also bounds how far a restarted consumer replays.
         */
        private int retentionMinutes = 10;
        /**
         * Extra time rows stay in the table after retention so a consumer that
         * is late can still dead-letter a failing row before cleanup deletes it.
         */
        private int cleanupGraceMinutes = 10;

        public java.time.Instant deadLetterEdge(java.time.Instant now) {
            return now.minus(java.time.Duration.ofMinutes(retentionMinutes));
        }

        public java.time.Instant cleanupEdge(java.time.Instant now) {
            return now.minus(java.time.Duration.ofMinutes((long) retentionMinutes + cleanupGraceMinutes));
        }
        /** Cursor rows of instances not seen for this long are deleted. */
        private int cursorRetentionHours = 24;
    }

    @Data
    public static class Presence {
        /** {@code db} shares presence across instances; {@code memory} keeps the pre-HA per-process behaviour. */
        private String store = "db";
        /** How often each instance refreshes {@code last_seen_at} for its own sessions. */
        private long heartbeatIntervalMs = 15000;
        /** A session not refreshed within this window is treated as gone (its instance crashed). */
        private long ttlSeconds = 45;
    }

    @Data
    public static class RateLimit {
        /** {@code db} shares login/join/broadcast counters across instances; {@code memory} keeps them per process. */
        private String store = "db";
        /** Buckets untouched for this long are deleted by the cleanup job. */
        private int retentionHours = 24;
    }

    @Data
    public static class Jobs {
        /** Coordinate scheduled jobs through database leases. {@code false} restores per-process scheduling. */
        private boolean coordinated = true;
        /** Default lease length for a claimed job when the job does not specify one. */
        private long defaultLeaseSeconds = 120;
    }
}
