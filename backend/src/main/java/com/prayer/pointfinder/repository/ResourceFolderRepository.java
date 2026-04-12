package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.ResourceFolder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ResourceFolderRepository extends JpaRepository<ResourceFolder, UUID> {
    List<ResourceFolder> findByOrganizationIdAndGameIdIsNull(UUID orgId);
    List<ResourceFolder> findByGameId(UUID gameId);
    List<ResourceFolder> findByParentId(UUID parentId);
    boolean existsByParentId(UUID parentId);
}
