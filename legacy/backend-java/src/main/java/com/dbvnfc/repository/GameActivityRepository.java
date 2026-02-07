package com.dbvnfc.repository;

import com.dbvnfc.model.entity.GameActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GameActivityRepository extends JpaRepository<GameActivity, UUID> {

    @Query("SELECT ga FROM GameActivity ga WHERE ga.game.id = :gameId ORDER BY ga.createdAt DESC")
    List<GameActivity> findByGameIdOrderByCreatedAtDesc(@Param("gameId") UUID gameId);
}
