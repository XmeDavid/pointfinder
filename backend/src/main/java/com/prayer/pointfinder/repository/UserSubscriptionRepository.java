package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.SubscriptionStatus;
import com.prayer.pointfinder.entity.UserSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserSubscriptionRepository extends JpaRepository<UserSubscription, UUID> {

    Optional<UserSubscription> findByUserId(UUID userId);

    Optional<UserSubscription> findByStripeCustomerId(String stripeCustomerId);

    Optional<UserSubscription> findByStripeSubscriptionId(String stripeSubscriptionId);

    List<UserSubscription> findByStatusAndGracePeriodEndBefore(SubscriptionStatus status, Instant before);
}
