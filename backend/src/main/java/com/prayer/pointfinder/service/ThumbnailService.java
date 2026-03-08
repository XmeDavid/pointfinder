package com.prayer.pointfinder.service;

import lombok.extern.slf4j.Slf4j;
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
import java.util.Iterator;
import java.util.List;
import java.util.Set;

@Service
@Slf4j
public class ThumbnailService {

    private static final int THUMBNAIL_WIDTH = 400;
    private static final float JPEG_QUALITY = 0.8f;
    private static final Set<String> VIDEO_EXTENSIONS = Set.of("mp4", "mov");
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "heic", "heif");

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

    @Async
    public void generateThumbnailsAsync(Path gameDir, List<String> fileUrls) {
        if (fileUrls == null || gameDir == null) return;
        for (String url : fileUrls) {
            try {
                String filename = url.substring(url.lastIndexOf('/') + 1);
                Path source = gameDir.resolve(filename);
                if (Files.isRegularFile(source)) {
                    generateThumbnail(source);
                }
            } catch (Exception e) {
                log.warn("Async thumbnail generation failed for {}: {}", url, e.getMessage());
            }
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
