package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.Organization;
import com.prayer.pointfinder.entity.SubscriptionStatus;
import com.prayer.pointfinder.entity.UserSubscription;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class SubscriptionLifecycleService {

    private static final int GRACE_PERIOD_DAYS = 7;

    /**
     * The statuses a lapsed term moves out of. {@code past_due} belongs here
     * with {@code active}: a club whose payment failed still holds a term, and
     * leaving it out meant it never reached grace and so never froze.
     */
    private static final List<SubscriptionStatus> TERM_SWEEP_STATUSES =
        List.of(SubscriptionStatus.active, SubscriptionStatus.past_due);

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;
    private final OrgInviteService orgInviteService;

    @Transactional
    public void startGracePeriod(UserSubscription sub) {
        sub.setStatus(SubscriptionStatus.grace_period);
        sub.setGracePeriodEnd(Instant.now().plus(GRACE_PERIOD_DAYS, ChronoUnit.DAYS));
        userSubRepository.save(sub);
        log.info("[LIFECYCLE] grace period started userId={} endsAt={}", sub.getUser().getId(), sub.getGracePeriodEnd());
    }

    @Transactional
    public void startGracePeriod(Organization org) {
        org.setSubscriptionStatus(SubscriptionStatus.grace_period);
        org.setGracePeriodEnd(Instant.now().plus(GRACE_PERIOD_DAYS, ChronoUnit.DAYS));
        orgRepository.save(org);
        log.info("[LIFECYCLE] grace period started orgId={} endsAt={}", org.getId(), org.getGracePeriodEnd());
    }

    /**
     * A club whose paid term has run out. Unlike a personal subscription, no
     * Stripe event announces this: the term is a date the backend owns, so a
     * sweeper watches it. Grace runs for {@link #GRACE_PERIOD_DAYS} days from
     * {@code termEnd} itself, not from when this sweep happened, so a late
     * sweep does not hand the club extra time.
     *
     * <p>Runs before {@link #freezeExpiredGracePeriods()} on the same
     * schedule, so a term that ended more than a week ago moves through grace
     * and into frozen within one hour rather than two sweeps.
     *
     * <p>{@code past_due} is swept alongside {@code active}. A club whose last
     * payment attempt failed is exactly the one whose term is about to lapse;
     * sweeping {@code active} alone left it past due forever, never entering
     * grace and therefore never freezing.
     */
    @Transactional
    public int startGracePeriodsForExpiredTerms() {
        Instant now = Instant.now();
        List<Organization> expired = orgRepository
            .findBySubscriptionStatusInAndTermEndNotNullAndTermEndBefore(TERM_SWEEP_STATUSES, now);
        for (Organization org : expired) {
            org.setSubscriptionStatus(SubscriptionStatus.grace_period);
            org.setGracePeriodEnd(org.getTermEnd().plus(GRACE_PERIOD_DAYS, ChronoUnit.DAYS));
            orgRepository.save(org);
            log.info("[LIFECYCLE] club term expired orgId={} termEnd={} graceEndsAt={}",
                org.getId(), org.getTermEnd(), org.getGracePeriodEnd());
        }
        return expired.size();
    }

    @Scheduled(fixedRate = 3600000)
    @Transactional
    public void sweepExpiredTermsAndGracePeriods() {
        startGracePeriodsForExpiredTerms();
        freezeExpiredGracePeriods();
        orgInviteService.expirePendingInvites();
    }

    @Transactional
    public void freezeExpiredGracePeriods() {
        Instant now = Instant.now();

        List<UserSubscription> expiredUserSubs = userSubRepository
            .findByStatusAndGracePeriodEndBefore(SubscriptionStatus.grace_period, now);
        for (UserSubscription sub : expiredUserSubs) {
            sub.setStatus(SubscriptionStatus.frozen);
            userSubRepository.save(sub);
            log.info("[LIFECYCLE] frozen userId={}", sub.getUser().getId());
        }

        List<Organization> expiredOrgs = orgRepository
            .findBySubscriptionStatusAndGracePeriodEndBefore(SubscriptionStatus.grace_period, now);
        for (Organization org : expiredOrgs) {
            org.setSubscriptionStatus(SubscriptionStatus.frozen);
            orgRepository.save(org);
            log.info("[LIFECYCLE] frozen orgId={}", org.getId());
        }

        if (!expiredUserSubs.isEmpty() || !expiredOrgs.isEmpty()) {
            log.info("[LIFECYCLE] freeze check: {} users, {} orgs frozen",
                expiredUserSubs.size(), expiredOrgs.size());
        }
    }
}
