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

import java.net.URL;
import java.nio.file.Path;
import java.time.Duration;

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
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(config.getPresignExpirySeconds()))
                .getObjectRequest(GetObjectRequest.builder()
                        .bucket(config.getBucket())
                        .key(key)
                        .build())
                .build();
        URL url = s3Presigner.presignGetObject(presignRequest).url();
        return url.toString();
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
        ListObjectsV2Response response = s3Client.listObjectsV2(
                ListObjectsV2Request.builder()
                        .bucket(config.getBucket())
                        .prefix(prefix)
                        .build());
        return response.contents().stream()
                .map(S3Object::key)
                .toList();
    }
}
