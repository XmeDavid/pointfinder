package com.prayer.pointfinder.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ThumbnailServiceTest {

    @TempDir
    Path tempDir;

    private ThumbnailService thumbnailService;

    @BeforeEach
    void setUp() {
        thumbnailService = new ThumbnailService();
    }

    @Test
    void generatesThumbnailWithCorrectWidth() throws IOException {
        Path source = createTestImage(1200, 800, "jpg");
        Path thumbnail = thumbnailService.generateThumbnail(source);

        assertNotNull(thumbnail);
        assertTrue(Files.exists(thumbnail));
        BufferedImage img = ImageIO.read(thumbnail.toFile());
        assertEquals(400, img.getWidth());
        assertEquals(267, img.getHeight());
    }

    @Test
    void thumbnailNamedWithThumbSuffix() throws IOException {
        Path source = createTestImage(800, 600, "jpg");
        Path thumbnail = thumbnailService.generateThumbnail(source);

        String name = thumbnail.getFileName().toString();
        assertTrue(name.endsWith("_thumb.jpg"), "Expected _thumb.jpg suffix, got: " + name);
        String originalName = source.getFileName().toString();
        String expectedPrefix = originalName.substring(0, originalName.lastIndexOf('.'));
        assertTrue(name.startsWith(expectedPrefix));
    }

    @Test
    void thumbnailOutputIsJpeg() throws IOException {
        Path source = createTestPng(600, 400);
        Path thumbnail = thumbnailService.generateThumbnail(source);

        assertTrue(thumbnail.getFileName().toString().endsWith("_thumb.jpg"));
        byte[] header = Files.newInputStream(thumbnail).readNBytes(3);
        assertEquals((byte) 0xFF, header[0]);
        assertEquals((byte) 0xD8, header[1]);
    }

    @Test
    void smallImageNotUpscaled() throws IOException {
        Path source = createTestImage(200, 150, "jpg");
        Path thumbnail = thumbnailService.generateThumbnail(source);

        BufferedImage img = ImageIO.read(thumbnail.toFile());
        assertEquals(200, img.getWidth());
        assertEquals(150, img.getHeight());
    }

    @Test
    void corruptFileReturnsNull() throws IOException {
        Path corrupt = tempDir.resolve("corrupt.jpg");
        Files.write(corrupt, new byte[]{0x00, 0x01, 0x02});

        Path result = thumbnailService.generateThumbnail(corrupt);
        assertNull(result);
    }

    @Test
    void videoFileSkipped() throws IOException {
        Path video = tempDir.resolve("clip.mp4");
        Files.write(video, new byte[]{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'});

        Path result = thumbnailService.generateThumbnail(video);
        assertNull(result);
    }

    private Path createTestImage(int width, int height, String format) throws IOException {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                img.setRGB(x, y, 0x336699);
            }
        }
        Path file = tempDir.resolve("test-" + width + "x" + height + "." + format);
        ImageIO.write(img, format, file.toFile());
        return file;
    }

    private Path createTestPng(int width, int height) throws IOException {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Path file = tempDir.resolve("test-" + width + "x" + height + ".png");
        ImageIO.write(img, "png", file.toFile());
        return file;
    }
}
