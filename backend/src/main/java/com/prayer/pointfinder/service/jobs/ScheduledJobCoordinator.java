package com.prayer.pointfinder.service.jobs;

import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.ha.InstanceIdentity;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Runs a named job on at most one instance at a time using a lease row in
 * {@code scheduled_job_leases}.
 *
 * <p>Claim, release and failure bookkeeping each run in their own
 * {@code REQUIRES_NEW} transaction so the lease outcome is visible to the
 * other instance regardless of what the job does. The job body runs inside a
 * transaction opened here that holds a transaction-scoped advisory lock on
 * the job name; {@code @Transactional} job methods join it.
 *
 * <p>Semantics:
 * <ul>
 *   <li>Claim succeeds only when the row is absent, released, or its lease has
 *       expired. Two instances ticking together therefore run the job once.</li>
 *   <li>A normal completion releases the lease immediately so the next tick
 *       on either instance can run again.</li>
 *   <li>A thrown exception also releases the lease and records the error, so
 *       a failing job is retried on the next tick rather than after the lease.</li>
 *   <li>A crash between claim and release leaves the lease to expire; the
 *       job is then claimable again. If the previous run is in fact still
 *       executing (a stall, not a crash), the new claimant cannot take the
 *       advisory lock and skips, so two runs never execute at once. Job
 *       bodies are idempotent on top of that.</li>
 * </ul>
 */
@Slf4j
@Component
public class ScheduledJobCoordinator {

    /** Namespace for the advisory lock so it cannot collide with other advisory keys in the schema. */
    public static final int ADVISORY_NAMESPACE = 7001;

    private final JdbcTemplate jdbc;
    private final PlatformTransactionManager transactionManager;
    private final TransactionTemplate requiresNew;
    private final InstanceIdentity instance;
    private final HaProperties haProperties;
    private final MeterRegistry meterRegistry;

    public ScheduledJobCoordinator(JdbcTemplate jdbc,
                                   PlatformTransactionManager transactionManager,
                                   InstanceIdentity instance,
                                   HaProperties haProperties,
                                   MeterRegistry meterRegistry) {
        this.jdbc = jdbc;
        this.transactionManager = transactionManager;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.instance = instance;
        this.haProperties = haProperties;
        this.meterRegistry = meterRegistry;
    }

    public enum Outcome { RAN, SKIPPED, FAILED }

    /** Thrown inside the job transaction when another instance is actively running the job. */
    private static final class ActiveElsewhere extends RuntimeException {
        ActiveElsewhere() {
            super("job active on another instance", null, false, false);
        }
    }

    /** Runs {@code body} under the default lease length. */
    public Outcome run(String jobName, Runnable body) {
        return run(jobName, Duration.ofSeconds(haProperties.getJobs().getDefaultLeaseSeconds()), body);
    }

    /**
     * Claims {@code jobName} for {@code lease} and, if the claim succeeded,
     * runs {@code body} inside one database transaction that holds a
     * transaction-scoped advisory lock for the job. The lease decides which
     * instance <em>starts</em>; the advisory lock guarantees that at most one
     * instance is <em>executing</em> at any moment, even after the lease
     * expired under a slow run: a second claimant finds the lock taken and
     * skips. Job bodies annotated {@code @Transactional} join this
     * transaction, so their database work is covered by the lock end to end.
     * The transaction times out at the lease length, so a stuck job is rolled
     * back and retried rather than holding the lock forever.
     *
     * <p>Exceptions from {@code body} roll the job back, are logged and
     * recorded on the lease row, and are swallowed so one failing job cannot
     * stop the scheduler thread.
     */
    public Outcome run(String jobName, Duration lease, Runnable body) {
        if (!haProperties.getJobs().isCoordinated()) {
            return runUncoordinated(jobName, body);
        }
        Instant now = Instant.now();
        if (!tryClaim(jobName, now, lease)) {
            log.debug("[JOBS] skip job={} (leased elsewhere)", jobName);
            meterRegistry.counter("jobs.runs", "job", jobName, "outcome", "skipped").increment();
            return Outcome.SKIPPED;
        }
        TransactionTemplate jobTransaction = new TransactionTemplate(transactionManager);
        jobTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        jobTransaction.setTimeout((int) Math.max(1, lease.getSeconds()));
        try {
            jobTransaction.executeWithoutResult(status -> {
                Boolean locked = jdbc.queryForObject(
                        "SELECT pg_try_advisory_xact_lock(?, hashtext(?))", Boolean.class, ADVISORY_NAMESPACE, jobName);
                if (!Boolean.TRUE.equals(locked)) {
                    throw new ActiveElsewhere();
                }
                body.run();
            });
            release(jobName, "ok", null);
            meterRegistry.counter("jobs.runs", "job", jobName, "outcome", "ok").increment();
            return Outcome.RAN;
        } catch (ActiveElsewhere active) {
            log.warn("[JOBS] skip job={}: lease expired but the previous run is still executing elsewhere", jobName);
            release(jobName, "skipped_active", null);
            meterRegistry.counter("jobs.runs", "job", jobName, "outcome", "skipped_active").increment();
            return Outcome.SKIPPED;
        } catch (RuntimeException ex) {
            log.error("[JOBS] job={} failed: {}", jobName, ex.getMessage(), ex);
            release(jobName, "error", truncate(ex.toString()));
            meterRegistry.counter("jobs.runs", "job", jobName, "outcome", "error").increment();
            return Outcome.FAILED;
        }
    }

