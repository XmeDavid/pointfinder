package com.dbvnfc.repository;

import com.dbvnfc.model.entity.OperatorGame;
import com.dbvnfc.model.entity.OperatorGameId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface OperatorGameRepository extends JpaRepository<OperatorGame, OperatorGameId> {

    @Query("SELECT CASE WHEN COUNT(og) > 0 THEN true ELSE false END FROM OperatorGame og " +
           "WHERE og.operatorId = :operatorId AND og.gameId = :gameId")
    boolean existsByOperatorIdAndGameId(@Param("operatorId") UUID operatorId, @Param("gameId") UUID gameId);
}
