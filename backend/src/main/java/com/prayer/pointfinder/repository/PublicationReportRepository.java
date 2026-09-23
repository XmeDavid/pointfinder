package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.PublicationReport;
import com.prayer.pointfinder.entity.PublicationReportStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface PublicationReportRepository extends JpaRepository<PublicationReport, UUID> {

    boolean existsByGameIdAndReporterIdAndStatus(UUID gameId, UUID reporterId, PublicationReportStatus status);

    List<PublicationReport> findByGameIdAndStatus(UUID gameId, PublicationReportStatus status);

    /** Open reports for the admin queue, oldest first, with the game and its publication state. */
    @Query("""
            SELECT r FROM PublicationReport r JOIN FETCH r.game g
            WHERE r.status = :status
            ORDER BY r.createdAt ASC
            """)
    List<PublicationReport> findByStatusWithGame(@Param("status") PublicationReportStatus status);
}
