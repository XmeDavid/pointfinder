package com.dbvnfc.repository;

import com.dbvnfc.model.entity.Event;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface EventRepository extends JpaRepository<Event, UUID> {

    @Query("SELECT e FROM Event e ORDER BY e.createdAt DESC")
    Page<Event> findAllOrderByCreatedAtDesc(Pageable pageable);

    @Query("SELECT e FROM Event e WHERE e.team.id = :teamId ORDER BY e.createdAt DESC")
    Page<Event> findByTeamIdOrderByCreatedAtDesc(@Param("teamId") UUID teamId, Pageable pageable);

    @Query("SELECT e FROM Event e WHERE e.type = :type ORDER BY e.createdAt DESC")
    Page<Event> findByTypeOrderByCreatedAtDesc(@Param("type") String type, Pageable pageable);
}
