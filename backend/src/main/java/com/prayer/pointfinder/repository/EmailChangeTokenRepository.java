package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.EmailChangeToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EmailChangeTokenRepository extends JpaRepository<EmailChangeToken, UUID> {

    Optional<EmailChangeToken> findByToken(String token);

    @Modifying
    @Query("UPDATE EmailChangeToken t SET t.used = true WHERE t.user.id = :userId AND t.used = false")
    void invalidateAllForUser(@Param("userId") UUID userId);

    @Modifying
    @Query("DELETE FROM EmailChangeToken t WHERE t.used = true OR t.expiresAt < :now")
    int deleteExpiredOrUsed(@Param("now") Instant now);
}
