package com.prayer.pointfinder.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class StorageMigrationService {

    private final ObjectStorageService objectStorageService;

    @Value("${app.uploads.path:/uploads}")
    private String uploadsPath;

    /**
     * Migrates all local files from /uploads/{gameId}/{filename} to S3.
     * Idempotent: skips files that already exist in S3.
     * Skips directories starting with "_" (e.g. _chunk_sessions).
     *
     * @return a summary map with keys "migrated", "skipped", "errors"
     */
    public Map<String, Object> migrateLocalToS3() {
        if (!objectStorageService.isEnabled()) {
            return Map.of("error", "S3 storage not configured");
        }

        Path root = Path.of(uploadsPath);
        if (!Files.isDirectory(root)) {
            return Map.of("error", "Uploads directory does not exist: " + uploadsPath);
        }

        int migrated = 0;
        int skipped = 0;
        int errors = 0;

        try (var gameDirs = Files.list(root)) {
            for (Path gameDir : gameDirs.filter(Files::isDirectory).toList()) {
                String dirName = gameDir.getFileName().toString();
                if (dirName.startsWith("_")) {
                    log.debug("[MIGRATION] Skipping internal directory: {}", dirName);
                    continue;
                }

                try (var gameFiles = Files.list(gameDir)) {
                    for (Path file : gameFiles.filter(Files::isRegularFile).toList()) {
                        String key = dirName + "/" + file.getFileName().toString();
                        try {
                            if (objectStorageService.exists(key)) {
                                log.debug("[MIGRATION] Already exists, skipping: {}", key);
                                skipped++;
                                continue;
                            }
                            String contentType = Files.probeContentType(file);
                            if (contentType == null) contentType = "application/octet-stream";
                            objectStorageService.upload(key, file, contentType);
                            migrated++;
                            log.info("[MIGRATION] Uploaded: {}", key);
                        } catch (Exception e) {
                            errors++;
                            log.error("[MIGRATION] Failed to upload {}: {}", key, e.getMessage());
                        }
                    }
                } catch (IOException e) {
                    errors++;
                    log.error("[MIGRATION] Failed to list files in {}: {}", gameDir, e.getMessage());
                }
            }
        } catch (IOException e) {
            log.error("[MIGRATION] Failed to walk uploads directory: {}", e.getMessage());
            return Map.of("error", e.getMessage());
        }

        log.info("[MIGRATION] Complete: migrated={} skipped={} errors={}", migrated, skipped, errors);
        return Map.of("migrated", migrated, "skipped", skipped, "errors", errors);
    }
}
