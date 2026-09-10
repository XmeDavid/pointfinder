package com.prayer.pointfinder.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Generates {@code <name>_thumb.jpg} next to an uploaded image.
 *
 * <p>With object storage enabled the source is fetched from the bucket into a
 * bounded temporary file, the thumbnail is rendered to a second temporary
 * file and uploaded as {@code <gameId>/<name>_thumb.jpg}; both files are
 * removed on success and on failure, so no instance needs a shared upload
 * volume. Without object storage the behaviour is the original local one.
 * Generation is best-effort and idempotent: an existing thumbnail object is
 * left alone.
 */
@Service
@Slf4j
public class ThumbnailService {

    private static final int THUMBNAIL_WIDTH = 400;
    private static final float JPEG_QUALITY = 0.8f;
    private static final Set<String> VIDEO_EXTENSIONS = Set.of("mp4", "mov");
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "heic", "heif");

    private final ObjectStorageService objectStorageService;
    private final String uploadsPath;
    private final String tempPath;

    @Autowired
    public ThumbnailService(ObjectStorageService objectStorageService,
                            @Value("${app.uploads.path:/uploads}") String uploadsPath,
                            @Value("${app.uploads.temp-path:${java.io.tmpdir}/pointfinder-assembly}") String tempPath) {
        this.objectStorageService = objectStorageService;
        this.uploadsPath = uploadsPath;
        this.tempPath = tempPath;
    }

    /** Local-only service; used by unit tests. */
    public ThumbnailService() {
        this(null, System.getProperty("java.io.tmpdir"), System.getProperty("java.io.tmpdir"));
    }

    public Path generateThumbnail(Path sourceFile) {
        String filename = sourceFile.getFileName().toString();
        String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();

        if (VIDEO_EXTENSIONS.contains(ext)) {
            log.debug("Skipping thumbnail for video file: {}", filename);
            return null;
        }

        if (!IMAGE_EXTENSIONS.contains(ext)) {
            log.debug("Skipping thumbnail for unsupported extension: {}", ext);
            return null;
        }

        try {
            BufferedImage original = ImageIO.read(sourceFile.toFile());
            if (original == null) {
                log.warn("Failed to decode image: {}", sourceFile);
                return null;
            }

            BufferedImage thumbnail = resize(original);
            String baseName = filename.substring(0, filename.lastIndexOf('.'));
            Path thumbPath = sourceFile.resolveSibling(baseName + "_thumb.jpg");
            writeJpeg(thumbnail, thumbPath);
            log.info("Generated thumbnail: {}", thumbPath);
            return thumbPath;
        } catch (IOException e) {
            log.warn("Thumbnail generation failed for {}: {}", sourceFile, e.getMessage());
            return null;
        }
    }

    /** Generates thumbnails for the given file URLs of one game, wherever the media lives. */
    @Async
    public void generateThumbnailsAsync(UUID gameId, List<String> fileUrls) {
        if (gameId == null || fileUrls == null) return;
        if (objectStorageService != null && objectStorageService.isEnabled()) {
            for (String url : fileUrls) {
                try {
                    generateThumbnailInObjectStorage(gameId, filenameOf(url));
                } catch (Exception e) {
                    log.warn("Async thumbnail generation failed for {}: {}", url, e.getMessage());
                }
            }
            return;
        }
        generateThumbnailsAsync(Paths.get(uploadsPath).resolve(gameId.toString()), fileUrls);
    }

    /** Local-filesystem variant kept for callers that already resolved the game directory. */
    @Async
    public void generateThumbnailsAsync(Path gameDir, List<String> fileUrls) {
        if (fileUrls == null || gameDir == null) return;
        for (String url : fileUrls) {
            try {
                Path source = gameDir.resolve(filenameOf(url));
                if (Files.isRegularFile(source)) {
                    generateThumbnail(source);
                }
            } catch (Exception e) {
                log.warn("Async thumbnail generation failed for {}: {}", url, e.getMessage());
            }
        }
    }

    /**
     * Fetches {@code gameId/filename} from the bucket, renders the thumbnail
     * locally and uploads it as {@code gameId/<base>_thumb.jpg}. Returns the
     * thumbnail key, or {@code null} when the source is not an image, does
     * not exist, or the thumbnail already exists.
     */
    public String generateThumbnailInObjectStorage(UUID gameId, String filename) throws IOException {
        String ext = filename.contains(".") ? filename.substring(filename.lastIndexOf('.') + 1).toLowerCase() : "";
        if (!IMAGE_EXTENSIONS.contains(ext)) {
            return null;
        }
        String baseName = filename.substring(0, filename.lastIndexOf('.'));
        String sourceKey = gameId + "/" + filename;
        String thumbKey = gameId + "/" + baseName + "_thumb.jpg";
        if (objectStorageService.exists(thumbKey)) {
            return thumbKey;
        }
        if (!objectStorageService.exists(sourceKey)) {
            log.debug("No source object for thumbnail: {}", sourceKey);
            return null;
        }

        Path tempDir = Paths.get(tempPath);
        Files.createDirectories(tempDir);
        Path source = Files.createTempFile(tempDir, "thumb-src-", "." + ext);
        Path thumb = null;
        try {
            objectStorageService.download(sourceKey, source);
            thumb = generateThumbnail(source);
            if (thumb == null) {
                return null;
            }
            objectStorageService.upload(thumbKey, thumb, "image/jpeg");
            log.info("Stored thumbnail to S3: key={}", thumbKey);
            return thumbKey;
        } finally {
            deleteQuietly(source);
            deleteQuietly(thumb);
        }
    }

    private static String filenameOf(String url) {
        return url.substring(url.lastIndexOf('/') + 1);
    }

    private static void deleteQuietly(Path path) {
        if (path == null) return;
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.warn("Failed to delete temp file {}: {}", path, e.getMessage());
        }
    }

    private BufferedImage resize(BufferedImage original) {
        int origWidth = original.getWidth();
        int origHeight = original.getHeight();

        if (origWidth <= THUMBNAIL_WIDTH) {
            return toRgb(original);
        }

        double scale = (double) THUMBNAIL_WIDTH / origWidth;
        int newWidth = THUMBNAIL_WIDTH;
        int newHeight = (int) Math.round(origHeight * scale);

        BufferedImage resized = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = resized.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(original, 0, 0, newWidth, newHeight, null);
        g.dispose();
        return resized;
    }

    private BufferedImage toRgb(BufferedImage source) {
        if (source.getType() == BufferedImage.TYPE_INT_RGB) return source;
        BufferedImage rgb = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = rgb.createGraphics();
        g.drawImage(source, 0, 0, null);
        g.dispose();
        return rgb;
    }

    private void writeJpeg(BufferedImage image, Path target) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) throw new IOException("No JPEG writer available");
        ImageWriter writer = writers.next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(JPEG_QUALITY);
        try (ImageOutputStream out = ImageIO.createImageOutputStream(target.toFile())) {
            writer.setOutput(out);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
    }
}
