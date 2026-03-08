package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.CheckIn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CheckInRepository extends JpaRepository<CheckIn, UUID> {

    List<CheckIn> findByTeamId(UUID teamId);

    List<CheckIn> findByGameIdAndTeamId(UUID gameId, UUID teamId);

    Optional<CheckIn> findByTeamIdAndBaseId(UUID teamId, UUID baseId);

    boolean existsByTeamIdAndBaseId(UUID teamId, UUID baseId);

    @Query("SELECT c FROM CheckIn c LEFT JOIN FETCH c.team LEFT JOIN FETCH c.base WHERE c.game.id = :gameId")
    List<CheckIn> findByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT ci FROM CheckIn ci JOIN FETCH ci.team JOIN FETCH ci.base WHERE ci.game.id = :gameId")
    List<CheckIn> findByGameIdWithRelations(@Param("gameId") UUID gameId);

    void deleteByGameId(UUID gameId);
}
