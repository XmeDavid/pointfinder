package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Organization;
import com.prayer.pointfinder.entity.SubscriptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

    Optional<Organization> findBySlug(String slug);

    boolean existsBySlug(String slug);

    Optional<Organization> findByStripeCustomerId(String stripeCustomerId);

    List<Organization> findBySubscriptionStatusAndGracePeriodEndBefore(SubscriptionStatus status, Instant before);
}
