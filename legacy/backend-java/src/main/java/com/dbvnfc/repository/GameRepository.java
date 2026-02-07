package com.dbvnfc.repository;

import com.dbvnfc.model.entity.Game;
import com.dbvnfc.model.enums.GameStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GameRepository extends JpaRepository<Game, UUID> {

    @Query("SELECT g FROM Game g ORDER BY g.createdAt DESC")
    Page<Game> findAllGames(Pageable pageable);

    @Query("SELECT g FROM Game g JOIN OperatorGame og ON g.id = og.gameId " +
           "WHERE og.operatorId = :operatorId ORDER BY g.createdAt DESC")
    Page<Game> findByOperatorId(@Param("operatorId") UUID operatorId, Pageable pageable);

    @Query("SELECT g FROM Game g WHERE g.status = :status")
    List<Game> findByStatus(@Param("status") GameStatus status);

    @Query("SELECT COUNT(g) FROM Game g JOIN OperatorGame og ON g.id = og.gameId " +
           "WHERE og.operatorId = :operatorId")
    long countByOperatorId(@Param("operatorId") UUID operatorId);
}
