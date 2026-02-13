package com.dbv.scoutmission.service;

import com.dbv.scoutmission.exception.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FileStorageServiceTest {

    @TempDir
    Path tempDir;

    private FileStorageService fileStorageService;

    @BeforeEach
    void setUp() {
        fileStorageService = new FileStorageService();
        ReflectionTestUtils.setField(fileStorageService, "uploadsPath", tempDir.toString());
        fileStorageService.init();
    }

    @Test
    void storeAcceptsValidPngAndValidatesStoredUrl() {
        UUID gameId = UUID.randomUUID();
        byte[] pngHeader = new byte[]{
                (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
        };
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "photo.png",
                "image/png",
                pngHeader
        );

        String fileUrl = fileStorageService.store(file, gameId);
        assertNotNull(fileUrl);
        assertTrue(fileUrl.startsWith("/api/games/" + gameId + "/files/"));
        assertTrue(fileUrl.endsWith(".png"));

        String validated = fileStorageService.validateStoredFileUrl(fileUrl, gameId);
        assertEquals(fileUrl, validated);
    }

    @Test
    void validateStoredFileUrlAcceptsPlayerApiPathAndNormalizes() {
        UUID gameId = UUID.randomUUID();
        byte[] jpegHeader = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00};
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "photo.jpg",
                "image/jpeg",
                jpegHeader
        );

        String canonicalUrl = fileStorageService.store(file, gameId);
        String filename = canonicalUrl.substring(canonicalUrl.lastIndexOf('/') + 1);
        String playerUrl = "/api/player/files/" + gameId + "/" + filename;

        String validated = fileStorageService.validateStoredFileUrl(playerUrl, gameId);
        assertEquals(canonicalUrl, validated);
    }

    @Test
    void storeRejectsSpoofedMimeTypeWhenPayloadIsNotImage() {
        UUID gameId = UUID.randomUUID();
        MockMultipartFile spoofedFile = new MockMultipartFile(
                "file",
                "photo.jpg",
                "image/jpeg",
                "this-is-not-an-image".getBytes()
        );

        assertThrows(BadRequestException.class, () -> fileStorageService.store(spoofedFile, gameId));
    }

    @Test
    void validateStoredFileUrlRejectsWrongGameReference() {
        UUID ownerGameId = UUID.randomUUID();
        UUID otherGameId = UUID.randomUUID();
        byte[] jpegHeader = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00};
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "photo.jpg",
                "image/jpeg",
                jpegHeader
        );

        String fileUrl = fileStorageService.store(file, ownerGameId);
        assertThrows(BadRequestException.class, () -> fileStorageService.validateStoredFileUrl(fileUrl, otherGameId));
    }

    @Test
    void validateStoredFileUrlRejectsExternalUrls() {
        UUID gameId = UUID.randomUUID();
        assertThrows(
                BadRequestException.class,
                () -> fileStorageService.validateStoredFileUrl("https://evil.example/payload.jpg", gameId)
        );
    }
}
