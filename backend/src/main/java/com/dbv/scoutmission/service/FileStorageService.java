package com.dbv.scoutmission.service;

import com.dbv.scoutmission.exception.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class FileStorageService {

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"
    );

    private static final Pattern STORED_FILE_URL_PATTERN = Pattern.compile(
            "^/uploads/([0-9a-fA-F\\-]{36})/([0-9a-fA-F\\-]{36})\\.(jpg|jpeg|png|webp|heic|heif)$"
    );

    private static final Set<String> HEIF_BRANDS = Set.of(
            "heic", "heix", "hevc", "hevx", "heif", "mif1", "msf1"
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
        ImageKind imageKind = validateFile(file);

        String extension = extensionFor(imageKind);
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

    /**
     * Validate a file URL points to an existing upload for the same game.
     * Returns a normalized URL path for storage.
     */
    public String validateStoredFileUrl(String fileUrl, UUID gameId) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return null;
        }

        String trimmed = fileUrl.trim();
        Matcher matcher = STORED_FILE_URL_PATTERN.matcher(trimmed);
        if (!matcher.matches()) {
            throw new BadRequestException("Invalid file URL format");
        }

        String urlGameId = matcher.group(1);
        String fileName = matcher.group(2) + "." + matcher.group(3).toLowerCase(Locale.ROOT);
        if (!urlGameId.equalsIgnoreCase(gameId.toString())) {
            throw new BadRequestException("File URL does not belong to this game");
        }

        Path target = uploadsRoot.resolve(urlGameId).resolve(fileName).normalize();
        if (!target.startsWith(uploadsRoot) || !Files.isRegularFile(target)) {
            throw new BadRequestException("Referenced file does not exist");
        }

        return "/uploads/" + urlGameId + "/" + fileName;
    }

    private ImageKind validateFile(MultipartFile file) {
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

        ImageKind detected = detectImageKind(file);
        if (detected == ImageKind.UNKNOWN) {
            throw new BadRequestException("File content is not a supported image");
        }

        if (!isContentTypeCompatible(contentType, detected)) {
            throw new BadRequestException("File content does not match declared content type");
        }

        return detected;
    }

    private String extensionFor(ImageKind kind) {
        return switch (kind) {
            case PNG -> "png";
            case WEBP -> "webp";
            case HEIF -> "heic";
            default -> "jpg";
        };
    }

    private boolean isContentTypeCompatible(String contentType, ImageKind kind) {
        return switch (kind) {
            case JPEG -> "image/jpeg".equals(contentType);
            case PNG -> "image/png".equals(contentType);
            case WEBP -> "image/webp".equals(contentType);
            case HEIF -> "image/heic".equals(contentType) || "image/heif".equals(contentType);
            case UNKNOWN -> false;
        };
    }

    private ImageKind detectImageKind(MultipartFile file) {
        byte[] header;
        try (InputStream inputStream = file.getInputStream()) {
            header = inputStream.readNBytes(32);
        } catch (IOException e) {
            throw new BadRequestException("Failed to read uploaded file");
        }

        if (header.length >= 3
                && (header[0] & 0xFF) == 0xFF
                && (header[1] & 0xFF) == 0xD8
                && (header[2] & 0xFF) == 0xFF) {
            return ImageKind.JPEG;
        }

        if (header.length >= 8
                && (header[0] & 0xFF) == 0x89
                && header[1] == 'P'
                && header[2] == 'N'
                && header[3] == 'G'
                && (header[4] & 0xFF) == 0x0D
                && (header[5] & 0xFF) == 0x0A
                && (header[6] & 0xFF) == 0x1A
                && (header[7] & 0xFF) == 0x0A) {
            return ImageKind.PNG;
        }

        if (header.length >= 12
                && header[0] == 'R'
                && header[1] == 'I'
                && header[2] == 'F'
                && header[3] == 'F'
                && header[8] == 'W'
                && header[9] == 'E'
                && header[10] == 'B'
                && header[11] == 'P') {
            return ImageKind.WEBP;
        }

        if (header.length >= 12
                && header[4] == 'f'
                && header[5] == 't'
                && header[6] == 'y'
                && header[7] == 'p') {
            String brand = new String(header, 8, 4, StandardCharsets.US_ASCII);
            if (HEIF_BRANDS.contains(brand)) {
                return ImageKind.HEIF;
            }
        }

        return ImageKind.UNKNOWN;
    }

    private enum ImageKind {
        JPEG,
        PNG,
        WEBP,
        HEIF,
        UNKNOWN
    }
}
