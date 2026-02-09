package com.dbv.scoutmission.service;

import com.dbv.scoutmission.exception.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Set;
import java.util.UUID;

@Service
@Slf4j
public class FileStorageService {

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"
    );

    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    @Value("${app.uploads.path:/uploads}")
    private String uploadsPath;

    private Path uploadsRoot;

    @PostConstruct
    public void init() {
        uploadsRoot = Paths.get(uploadsPath);
        try {
            Files.createDirectories(uploadsRoot);
            log.info("File uploads directory: {}", uploadsRoot.toAbsolutePath());
        } catch (IOException e) {
            throw new RuntimeException("Could not create uploads directory", e);
        }
    }

    /**
     * Store an uploaded file and return the public URL path.
     *
     * @param file   the uploaded file
     * @param gameId the game this submission belongs to
     * @return the public URL path, e.g. "/uploads/gameId/uuid.jpg"
     */
    public String store(MultipartFile file, UUID gameId) {
        validateFile(file);

        String extension = getExtension(file);
        String filename = UUID.randomUUID() + "." + extension;

        Path gameDir = uploadsRoot.resolve(gameId.toString());
        try {
            Files.createDirectories(gameDir);
            Path target = gameDir.resolve(filename);
            file.transferTo(target);
            log.info("Stored file: {}", target);
            return "/uploads/" + gameId + "/" + filename;
        } catch (IOException e) {
            throw new RuntimeException("Failed to store file", e);
        }
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("File is empty");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BadRequestException("File size exceeds 10MB limit");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new BadRequestException("File type not allowed. Accepted: JPEG, PNG, WebP, HEIC");
        }
    }

    private String getExtension(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType == null) return "jpg";
        return switch (contentType) {
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            case "image/heic", "image/heif" -> "heic";
            default -> "jpg";
        };
    }
}
