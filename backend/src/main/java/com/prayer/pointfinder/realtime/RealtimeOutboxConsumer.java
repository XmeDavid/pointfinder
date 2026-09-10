package com.prayer.pointfinder.realtime;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.ha.InstanceIdentity;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Delivers outbox rows to this instance's sockets. With the outbox enabled
 * this is the only delivery path on every instance, the producing one
 * included, so all sockets observe the same committed order and a crash
 * between commit and dispatch loses nothing.
 *
 * <p><strong>Cursor.</strong> The cursor is an inserting-transaction id,
 * not a row id. Row ids come from a sequence at insert time, so a slow
 * transaction can commit a <em>lower</em> id after a faster one committed a
 * higher id; a "max id seen" cursor would skip it. Instead each poll takes
 * {@code pg_current_snapshot()}: every transaction below its {@code xmin} has
 * finished, so rows with {@code tx_id < xmin} are complete and the cursor may
 * move to {@code xmin}. Rows between {@code xmin} and {@code xmax} that are
 * already visible are delivered right away and remembered in
 * {@link #delivered} until they fall out of the cleanup window, so they are
 * not delivered twice.
 *
 * <p><strong>Order.</strong> Within a poll, visible rows are delivered in
 * id order, not transaction-id order. A row is inserted after its
 * transaction bumped the game's {@code state_version} under that game's row
 * lock, so for one game a higher id is a higher version; transaction ids
 * are assigned at transaction start and would reverse two concurrent bumps.
 *
 * <p><strong>Failures.</strong> A row is marked delivered only after the
 * dispatch returned. If dispatch throws, the cursor is held at or below
 * that row's transaction and every following poll retries it. A row still
 * undelivered when it reaches the end of the retention window is copied to
 * {@code realtime_outbox_dead_letters} with its error, counted, and only
 * then released so the stream continues. Nothing is dropped silently.
 *
 * <p><strong>Restart.</strong> The cursor is persisted after every poll that
 * moved it. On start the consumer resumes from the persisted value (bounded
 * by retention; older rows are gone) so events committed while this
 * instance was down still reach clients that reconnect to it. Rows delivered
 * ahead of the persisted cursor before a restart are delivered again; every
 * envelope carries {@code stateVersion}, which clients already treat as the
 * signal to refresh, so duplicates are safe.
 *
 * <p>Single-threaded by contract: {@link #poll()} runs on the consumer loop
 * only; tests call it directly.
 */
@Slf4j
public class RealtimeOutboxConsumer {

    private final RealtimeOutboxRepository repository;
    private final RealtimeDispatcher dispatcher;
    private final ObjectMapper objectMapper;
    private final InstanceIdentity instance;
    private final HaProperties.Outbox config;
    private final MeterRegistry meterRegistry;

    /** Lowest transaction id that may still yield undelivered rows. */
    private long cursor = -1;
    private long persistedCursor = -1;
    /** Row id to created-at of rows already delivered (or dead-lettered). */
    private final Map<Long, Instant> delivered = new HashMap<>();
    /** Row id to failed dispatch attempts, for rows not yet delivered. */
    private final Map<Long, Integer> attempts = new HashMap<>();
    private final Map<Long, String> lastErrors = new HashMap<>();
    private final AtomicLong deliveredTotal = new AtomicLong();
    private Instant lastLagWarning = Instant.EPOCH;

    public RealtimeOutboxConsumer(RealtimeOutboxRepository repository,
                                  RealtimeDispatcher dispatcher,
                                  ObjectMapper objectMapper,
                                  InstanceIdentity instance,
                                  HaProperties.Outbox config,
                                  MeterRegistry meterRegistry) {
        this.repository = repository;
        this.dispatcher = dispatcher;
        this.objectMapper = objectMapper;
        this.instance = instance;
        this.config = config;
        this.meterRegistry = meterRegistry;
    }

    /** Resumes from the persisted cursor or, absent one, from the current snapshot. */
    public synchronized void start() {
        RealtimeOutboxRepository.Snapshot snapshot = repository.snapshot();
        cursor = repository.loadCursor(instance.id()).orElse(snapshot.xmin());
        // Persist the starting point right away: an instance that crashes
        // before its first poll moved the cursor must still resume from here,
        // not from wherever the snapshot is when it comes back.
        try {
            repository.saveCursor(instance.id(), cursor);
            persistedCursor = cursor;
        } catch (RuntimeException ex) {
            persistedCursor = -1;
            log.warn("[OUTBOX] could not persist starting cursor {}: {}", cursor, ex.getMessage());
        }
        delivered.clear();
        attempts.clear();
        lastErrors.clear();
        log.info("[OUTBOX] consumer {} starting at tx cursor {} (snapshot xmin={}, xmax={})",
                instance.id(), cursor, snapshot.xmin(), snapshot.xmax());
    }

    /** One poll: deliver every newly visible row; returns how many dispatches succeeded. */
    public synchronized int poll() {
        if (cursor < 0) {
            start();
        }
        RealtimeOutboxRepository.Snapshot snapshot = repository.snapshot();
        long upper = snapshot.xmax();
        long afterId = Long.MIN_VALUE;
        long heldTx = Long.MAX_VALUE;
        int dispatched = 0;
        Instant now = Instant.now();
        Instant retentionEdge = config.deadLetterEdge(now);
        while (true) {
            List<RealtimeOutboxRepository.Row> rows = repository.fetch(cursor, upper, afterId, config.getBatchSize());
            for (RealtimeOutboxRepository.Row row : rows) {
                afterId = row.id();
                if (delivered.containsKey(row.id())) {
                    continue;
                }
                String error = dispatchRow(row);
                if (error == null) {
                    delivered.put(row.id(), row.createdAt());
                    attempts.remove(row.id());
                    lastErrors.remove(row.id());
                    dispatched++;
                    continue;
                }
                int n = attempts.merge(row.id(), 1, Integer::sum);
                lastErrors.put(row.id(), error);
                if (row.createdAt().isBefore(retentionEdge)) {
                    deadLetter(row, n, error);
                    delivered.put(row.id(), row.createdAt());
                    attempts.remove(row.id());
                    lastErrors.remove(row.id());
                } else {
                    heldTx = Math.min(heldTx, row.txId());
                }
            }
            if (rows.size() < config.getBatchSize()) {
                break;
            }
        }
        advanceCursor(Math.min(snapshot.xmin(), heldTx), now, config.cleanupEdge(now));
        if (dispatched > 0) {
            deliveredTotal.addAndGet(dispatched);
            meterRegistry.counter("realtime.outbox.delivered").increment(dispatched);
        }
        return dispatched;
    }

    private void deadLetter(RealtimeOutboxRepository.Row row, int attempts, String error) {
        try {
            repository.insertDeadLetter(instance.id(), row, attempts, error);
            log.error("[OUTBOX] dead-lettered row {} ({}) after {} failed attempts: {}", row.id(), row.type(), attempts, error);
            meterRegistry.counter("realtime.outbox.dead_lettered").increment();
        } catch (RuntimeException ex) {
            // Cannot even record the failure: keep holding the row so the next
            // poll tries both the dispatch and the dead-letter again.
            log.error("[OUTBOX] could not dead-letter row {}: {}", row.id(), ex.getMessage());
            throw ex;
        }
    }

    private void advanceCursor(long candidate, Instant now, Instant cleanupEdge) {
        if (candidate > cursor) {
            cursor = candidate;
        }
        // Rows older than the cleanup edge are deleted by the cleanup job and
        // can never be fetched again: forget them so memory stays bounded by
        // that window even if a stuck transaction holds xmin back.
        delivered.entrySet().removeIf(e -> e.getValue().isBefore(cleanupEdge));
        if (!delivered.isEmpty() && now.isAfter(lastLagWarning.plusSeconds(60))) {
            Instant oldest = delivered.values().stream().min(Instant::compareTo).orElse(now);
            if (Duration.between(oldest, now).toMinutes() >= 2) {
                lastLagWarning = now;
                log.warn("[OUTBOX] snapshot xmin lagging: {} delivered rows still ahead of cursor (oldest {})",
                        delivered.size(), oldest);
            }
        }
        if (cursor != persistedCursor) {
            try {
                repository.saveCursor(instance.id(), cursor);
                persistedCursor = cursor;
            } catch (RuntimeException ex) {
                log.warn("[OUTBOX] could not persist cursor {}: {}", cursor, ex.getMessage());
            }
        }
    }

    /** Returns {@code null} on success, otherwise the failure description. */
    private String dispatchRow(RealtimeOutboxRepository.Row row) {
        try {
            Map<String, Object> envelope = objectMapper.readValue(row.payloadJson(), new TypeReference<Map<String, Object>>() {});
            RealtimeEvent event = new RealtimeEvent(
                    RealtimeEvent.Audience.valueOf(row.audience()),
                    row.gameId(),
                    row.teamId(),
                    row.type(),
                    envelope);
            dispatcher.dispatch(event);
            return null;
        } catch (Exception ex) {
            log.warn("[OUTBOX] failed to dispatch row {} ({}): {}", row.id(), row.type(), ex.toString());
            meterRegistry.counter("realtime.outbox.dispatch_failures").increment();
            return ex.toString();
        }
    }

    /** Current cursor (transaction id); for tests and diagnostics. */
    public synchronized long cursor() {
        return cursor;
    }

    public long deliveredTotal() {
        return deliveredTotal.get();
    }

    /** Rows currently held back by a failed dispatch. */
    public synchronized int pendingRetries() {
        return attempts.size();
    }

    /** For tests: forget everything and resume from the persisted cursor as a restarted process would. */
    public synchronized void restart() {
        cursor = -1;
        persistedCursor = -1;
        start();
    }
}
