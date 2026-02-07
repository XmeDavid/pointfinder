package com.dbv.scoutmission.repository;

import com.dbv.scoutmission.entity.Base;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BaseRepository extends JpaRepository<Base, UUID> {

    List<Base> findByGameId(UUID gameId);

    long countByGameId(UUID gameId);

    long countByGameIdAndNfcLinkedTrue(UUID gameId);
}
