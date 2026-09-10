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

    /**
     * Where completion assembles chunks into one file before validation and
     * storage. Local to the instance and bounded: one file per completion,
     * deleted on success and failure. Defaults to the JVM temp directory.
     */
    private String tempPath = System.getProperty("java.io.tmpdir") + "/pointfinder-assembly";

    private Chunk chunk = new Chunk();
    private Limits limits = new Limits();

    @Data
    public static class Chunk {
        private int defaultSizeBytes = 8_388_608;
        private boolean enabled = true;
        private int maxSizeBytes = 16_777_216;
        private long sessionTtlSeconds = 86_400;
        /**
         * {@code auto} (S3 when object storage is enabled, else local),
         * {@code s3} or {@code local}. Two active backends require {@code s3}
         * or a shared upload volume.
         */
        private String store = "auto";
    }

    @Data
    public static class Limits {
        private int maxActiveSessionsPerPlayer = 3;
        private long maxActiveBytesPerGame = 17_179_869_184L;
    }
}
