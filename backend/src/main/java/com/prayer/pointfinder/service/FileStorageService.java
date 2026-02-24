package com.prayer.pointfinder.service;

import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class FileStorageService {

    private static final String EXT_PATTERN = "jpg|jpeg|png|webp|heic|heif|mp4|mov";

    private static final Pattern PLAYER_API_FILE_URL_PATTERN = Pattern.compile(
            "^/api/player/files/([0-9a-fA-F\\-]{36})/([0-9a-fA-F\\-]{36})\\.(" + EXT_PATTERN + ")$"
    );

    private static final Pattern GAME_API_FILE_URL_PATTERN = Pattern.compile(
            "^/api/games/([0-9a-fA-F\\-]{36})/files/([0-9a-fA-F\\-]{36})\\.(" + EXT_PATTERN + ")$"
    );

    private static final Pattern LEGACY_UPLOAD_PATTERN = Pattern.compile(
            "^/uploads/([0-9a-fA-F\\-]{36})/([0-9a-fA-F\\-]{36}\\.(?:" + EXT_PATTERN + "))$"
    );

    private static final Pattern ANY_API_FILE_URL_PATTERN = Pattern.compile(
            "^/api/games/([0-9a-fA-F\\-]{36})/files/([0-9a-fA-F\\-]{36}\\.(?:" + EXT_PATTERN + "))$"
    );

    private static final Map<String, MediaKind> DECLARED_CONTENT_TYPES = Map.ofEntries(
            Map.entry("image/jpeg", MediaKind.JPEG),
            Map.entry("image/png", MediaKind.PNG),
            Map.entry("image/webp", MediaKind.WEBP),
            Map.entry("image/heic", MediaKind.HEIF),
            Map.entry("image/heif", MediaKind.HEIF),
            Map.entry("video/mp4", MediaKind.MP4),
            Map.entry("video/quicktime", MediaKind.MOV)
    );

    private static final Set<String> HEIF_BRANDS = Set.of(
            "heic", "heix", "hevc", "hevx", "heif", "mif1", "msf1"
    );

    private static final Set<String> MP4_BRANDS = Set.of(
            "isom", "iso2", "mp41", "mp42", "avc1", "m4v ", "msnv", "3gp4", "3gp5", "dash", "iso5", "iso6"
    );

    @Value("${app.uploads.path:/uploads}")
    private String uploadsPath;

    @Value("${app.uploads.max-file-size-bytes:2147483648}")
    private long maxFileSizeBytes;

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

    public String store(MultipartFile file, UUID gameId) {
        MediaKind declaredKind = validateDeclaredContentType(file.getContentType());
        ensureSizeLimit(file.getSize());
        MediaKind detectedKind = detectMediaKind(file);
        if (!isDeclaredCompatibleWithDetected(declaredKind, detectedKind)) {
            throw new BadRequestException("File content does not match declared content type");
        }

        String extension = extensionFor(detectedKind);
        String filename = UUID.randomUUID() + "." + extension;
        Path gameDir = uploadsRoot.resolve(gameId.toString());
        try {
            Files.createDirectories(gameDir);
            Path target = gameDir.resolve(filename);
            file.transferTo(target);
            log.info("Stored file: {}", target);
            return "/api/games/" + gameId + "/files/" + filename;
        } catch (IOException e) {
            throw new RuntimeException("Failed to store file", e);
        }
    }

    public String storeAssembledUpload(Path assembledFile, UUID gameId, String contentType, long expectedSizeBytes) {
        MediaKind declaredKind = validateDeclaredContentType(contentType);

        long actualSize;
        try {
            actualSize = Files.size(assembledFile);
        } catch (IOException e) {
            throw new BadRequestException("Assembled upload file is missing");
        }
        if (actualSize != expectedSizeBytes) {
            throw new BadRequestException("Assembled file size does not match upload session metadata");
        }
        ensureSizeLimit(actualSize);

        MediaKind detectedKind = detectMediaKind(assembledFile);
        if (!isDeclaredCompatibleWithDetected(declaredKind, detectedKind)) {
            throw new BadRequestException("Assembled file content does not match declared content type");
        }

        String extension = extensionFor(detectedKind);
        String filename = UUID.randomUUID() + "." + extension;
        Path gameDir = uploadsRoot.resolve(gameId.toString());
        Path target = gameDir.resolve(filename);
        try {
            Files.createDirectories(gameDir);
            Files.move(assembledFile, target);
            log.info("Stored assembled upload: {}", target);
            return "/api/games/" + gameId + "/files/" + filename;
        } catch (IOException e) {
            throw new RuntimeException("Failed to store assembled upload", e);
        }
    }

    public void validateChunkedUploadMetadata(String contentType, long totalSizeBytes) {
        validateDeclaredContentType(contentType);
        ensureSizeLimit(totalSizeBytes);
    }

    public long maxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public Resource loadFile(UUID gameId, String filename) {
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            throw new BadRequestException("Invalid filename");
        }

        Path filePath = uploadsRoot.resolve(gameId.toString()).resolve(filename).normalize();
        if (!filePath.startsWith(uploadsRoot)) {
            throw new BadRequestException("Invalid file path");
        }

        try {
            Resource resource = new UrlResource(filePath.toUri());
            if (!resource.exists() || !resource.isReadable()) {
                throw new ResourceNotFoundException("File not found: " + filename);
            }
            return resource;
        } catch (MalformedURLException e) {
            throw new ResourceNotFoundException("File not found: " + filename);
        }
    }

    public void deleteGameFiles(UUID gameId) {
        Path gameDir = uploadsRoot.resolve(gameId.toString());
        if (!Files.isDirectory(gameDir)) {
            return;
        }
        try (var files = Files.walk(gameDir)) {
            files.sorted(java.util.Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            log.warn("Failed to delete file: {}", path, e);
                        }
                    });
            log.info("Deleted upload directory for game {}", gameId);
        } catch (IOException e) {
            log.warn("Failed to clean up uploads for game {}: {}", gameId, e.getMessage());
        }
    }

    public void deleteFile(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) return;

        Matcher legacyMatcher = LEGACY_UPLOAD_PATTERN.matcher(fileUrl.trim());
        String gameIdStr;
        String fileName;
        if (legacyMatcher.matches()) {
            gameIdStr = legacyMatcher.group(1);
            fileName = legacyMatcher.group(2);
        } else {
            Matcher apiMatcher = ANY_API_FILE_URL_PATTERN.matcher(fileUrl.trim());
            if (!apiMatcher.matches()) {
                log.warn("Cannot parse file URL for deletion: {}", fileUrl);
                return;
            }
            gameIdStr = apiMatcher.group(1);
            fileName = apiMatcher.group(2);
        }

        Path target = uploadsRoot.resolve(gameIdStr).resolve(fileName).normalize();
        if (!target.startsWith(uploadsRoot)) {
            log.warn("Path traversal attempt in file deletion: {}", fileUrl);
            return;
        }
        try {
            Files.deleteIfExists(target);
            log.info("Deleted file: {}", target);
        } catch (IOException e) {
            log.warn("Failed to delete file {}: {}", target, e.getMessage());
        }
    }

    public String validateStoredFileUrl(String fileUrl, UUID gameId) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return null;
        }

        String trimmed = fileUrl.trim();
        String urlGameId;
        String fileName;

        Matcher legacyMatcher = LEGACY_UPLOAD_PATTERN.matcher(trimmed);
        if (legacyMatcher.matches()) {
            urlGameId = legacyMatcher.group(1);
            fileName = legacyMatcher.group(2);
        } else {
            Matcher playerApiMatcher = PLAYER_API_FILE_URL_PATTERN.matcher(trimmed);
            Matcher gameApiMatcher = GAME_API_FILE_URL_PATTERN.matcher(trimmed);
            if (playerApiMatcher.matches()) {
                urlGameId = playerApiMatcher.group(1);
                fileName = playerApiMatcher.group(2) + "." + playerApiMatcher.group(3).toLowerCase(Locale.ROOT);
            } else if (gameApiMatcher.matches()) {
                urlGameId = gameApiMatcher.group(1);
                fileName = gameApiMatcher.group(2) + "." + gameApiMatcher.group(3).toLowerCase(Locale.ROOT);
            } else {
                throw new BadRequestException("Invalid file URL format");
            }
        }

        if (!urlGameId.equalsIgnoreCase(gameId.toString())) {
            throw new BadRequestException("File URL does not belong to this game");
        }

        Path target = uploadsRoot.resolve(urlGameId).resolve(fileName).normalize();
        if (!target.startsWith(uploadsRoot) || !Files.isRegularFile(target)) {
            throw new BadRequestException("Referenced file does not exist");
        }

        return "/api/games/" + urlGameId + "/files/" + fileName;
    }

    private MediaKind validateDeclaredContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            throw new BadRequestException("Content type is required");
        }
        String normalized = contentType.trim().toLowerCase(Locale.ROOT);
        MediaKind kind = DECLARED_CONTENT_TYPES.get(normalized);
        if (kind == null) {
            throw new BadRequestException("File type not allowed. Accepted: JPEG, PNG, WebP, HEIC, MP4, MOV");
        }
        return kind;
    }

    private void ensureSizeLimit(long size) {
        if (size <= 0) {
            throw new BadRequestException("File is empty");
        }
        if (size > maxFileSizeBytes) {
            throw new BadRequestException("File size exceeds allowed limit");
        }
    }

    private MediaKind detectMediaKind(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("File is empty");
        }
        try (InputStream inputStream = file.getInputStream()) {
            MediaKind kind = detectMediaKind(inputStream);
            if (kind == MediaKind.UNKNOWN) {
                throw new BadRequestException("File content is not a supported media type");
            }
            return kind;
        } catch (IOException e) {
            throw new BadRequestException("Failed to read uploaded file");
        }
    }

    private MediaKind detectMediaKind(Path filePath) {
        try (InputStream inputStream = Files.newInputStream(filePath)) {
            MediaKind kind = detectMediaKind(inputStream);
            if (kind == MediaKind.UNKNOWN) {
                throw new BadRequestException("Assembled file content is not a supported media type");
            }
            return kind;
        } catch (IOException e) {
            throw new BadRequestException("Failed to read assembled file");
        }
    }

    private MediaKind detectMediaKind(InputStream inputStream) {
        byte[] header;
        try {
            header = inputStream.readNBytes(32);
        } catch (IOException e) {
            throw new BadRequestException("Failed to read uploaded file");
        }

        if (header.length >= 3
                && (header[0] & 0xFF) == 0xFF
                && (header[1] & 0xFF) == 0xD8
                && (header[2] & 0xFF) == 0xFF) {
            return MediaKind.JPEG;
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
            return MediaKind.PNG;
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
            return MediaKind.WEBP;
        }

        if (header.length >= 12
                && header[4] == 'f'
                && header[5] == 't'
                && header[6] == 'y'
                && header[7] == 'p') {
            String brand = new String(header, 8, 4, StandardCharsets.US_ASCII).toLowerCase(Locale.ROOT);
            if (HEIF_BRANDS.contains(brand)) {
                return MediaKind.HEIF;
            }
            if ("qt  ".equals(brand)) {
                return MediaKind.MOV;
            }
            if (MP4_BRANDS.contains(brand)) {
                return MediaKind.MP4;
            }
        }

        return MediaKind.UNKNOWN;
    }

    private boolean isDeclaredCompatibleWithDetected(MediaKind declaredKind, MediaKind detectedKind) {
        if (declaredKind == MediaKind.HEIF && detectedKind == MediaKind.HEIF) return true;
        if (declaredKind == MediaKind.MP4 && detectedKind == MediaKind.MP4) return true;
        if (declaredKind == MediaKind.MOV && detectedKind == MediaKind.MOV) return true;
        return declaredKind == detectedKind;
    }

    private String extensionFor(MediaKind kind) {
        return switch (kind) {
            case PNG -> "png";
            case WEBP -> "webp";
            case HEIF -> "heic";
            case MP4 -> "mp4";
            case MOV -> "mov";
            default -> "jpg";
        };
    }

    private enum MediaKind {
        JPEG,
        PNG,
        WEBP,
        HEIF,
        MP4,
        MOV,
        UNKNOWN
    }
}
