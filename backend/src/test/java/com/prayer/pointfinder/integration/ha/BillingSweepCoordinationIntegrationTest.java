package com.prayer.pointfinder.integration.ha;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.service.SubscriptionLifecycleService;
import com.prayer.pointfinder.service.jobs.BillingSchedulerCoordinationAspect;
import com.prayer.pointfinder.service.jobs.ScheduledJobCoordinator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The billing sweeper's own {@code @Scheduled} method is wrapped by an
 * aspect; its source is untouched. This proves the invocation goes through
 * the lease and is skipped while another instance holds it.
 */
class BillingSweepCoordinationIntegrationTest extends IntegrationTestBase {

    @Autowired private SubscriptionLifecycleService lifecycle;
    @Autowired private ScheduledJobCoordinator coordinator;
    @Autowired private InstanceIdentity self;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void sweepRunsUnderTheLeaseAndIsSkippedWhileAnotherInstanceHoldsIt() {
        String job = BillingSchedulerCoordinationAspect.JOB_NAME;
        jdbc.update("DELETE FROM scheduled_job_leases WHERE job_name = ?", job);

        lifecycle.sweepExpiredTermsAndGracePeriods();
        ScheduledJobCoordinator.LeaseState first = coordinator.state(job).orElseThrow();
        assertEquals(1, first.runCount());
        assertEquals("ok", first.lastOutcome());
        assertEquals(self.id(), first.owner());
        assertNull(first.leasedUntil());

        // Another instance is mid-sweep.
        jdbc.update("UPDATE scheduled_job_leases SET owner_instance = 'other-node', leased_until = now() + interval '10 minutes' WHERE job_name = ?", job);
        lifecycle.sweepExpiredTermsAndGracePeriods();
        ScheduledJobCoordinator.LeaseState held = coordinator.state(job).orElseThrow();
        assertEquals(1, held.runCount(), "skipped: the lease belongs to the other instance");
        assertEquals("other-node", held.owner());

        // Released (or expired): runs again here.
        jdbc.update("UPDATE scheduled_job_leases SET leased_until = NULL WHERE job_name = ?", job);
        lifecycle.sweepExpiredTermsAndGracePeriods();
        assertEquals(2, coordinator.state(job).orElseThrow().runCount());
        assertEquals(self.id(), coordinator.state(job).orElseThrow().owner());
    }
}
