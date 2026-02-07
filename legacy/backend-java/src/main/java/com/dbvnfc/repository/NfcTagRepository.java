package com.dbvnfc.repository;

import com.dbvnfc.model.entity.NfcTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface NfcTagRepository extends JpaRepository<NfcTag, UUID> {

    Optional<NfcTag> findByTagUuid(String tagUuid);

    @Query("SELECT n FROM NfcTag n WHERE n.game.id = :gameId")
    List<NfcTag> findByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT COUNT(n) FROM NfcTag n WHERE n.game.id = :gameId")
    long countByGameId(@Param("gameId") UUID gameId);

    @Query("SELECT n FROM NfcTag n WHERE n.game.id = :gameId AND n.baseId = :baseId")
    Optional<NfcTag> findByGameIdAndBaseId(@Param("gameId") UUID gameId, @Param("baseId") String baseId);
}
