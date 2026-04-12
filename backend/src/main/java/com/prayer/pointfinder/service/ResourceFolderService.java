package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateFolderRequest;
import com.prayer.pointfinder.dto.request.UpdateFolderRequest;
import com.prayer.pointfinder.dto.response.ResourceFolderResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.ResourceFolderRepository;
import com.prayer.pointfinder.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class ResourceFolderService {

    private final ResourceFolderRepository resourceFolderRepository;
    private final ResourceRepository resourceRepository;
    private final OrganizationService organizationService;
    private final GameAccessService gameAccessService;

    // --- Org folders ---

    @Transactional(readOnly = true)
    public List<ResourceFolderResponse> listOrgFolders(UUID orgId) {
        organizationService.ensureCurrentUserIsMember(orgId);
        return resourceFolderRepository.findByOrganizationIdAndGameIdIsNull(orgId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public ResourceFolderResponse createOrgFolder(UUID orgId, CreateFolderRequest request) {
        Organization org = organizationService.findOrgOrThrow(orgId);
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.MANAGE_RESOURCES);

        ResourceFolder parent = resolveParent(request.getParentId());

        ResourceFolder folder = ResourceFolder.builder()
                .organization(org)
                .name(request.getName())
                .parent(parent)
                .build();

        folder = resourceFolderRepository.save(folder);
        log.info("[FOLDER] operation=createOrgFolder orgId={} folderId={}", orgId, folder.getId());
        return toResponse(folder);
    }

    // --- Game folders ---

    @Transactional(readOnly = true)
    public List<ResourceFolderResponse> listGameFolders(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return resourceFolderRepository.findByGameId(gameId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public ResourceFolderResponse createGameFolder(UUID gameId, CreateFolderRequest request) {
        Game game = gameAccessService.getAccessibleGame(gameId);

        ResourceFolder parent = resolveParent(request.getParentId());

        ResourceFolder folder = ResourceFolder.builder()
                .game(game)
                .name(request.getName())
                .parent(parent)
                .build();

        folder = resourceFolderRepository.save(folder);
        log.info("[FOLDER] operation=createGameFolder gameId={} folderId={}", gameId, folder.getId());
        return toResponse(folder);
    }

    // --- Update / delete ---

    @Transactional
    public ResourceFolderResponse updateFolder(UUID folderId, UpdateFolderRequest request) {
        ResourceFolder folder = findOrThrow(folderId);

        if (request.getName() != null) {
            folder.setName(request.getName());
        }

        if (request.getParentId() != null) {
            if (request.getParentId().equals(folderId)) {
                throw new BadRequestException("A folder cannot be its own parent");
            }
            ResourceFolder newParent = findOrThrow(request.getParentId());
            folder.setParent(newParent);
        }

        folder = resourceFolderRepository.save(folder);
        log.info("[FOLDER] operation=updateFolder folderId={}", folderId);
        return toResponse(folder);
    }

    @Transactional
    public void deleteFolder(UUID folderId) {
        ResourceFolder folder = findOrThrow(folderId);

        if (resourceFolderRepository.existsByParentId(folderId)) {
            throw new BadRequestException("Cannot delete folder that contains subfolders");
        }

        // Move contained resources to root (null folder)
        List<Resource> contained;
        if (folder.getOrganization() != null) {
            contained = resourceRepository.findByOrganizationIdAndGameIdIsNullAndFolderId(
                    folder.getOrganization().getId(), folderId);
        } else if (folder.getGame() != null) {
            contained = resourceRepository.findByGameIdAndFolderId(folder.getGame().getId(), folderId);
        } else {
            contained = List.of();
        }

        for (Resource r : contained) {
            r.setFolder(null);
            resourceRepository.save(r);
        }

        resourceFolderRepository.delete(folder);
        log.info("[FOLDER] operation=deleteFolder folderId={} movedResources={}", folderId, contained.size());
    }

    // --- Helpers ---

    private ResourceFolder findOrThrow(UUID folderId) {
        return resourceFolderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("ResourceFolder", folderId));
    }

    private ResourceFolder resolveParent(UUID parentId) {
        if (parentId == null) return null;
        return resourceFolderRepository.findById(parentId)
                .orElseThrow(() -> new ResourceNotFoundException("ResourceFolder", parentId));
    }

    private ResourceFolderResponse toResponse(ResourceFolder f) {
        return ResourceFolderResponse.builder()
                .id(f.getId())
                .orgId(f.getOrganization() != null ? f.getOrganization().getId() : null)
                .gameId(f.getGame() != null ? f.getGame().getId() : null)
                .parentId(f.getParent() != null ? f.getParent().getId() : null)
                .name(f.getName())
                .createdAt(f.getCreatedAt())
                .build();
    }
}
