package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Base;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface BaseRepository extends JpaRepository<Base, UUID> {

    List<Base> findByGameId(UUID gameId);

    List<Base> findByGameIdOrderByCreatedAtAsc(UUID gameId);

    List<Base> findByGameIdOrderByOrderIndexAscCreatedAtAsc(UUID gameId);

    long countByGameId(UUID gameId);

    long countByGameIdAndNfcLinkedTrue(UUID gameId);

    List<Base> findByFixedChallengeId(UUID challengeId);

    @Modifying
    @Query("UPDATE Base b SET b.orderIndex = :orderIndex WHERE b.id = :id AND b.game.id = :gameId")
    void updateOrderIndex(@Param("id") UUID id, @Param("gameId") UUID gameId, @Param("orderIndex") int orderIndex);
}
