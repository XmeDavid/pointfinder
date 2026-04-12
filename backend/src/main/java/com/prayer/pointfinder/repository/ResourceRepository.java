package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.Resource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ResourceRepository extends JpaRepository<Resource, UUID> {
    List<Resource> findByOrganizationIdAndGameIdIsNull(UUID orgId);
    List<Resource> findByOrganizationIdAndGameIdIsNullAndFolderId(UUID orgId, UUID folderId);
    List<Resource> findByGameId(UUID gameId);
    List<Resource> findByGameIdAndFolderId(UUID gameId, UUID folderId);
    List<Resource> findByGameIdAndSharedWithPlayersTrue(UUID gameId);
    List<Resource> findByOrganizationIdAndGameIdIsNullAndNameContainingIgnoreCase(UUID orgId, String name);
    List<Resource> findByGameIdAndNameContainingIgnoreCase(UUID gameId, String name);

    @Query("SELECT COALESCE(SUM(r.sizeBytes), 0) FROM Resource r WHERE r.organization.id = :orgId")
    long sumSizeBytesByOrganizationId(@Param("orgId") UUID orgId);

    @Query("SELECT COALESCE(SUM(r.sizeBytes), 0) FROM Resource r WHERE r.game.id = :gameId AND r.organization IS NULL")
    long sumSizeBytesByGameIdAndOrganizationIsNull(@Param("gameId") UUID gameId);

    @Query("SELECT COALESCE(SUM(r.sizeBytes), 0) FROM Resource r WHERE r.createdBy.id = :userId AND r.organization IS NULL")
    long sumSizeBytesByCreatedByIdAndOrganizationIsNull(@Param("userId") UUID userId);
}