    private Outcome runUncoordinated(String jobName, Runnable body) {
        try {
            body.run();
            return Outcome.RAN;
        } catch (RuntimeException ex) {
            log.error("[JOBS] job={} failed (uncoordinated): {}", jobName, ex.getMessage(), ex);
            return Outcome.FAILED;
        }
    }

    /**
     * Atomic claim. The {@code WHERE} on the conflict branch is what makes two
     * concurrent claims resolve to exactly one winner: the loser's UPDATE
     * matches no row and RETURNING yields nothing.
     */
    public boolean tryClaim(String jobName, Instant now, Duration lease) {
        Timestamp nowTs = Timestamp.from(now);
        Timestamp until = Timestamp.from(now.plus(lease));
        Boolean claimed = requiresNew.execute(status -> {
            List<String> rows = jdbc.query("""
                    INSERT INTO scheduled_job_leases
                        (job_name, owner_instance, leased_until, last_started_at, run_count, updated_at)
                    VALUES (?, ?, ?, ?, 1, ?)
                    ON CONFLICT (job_name) DO UPDATE SET
                        owner_instance  = EXCLUDED.owner_instance,
                        leased_until    = EXCLUDED.leased_until,
                        last_started_at = EXCLUDED.last_started_at,
                        run_count       = scheduled_job_leases.run_count + 1,
                        updated_at      = EXCLUDED.updated_at
                    WHERE scheduled_job_leases.leased_until IS NULL
                       OR scheduled_job_leases.leased_until < EXCLUDED.last_started_at
                    RETURNING job_name
                    """,
                    (rs, i) -> rs.getString(1),
                    jobName, instance.id(), until, nowTs, nowTs);
            return !rows.isEmpty();
        });
        return Boolean.TRUE.equals(claimed);
    }

    /**
     * Releases the lease and reports an overrun when the job outlived it. An
     * overrun means another instance may have started the same job before
     * this one finished; job bodies are idempotent for that case, but the
     * metric and log make it visible so the lease length can be corrected.
     */
    void release(String jobName, String outcome, String error) {
        try {
            requiresNew.executeWithoutResult(status -> {
                Instant now = Instant.now();
                List<Timestamp> previous = jdbc.query("""
                        SELECT leased_until FROM scheduled_job_leases
                         WHERE job_name = ? AND owner_instance = ? FOR UPDATE
                        """, (rs, i) -> rs.getTimestamp(1), jobName, instance.id());
                if (previous.isEmpty()) {
                    // Lease expired and was claimed by someone else: nothing to release.
                    log.warn("[JOBS] job={} finished after its lease was taken over; not releasing", jobName);
                    meterRegistry.counter("jobs.lease_overrun", "job", jobName).increment();
                    return;
                }
                Timestamp leasedUntil = previous.get(0);
                if (leasedUntil != null && leasedUntil.toInstant().isBefore(now)) {
                    log.warn("[JOBS] job={} overran its lease by {} ms", jobName,
                            now.toEpochMilli() - leasedUntil.toInstant().toEpochMilli());
                    meterRegistry.counter("jobs.lease_overrun", "job", jobName).increment();
                }
                jdbc.update("""
                        UPDATE scheduled_job_leases
                           SET leased_until = NULL,
                               last_completed_at = ?,
                               last_outcome = ?,
                               last_error = ?,
                               updated_at = ?
                         WHERE job_name = ? AND owner_instance = ?
                        """,
                        Timestamp.from(now), outcome, error, Timestamp.from(now),
                        jobName, instance.id());
            });
        } catch (RuntimeException ex) {
            // The lease will expire on its own; log so an operator sees why
            // this job may be late once.
            log.warn("[JOBS] could not release lease for job={}: {}", jobName, ex.getMessage());
        }
    }

    /** Diagnostic read used by tests and the readiness doc. */
    public Optional<LeaseState> state(String jobName) {
        List<LeaseState> rows = jdbc.query("""
                SELECT owner_instance, leased_until, last_outcome, run_count, last_error
                  FROM scheduled_job_leases WHERE job_name = ?
                """,
                (rs, i) -> new LeaseState(
                        rs.getString(1),
                        rs.getTimestamp(2) == null ? null : rs.getTimestamp(2).toInstant(),
                        rs.getString(3),
                        rs.getLong(4),
                        rs.getString(5)),
                jobName);
        return rows.stream().findFirst();
    }

    public record LeaseState(String owner, Instant leasedUntil, String lastOutcome, long runCount, String lastError) {}

    private static String truncate(String s) {
        return s != null && s.length() > 2000 ? s.substring(0, 2000) : s;
    }
}
