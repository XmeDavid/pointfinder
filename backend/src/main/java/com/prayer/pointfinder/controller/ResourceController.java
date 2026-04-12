package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.service.ResourceFolderService;
import com.prayer.pointfinder.service.ResourceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ResourceController {

    private final ResourceService resourceService;
    private final ResourceFolderService folderService;

    // --- Org Resources ---
    @GetMapping("/api/orgs/{orgId}/resources")
    public ResponseEntity<List<ResourceResponse>> listOrgResources(
            @PathVariable UUID orgId,
            @RequestParam(required = false) UUID folderId,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(resourceService.listOrgResources(orgId, folderId, search));
    }

    @PostMapping(value = "/api/orgs/{orgId}/resources", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ResourceResponse> createOrgResource(
            @PathVariable UUID orgId,
            @RequestPart("metadata") @Valid CreateResourceRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(resourceService.createOrgResource(orgId, request, file));
    }

    // --- Game Resources ---
    @GetMapping("/api/games/{gameId}/resources")
    public ResponseEntity<List<ResourceResponse>> listGameResources(
            @PathVariable UUID gameId,
            @RequestParam(required = false) UUID folderId,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(resourceService.listGameResources(gameId, folderId, search));
    }

    @PostMapping(value = "/api/games/{gameId}/resources", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ResourceResponse> createGameResource(
            @PathVariable UUID gameId,
            @RequestPart("metadata") @Valid CreateResourceRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(resourceService.createGameResource(gameId, request, file));
    }

    // --- Shared CRUD ---
    @GetMapping("/api/resources/{resourceId}")
    public ResponseEntity<ResourceResponse> getResource(@PathVariable UUID resourceId) {
        return ResponseEntity.ok(resourceService.getResource(resourceId));
    }

    @PutMapping("/api/resources/{resourceId}")
    public ResponseEntity<ResourceResponse> updateResource(
            @PathVariable UUID resourceId,
            @RequestBody @Valid UpdateResourceRequest request) {
        return ResponseEntity.ok(resourceService.updateResource(resourceId, request));
    }

    @DeleteMapping("/api/resources/{resourceId}")
    public ResponseEntity<Void> deleteResource(@PathVariable UUID resourceId) {
        resourceService.deleteResource(resourceId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/resources/{resourceId}/download")
    public ResponseEntity<Void> downloadResource(@PathVariable UUID resourceId) {
        String url = resourceService.getDownloadUrl(resourceId);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header("Location", url)
                .header("Cache-Control", "private, max-age=3500")
                .build();
    }

    // --- Org Folders ---
    @GetMapping("/api/orgs/{orgId}/folders")
    public ResponseEntity<List<ResourceFolderResponse>> listOrgFolders(@PathVariable UUID orgId) {
        return ResponseEntity.ok(folderService.listOrgFolders(orgId));
    }

    @PostMapping("/api/orgs/{orgId}/folders")
    public ResponseEntity<ResourceFolderResponse> createOrgFolder(
            @PathVariable UUID orgId, @RequestBody @Valid CreateFolderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(folderService.createOrgFolder(orgId, request));
    }

    // --- Game Folders ---
    @GetMapping("/api/games/{gameId}/folders")
    public ResponseEntity<List<ResourceFolderResponse>> listGameFolders(@PathVariable UUID gameId) {
        return ResponseEntity.ok(folderService.listGameFolders(gameId));
    }

    @PostMapping("/api/games/{gameId}/folders")
    public ResponseEntity<ResourceFolderResponse> createGameFolder(
            @PathVariable UUID gameId, @RequestBody @Valid CreateFolderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(folderService.createGameFolder(gameId, request));
    }

    // --- Shared Folder ops ---
    @PutMapping("/api/folders/{folderId}")
    public ResponseEntity<ResourceFolderResponse> updateFolder(
            @PathVariable UUID folderId, @RequestBody @Valid UpdateFolderRequest request) {
        return ResponseEntity.ok(folderService.updateFolder(folderId, request));
    }

    @DeleteMapping("/api/folders/{folderId}")
    public ResponseEntity<Void> deleteFolder(@PathVariable UUID folderId) {
        folderService.deleteFolder(folderId);
        return ResponseEntity.noContent().build();
    }
}
