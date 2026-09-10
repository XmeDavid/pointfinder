package com.prayer.pointfinder.service.upload;

import com.prayer.pointfinder.config.ChunkedUploadProperties;
import com.prayer.pointfinder.service.ObjectStorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Paths;

/**
 * Picks the chunk store. With object storage enabled the S3 store is the
 * default; {@code app.uploads.chunk.store=local} forces the filesystem store
 * (for one instance with a persistent upload volume, or as a rollback).
 */
@Slf4j
@Configuration
public class ChunkStoreConfig {

    @Bean
    public ChunkStore chunkStore(ChunkedUploadProperties props, ObjectStorageService objectStorageService) {
        String configured = props.getChunk().getStore();
        boolean wantS3 = !"local".equalsIgnoreCase(configured);
        if (wantS3 && objectStorageService.isEnabled()) {
            log.info("[UPLOADS] chunk store: s3 (bucket-backed, shared across instances)");
            return new S3ChunkStore(objectStorageService);
        }
        if (wantS3 && "s3".equalsIgnoreCase(configured)) {
            log.warn("[UPLOADS] app.uploads.chunk.store=s3 but object storage is not enabled; using local chunk store");
        }
        log.info("[UPLOADS] chunk store: local ({})", props.getPath());
        return new LocalChunkStore(Paths.get(props.getPath()));
    }
}
