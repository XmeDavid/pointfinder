package com.prayer.pointfinder.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Externalized configuration for the chunked upload subsystem.
 *
 * <p>Extracted from inline @Value annotations on ChunkedUploadService
 * so that tests can construct this object directly instead of relying
 * on ReflectionTestUtils (audit finding 9.8).
 */
@Data
@ConfigurationProperties(prefix = "app.uploads")
public class ChunkedUploadProperties {

    private String path = "/uploads";

    private Chunk chunk = new Chunk();
    private Limits limits = new Limits();

    @Data
    public static class Chunk {
        private int defaultSizeBytes = 8_388_608;
        private boolean enabled = true;
        private int maxSizeBytes = 16_777_216;
        private long sessionTtlSeconds = 86_400;
    }

    @Data
    public static class Limits {
        private int maxActiveSessionsPerPlayer = 3;
        private long maxActiveBytesPerGame = 17_179_869_184L;
    }
}
