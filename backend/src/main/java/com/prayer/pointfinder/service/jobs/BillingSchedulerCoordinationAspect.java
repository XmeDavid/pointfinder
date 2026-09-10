package com.prayer.pointfinder.service.jobs;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Routes the billing sweeper's hourly {@code @Scheduled} invocation through
 * {@link ScheduledJobCoordinator} without modifying
 * {@code SubscriptionLifecycleService}.
 *
 * <p>The advice wraps the proxy method the scheduler calls, so with two
 * instances only the lease holder runs the sweep. It sits at highest
 * precedence so the lease claim happens outside the sweep's own
 * {@code @Transactional} boundary; the transaction advisor still applies to
 * the proceeding call. Direct programmatic calls to the method (none exist
 * today) would also go through the coordinator, which is the intended
 * semantics for a sweep.
 *
 * <p>Billing logic is untouched: the sweep's body and repositories are as
 * shipped. If the lease is held elsewhere the invocation is skipped and the
 * next hourly tick on either instance runs it.
 */
@Slf4j
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class BillingSchedulerCoordinationAspect {

    public static final String JOB_NAME = "billing.subscriptionLifecycleSweep";
    private static final Duration LEASE = Duration.ofMinutes(10);

    private final ScheduledJobCoordinator coordinator;

    @Around("execution(public void com.prayer.pointfinder.service.SubscriptionLifecycleService.sweepExpiredTermsAndGracePeriods())")
    public Object coordinateSweep(ProceedingJoinPoint joinPoint) throws Throwable {
        AtomicReference<Throwable> failure = new AtomicReference<>();
        ScheduledJobCoordinator.Outcome outcome = coordinator.run(JOB_NAME, LEASE, () -> {
            try {
                joinPoint.proceed();
            } catch (RuntimeException | Error ex) {
                throw ex;
            } catch (Throwable ex) {
                failure.set(ex);
            }
        });
        if (failure.get() != null) {
            throw failure.get();
        }
        if (outcome == ScheduledJobCoordinator.Outcome.SKIPPED) {
            log.debug("[JOBS] billing sweep skipped on this instance (leased elsewhere)");
        }
        return null;
    }
}
