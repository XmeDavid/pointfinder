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

    /**
     * Clubs whose paid term has run out but which have not entered grace yet.
     * Takes a list of statuses because both {@code active} and {@code past_due}
     * clubs still hold a term that can lapse.
     */
    List<Organization> findBySubscriptionStatusInAndTermEndNotNullAndTermEndBefore(
            List<SubscriptionStatus> statuses, Instant before);

    /**
     * The owning org's subscription status for a game, in one query, so
     * {@link com.prayer.pointfinder.security.FrozenAccountFilter} can gate
     * {@code /api/games/{id}/**} without loading the game aggregate. The join
     * is inner, so a personal game yields an empty Optional.
     */
    @Query("SELECT o.subscriptionStatus FROM Game g JOIN g.organization o WHERE g.id = :gameId")
    Optional<SubscriptionStatus> findSubscriptionStatusByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT o FROM Organization o WHERE LOWER(o.name) LIKE LOWER(CONCAT('%', :search, '%'))")
    Page<Organization> searchByName(@Param("search") String search, Pageable pageable);
}
