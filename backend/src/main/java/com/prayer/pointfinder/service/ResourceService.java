package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateResourceRequest;
import com.prayer.pointfinder.dto.request.UpdateResourceRequest;
import com.prayer.pointfinder.dto.response.ResourceResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.ResourceFolderRepository;
import com.prayer.pointfinder.repository.ResourceRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class ResourceService {

    private final ResourceRepository resourceRepository;
    private final ResourceFolderRepository resourceFolderRepository;
    private final ObjectStorageService objectStorageService;
    private final OrganizationService organizationService;
    private final GameAccessService gameAccessService;
    private final QuotaService quotaService;

    private static final String DOC_CONTENT_TYPE = "application/vnd.pointfinder.doc";

    // --- Org resources ---

    @Transactional(readOnly = true)
    public List<ResourceResponse> listOrgResources(UUID orgId, UUID folderId, String search) {
        organizationService.ensureCurrentUserIsMember(orgId);
        List<Resource> resources;
        if (search != null && !search.isBlank()) {
            resources = resourceRepository.findByOrganizationIdAndGameIdIsNullAndNameContainingIgnoreCase(orgId, search.trim());
        } else if (folderId != null) {
            resources = resourceRepository.findByOrganizationIdAndGameIdIsNullAndFolderId(orgId, folderId);
        } else {
            resources = resourceRepository.findByOrganizationIdAndGameIdIsNull(orgId);
        }
        return resources.stream().map(this::toResponse).toList();
    }

    @Transactional
    public ResourceResponse createOrgResource(UUID orgId, CreateResourceRequest request, MultipartFile file) {
        Organization org = organizationService.findOrgOrThrow(orgId);
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.MANAGE_RESOURCES);
        User currentUser = SecurityUtils.getCurrentUser();

        ResourceType type = parseType(request.getType());
        ResourceFolder folder = resolveFolder(request.getFolderId());

        Resource resource = Resource.builder()
                .organization(org)
                .type(type)
                .name(request.getName())
                .sharedWithPlayers(request.getSharedWithPlayers() != null ? request.getSharedWithPlayers() : false)
                .createdBy(currentUser)
                .folder(folder)
                .build();

        if (type == ResourceType.document) {
            String content = request.getContent() != null ? request.getContent() : "";
            resource.setContent(content);
            resource.setContentType(DOC_CONTENT_TYPE);
            resource.setSizeBytes((long) content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        } else {
            validateFileProvided(file);
            enforceOrgStorageQuota(org, file.getSize());
            resource = resourceRepository.save(resource); // need ID for S3 key
            String s3Key = buildS3Key(orgId.toString(), resource.getId(), file.getOriginalFilename());
            uploadToS3(s3Key, file);
            resource.setS3Key(s3Key);
            resource.setContentType(file.getContentType() != null ? file.getContentType() : "application/octet-stream");
            resource.setSizeBytes(file.getSize());
        }

        resource = resourceRepository.save(resource);
        log.info("[RESOURCE] operation=createOrgResource orgId={} resourceId={} type={} operator={}",
                orgId, resource.getId(), type, currentUser.getId());
        return toResponse(resource);
    }

    // --- Game resources ---

    @Transactional(readOnly = true)
    public List<ResourceResponse> listGameResources(UUID gameId, UUID folderId, String search) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        List<Resource> resources;
        if (search != null && !search.isBlank()) {
            resources = resourceRepository.findByGameIdAndNameContainingIgnoreCase(gameId, search.trim());
        } else if (folderId != null) {
            resources = resourceRepository.findByGameIdAndFolderId(gameId, folderId);
        } else {
            resources = resourceRepository.findByGameId(gameId);
        }
        return resources.stream().map(this::toResponse).toList();
    }

    @Transactional
    public ResourceResponse createGameResource(UUID gameId, CreateResourceRequest request, MultipartFile file) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        User currentUser = SecurityUtils.getCurrentUser();

        ResourceType type = parseType(request.getType());
        ResourceFolder folder = resolveFolder(request.getFolderId());

        Resource resource = Resource.builder()
                .game(game)
                .type(type)
                .name(request.getName())
                .sharedWithPlayers(request.getSharedWithPlayers() != null ? request.getSharedWithPlayers() : false)
                .createdBy(currentUser)
                .folder(folder)
                .build();

        if (type == ResourceType.document) {
            String content = request.getContent() != null ? request.getContent() : "";
            resource.setContent(content);
            resource.setContentType(DOC_CONTENT_TYPE);
            resource.setSizeBytes((long) content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        } else {
            validateFileProvided(file);
            enforceGameStorageQuota(game, file.getSize());
            resource = resourceRepository.save(resource);
            String ownerId = game.getOrganization() != null
                    ? game.getOrganization().getId().toString()
                    : currentUser.getId().toString();
            String s3Key = buildS3Key(ownerId, resource.getId(), file.getOriginalFilename());
            uploadToS3(s3Key, file);
            resource.setS3Key(s3Key);
            resource.setContentType(file.getContentType() != null ? file.getContentType() : "application/octet-stream");
            resource.setSizeBytes(file.getSize());
        }

        resource = resourceRepository.save(resource);
        log.info("[RESOURCE] operation=createGameResource gameId={} resourceId={} type={} operator={}",
                gameId, resource.getId(), type, currentUser.getId());
        return toResponse(resource);
    }

    // --- Single resource ---

    @Transactional(readOnly = true)
    public ResourceResponse getResource(UUID resourceId) {
        Resource resource = findAndCheckAccess(resourceId);
        return toResponse(resource);
    }

    @Transactional
    public ResourceResponse updateResource(UUID resourceId, UpdateResourceRequest request) {
        Resource resource = findAndCheckAccess(resourceId);
        User currentUser = SecurityUtils.getCurrentUser();

        if (request.getName() != null) {
            resource.setName(request.getName());
        }
        if (request.getSharedWithPlayers() != null) {
            resource.setSharedWithPlayers(request.getSharedWithPlayers());
        }
        if (request.getFolderId() != null) {
            resource.setFolder(resolveFolder(request.getFolderId()));
        }
        if (request.getContent() != null && resource.getType() == ResourceType.document) {
            resource.setContent(request.getContent());
            resource.setSizeBytes((long) request.getContent().getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        }

        resource = resourceRepository.save(resource);
        log.info("[RESOURCE] operation=updateResource resourceId={} operator={}", resourceId, currentUser.getId());
        return toResponse(resource);
    }

    @Transactional
    public void deleteResource(UUID resourceId) {
        Resource resource = findAndCheckAccess(resourceId);
        User currentUser = SecurityUtils.getCurrentUser();

        if (resource.getS3Key() != null && objectStorageService.isEnabled()) {
            try {
                objectStorageService.delete(resource.getS3Key());
            } catch (Exception e) {
                log.warn("[RESOURCE] S3 delete failed for key={}: {}", resource.getS3Key(), e.getMessage());
            }
        }

        resourceRepository.delete(resource);
        log.info("[RESOURCE] operation=deleteResource resourceId={} operator={}", resourceId, currentUser.getId());
    }

    @Transactional(readOnly = true)
    public String getDownloadUrl(UUID resourceId) {
        Resource resource = findAndCheckAccess(resourceId);
        if (resource.getType() != ResourceType.file || resource.getS3Key() == null) {
            throw new BadRequestException("Resource is not a file or has no S3 key");
        }
        if (!objectStorageService.isEnabled()) {
            throw new BadRequestException("Object storage is not configured");
        }
        return objectStorageService.generatePresignedUrl(resource.getS3Key());
    }

    // --- Helpers ---

    private Resource findAndCheckAccess(UUID resourceId) {
        Resource resource = resourceRepository.findById(resourceId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource", resourceId));
        if (resource.getOrganization() != null) {
            organizationService.ensureCurrentUserIsMember(resource.getOrganization().getId());
        } else if (resource.getGame() != null) {
            gameAccessService.ensureCurrentUserCanAccessGame(resource.getGame().getId());
        } else {
            // personal resource — only creator or admin can access
            User currentUser = SecurityUtils.getCurrentUser();
            if (currentUser.getRole() != UserRole.admin &&
                    !currentUser.getId().equals(resource.getCreatedBy().getId())) {
                throw new ForbiddenException("You do not have access to this resource");
            }
        }
        return resource;
    }

    private ResourceFolder resolveFolder(UUID folderId) {
        if (folderId == null) return null;
        return resourceFolderRepository.findById(folderId)
                .orElseThrow(() -> new ResourceNotFoundException("ResourceFolder", folderId));
    }

    private ResourceType parseType(String type) {
        try {
            return ResourceType.valueOf(type);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid resource type: " + type);
        }
    }

    private void validateFileProvided(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("A file must be provided for resource type 'file'");
        }
        if (!objectStorageService.isEnabled()) {
            throw new BadRequestException("Object storage is not configured — cannot upload files");
        }
    }

    private void enforceOrgStorageQuota(Organization org, long uploadSize) {
        long maxBytes = quotaService.getMaxResourceStorageBytes(org);
        if (maxBytes <= 0) return;
        long used = resourceRepository.sumSizeBytesByOrganizationId(org.getId());
        if (used + uploadSize > maxBytes) {
            throw new BadRequestException("Organization storage quota exceeded");
        }
    }

    private void enforceGameStorageQuota(Game game, long uploadSize) {
        User currentUser = SecurityUtils.getCurrentUser();
        if (game.getOrganization() != null) {
            enforceOrgStorageQuota(game.getOrganization(), uploadSize);
        } else {
            long maxBytes = quotaService.getMaxPersonalResourceStorageBytes(currentUser);
            if (maxBytes <= 0) return;
            long used = resourceRepository.sumSizeBytesByCreatedByIdAndOrganizationIsNull(currentUser.getId());
            if (used + uploadSize > maxBytes) {
                throw new BadRequestException("Personal storage quota exceeded");
            }
        }
    }

    private String buildS3Key(String ownerId, UUID resourceId, String originalFilename) {
        String filename = originalFilename != null ? originalFilename : "upload";
        return "resources/" + ownerId + "/" + resourceId + "/" + filename;
    }

    private void uploadToS3(String s3Key, MultipartFile file) {
        try {
            objectStorageService.upload(s3Key, file.getBytes(), file.getContentType() != null ? file.getContentType() : "application/octet-stream");
        } catch (IOException e) {
            throw new BadRequestException("Failed to read uploaded file: " + e.getMessage());
        }
    }

    ResourceResponse toResponse(Resource r) {
        String downloadUrl = null;
        if (r.getType() == ResourceType.file && r.getS3Key() != null && objectStorageService.isEnabled()) {
            try {
                downloadUrl = objectStorageService.generatePresignedUrl(r.getS3Key());
            } catch (Exception e) {
                log.warn("[RESOURCE] Failed to generate presigned URL for resource {}: {}", r.getId(), e.getMessage());
            }
        }
        return ResourceResponse.builder()
                .id(r.getId())
                .orgId(r.getOrganization() != null ? r.getOrganization().getId() : null)
                .gameId(r.getGame() != null ? r.getGame().getId() : null)
                .folderId(r.getFolder() != null ? r.getFolder().getId() : null)
                .type(r.getType())
                .name(r.getName())
                .contentType(r.getContentType())
                .content(r.getType() == ResourceType.document ? r.getContent() : null)
                .sizeBytes(r.getSizeBytes())
                .sharedWithPlayers(r.getSharedWithPlayers())
                .downloadUrl(downloadUrl)
                .createdBy(r.getCreatedBy().getId())
                .createdByName(r.getCreatedBy().getName())
                .createdAt(r.getCreatedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }
}
