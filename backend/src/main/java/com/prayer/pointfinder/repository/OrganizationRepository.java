package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Organization;
import com.prayer.pointfinder.entity.SubscriptionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

    Optional<Organization> findBySlug(String slug);

    boolean existsBySlug(String slug);

    Optional<Organization> findByStripeCustomerId(String stripeCustomerId);

    List<Organization> findBySubscriptionStatusAndGracePeriodEndBefore(SubscriptionStatus status, Instant before);

    @Query("SELECT o FROM Organization o WHERE LOWER(o.name) LIKE LOWER(CONCAT('%', :search, '%'))")
    Page<Organization> searchByName(@Param("search") String search, Pageable pageable);
}
