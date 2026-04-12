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

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;

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

    @Scheduled(fixedRate = 3600000)
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
