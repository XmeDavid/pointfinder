package com.prayer.pointfinder.service;

import com.prayer.pointfinder.config.ObjectStorageConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class ObjectStorageService {

    private final ObjectStorageConfig config;
    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    @Autowired
    public ObjectStorageService(ObjectStorageConfig config,
                                @Autowired(required = false) S3Client s3Client,
                                @Autowired(required = false) S3Presigner s3Presigner) {
        this.config = config;
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
    }

    public boolean isEnabled() {
        return config.isS3Enabled() && s3Client != null;
    }

    public void upload(String key, byte[] data, String contentType) {
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(config.getBucket())
                        .key(key)
                        .contentType(contentType)
                        .build(),
                RequestBody.fromBytes(data));
        log.debug("[S3] uploaded key={} size={}", key, data.length);
    }

    public void upload(String key, Path file, String contentType) {
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(config.getBucket())
                        .key(key)
                        .contentType(contentType)
                        .build(),
                RequestBody.fromFile(file));
        log.debug("[S3] uploaded key={} from file", key);
    }

    public String generatePresignedUrl(String key) {
        return generatePresignedUrl(key, null);
    }

    /**
     * Generates a presigned GET URL. When {@code filename} is provided, the
     * response includes a {@code Content-Disposition: inline} header so browsers
     * handle the file correctly (audit finding 12.10).
     */
    public String generatePresignedUrl(String key, String filename) {
        GetObjectRequest.Builder getBuilder = GetObjectRequest.builder()
                .bucket(config.getBucket())
                .key(key);
        if (filename != null && !filename.isBlank()) {
            String safe = filename.replaceAll("[^a-zA-Z0-9._-]", "_");
            getBuilder.responseContentDisposition("inline; filename=\"" + safe + "\"");
        }
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(config.getPresignExpirySeconds()))
                .getObjectRequest(getBuilder.build())
                .build();
        URL url = s3Presigner.presignGetObject(presignRequest).url();
        return url.toString();
    }

    /** Streams an object's bytes to {@code out}. */
    public void downloadTo(String key, OutputStream out) throws IOException {
        try (InputStream in = s3Client.getObject(GetObjectRequest.builder()
                .bucket(config.getBucket())
                .key(key)
                .build())) {
            in.transferTo(out);
        }
    }

    /** Downloads an object to a local file, replacing it if present. */
    public void download(String key, Path target) throws IOException {
        try (InputStream in = s3Client.getObject(GetObjectRequest.builder()
                .bucket(config.getBucket())
                .key(key)
                .build())) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /**
     * Deletes every object under {@code prefix}; returns how many were
     * removed. Uses single-object deletes: the multi-object delete call needs
     * a Content-MD5 header that some S3-compatible stores insist on and the
     * SDK no longer sends by default, and a chunk prefix holds few objects.
     */
    public int deleteByPrefix(String prefix) {
        int removed = 0;
        String token = null;
        do {
            ListObjectsV2Response page = s3Client.listObjectsV2(ListObjectsV2Request.builder()
                    .bucket(config.getBucket())
                    .prefix(prefix)
                    .continuationToken(token)
                    .build());
            for (S3Object object : page.contents()) {
                s3Client.deleteObject(DeleteObjectRequest.builder()
                        .bucket(config.getBucket())
                        .key(object.key())
                        .build());
                removed++;
            }
            token = Boolean.TRUE.equals(page.isTruncated()) ? page.nextContinuationToken() : null;
        } while (token != null);
        log.debug("[S3] deleted {} object(s) under prefix={}", removed, prefix);
        return removed;
    }

    /** One page of keys under {@code prefix}, strictly after {@code startAfter} (may be null). */
    public record KeyPage(List<String> keys, boolean truncated) {}

    public KeyPage listKeysPage(String prefix, String startAfter, int maxKeys) {
        ListObjectsV2Request.Builder request = ListObjectsV2Request.builder()
                .bucket(config.getBucket())
                .prefix(prefix)
                .maxKeys(Math.max(1, Math.min(1000, maxKeys)));
        if (startAfter != null && !startAfter.isBlank()) {
            request.startAfter(startAfter);
        }
        ListObjectsV2Response page = s3Client.listObjectsV2(request.build());
        return new KeyPage(page.contents().stream().map(S3Object::key).toList(),
                Boolean.TRUE.equals(page.isTruncated()));
    }

    public void delete(String key) {
        s3Client.deleteObject(DeleteObjectRequest.builder()
                .bucket(config.getBucket())
                .key(key)
                .build());
        log.debug("[S3] deleted key={}", key);
    }

    public boolean exists(String key) {
        try {
            s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(config.getBucket())
                    .key(key)
                    .build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    /**
     * Lists all object keys with the given prefix (e.g. "{gameId}/").
     * Returns an empty list when S3 is not enabled.
     */
    public java.util.List<String> listKeys(String prefix) {
        List<String> keys = new ArrayList<>();
        String token = null;
        do {
            ListObjectsV2Response response = s3Client.listObjectsV2(
                    ListObjectsV2Request.builder()
                            .bucket(config.getBucket())
                            .prefix(prefix)
                            .continuationToken(token)
                            .build());
            response.contents().forEach(object -> keys.add(object.key()));
            token = Boolean.TRUE.equals(response.isTruncated())
                    ? response.nextContinuationToken() : null;
        } while (token != null);
        return keys;
    }
}
