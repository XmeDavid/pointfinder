package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.service.FileAccessService;
import com.prayer.pointfinder.service.FileStorageService;
import com.prayer.pointfinder.service.ObjectStorageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * OW-22: review previews ask for a photo's generated thumbnail. Access is
 * decided on the original file, exactly as for the original; the thumbnail
 * is served when it exists and the original otherwise, so a preview never
 * breaks while generation is still running or was not possible.
 */
@ExtendWith(MockitoExtension.class)
class FileThumbnailTest {

    @Mock private FileAccessService fileAccessService;
    @Mock private FileStorageService fileStorageService;
    @Mock private ObjectStorageService objectStorageService;
    @InjectMocks private FileController controller;

    private final UUID gameId = UUID.randomUUID();

    @Test
    void objectStorageRedirectsToTheThumbnailWhenItExists() {
        when(objectStorageService.isEnabled()).thenReturn(true);
        when(objectStorageService.exists(gameId + "/photo_thumb.jpg")).thenReturn(true);
        when(objectStorageService.generatePresignedUrl(gameId + "/photo_thumb.jpg", "photo_thumb.jpg")).thenReturn("https://s3/thumb");

        ResponseEntity<?> response = controller.getThumbnailAsOperator(gameId, "photo.jpg");

        verify(fileAccessService).ensureOperatorCanReadFile(gameId, "photo.jpg");
        assertEquals(HttpStatus.FOUND, response.getStatusCode());
        assertEquals("https://s3/thumb", response.getHeaders().getFirst(HttpHeaders.LOCATION));
    }

    @Test
    void objectStorageFallsBackToTheOriginalWithoutAThumbnail() {
        when(objectStorageService.isEnabled()).thenReturn(true);
        when(objectStorageService.exists(gameId + "/photo_thumb.jpg")).thenReturn(false);
        when(objectStorageService.generatePresignedUrl(gameId + "/photo.png", "photo.png")).thenReturn("https://s3/original");

        ResponseEntity<?> response = controller.getThumbnailAsOperator(gameId, "photo.png");

        assertEquals(HttpStatus.FOUND, response.getStatusCode());
        assertEquals("https://s3/original", response.getHeaders().getFirst(HttpHeaders.LOCATION));
    }

    @Test
    void localStorageStreamsTheThumbnailAsJpeg() {
        when(objectStorageService.isEnabled()).thenReturn(false);
        when(fileStorageService.loadFile(gameId, "photo_thumb.jpg")).thenReturn(new ByteArrayResource(new byte[] {1, 2, 3}));

        ResponseEntity<?> response = controller.getThumbnailAsOperator(gameId, "photo.heic");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.IMAGE_JPEG, response.getHeaders().getContentType());
    }

    @Test
    void localStorageFallsBackToTheOriginalWithoutAThumbnail() {
        when(objectStorageService.isEnabled()).thenReturn(false);
        when(fileStorageService.loadFile(gameId, "photo_thumb.jpg")).thenThrow(new ResourceNotFoundException("File not found: photo_thumb.jpg"));
        when(fileStorageService.loadFile(gameId, "photo.jpg")).thenReturn(new ByteArrayResource(new byte[] {4, 5}));

        ResponseEntity<?> response = controller.getThumbnailAsOperator(gameId, "photo.jpg");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.IMAGE_JPEG, response.getHeaders().getContentType());
        verify(fileStorageService).loadFile(gameId, "photo.jpg");
    }

    @Test
    void videosAreServedAsTheyAreWithoutLookingForAThumbnail() {
        when(objectStorageService.isEnabled()).thenReturn(true);
        when(objectStorageService.generatePresignedUrl(gameId + "/clip.mp4", "clip.mp4")).thenReturn("https://s3/clip");

        ResponseEntity<?> response = controller.getThumbnailAsOperator(gameId, "clip.mp4");

        assertEquals("https://s3/clip", response.getHeaders().getFirst(HttpHeaders.LOCATION));
        verify(objectStorageService, never()).exists(anyString());
    }

    @Test
    void aFileTheOperatorMayNotReadIsNeverServed() {
        doThrow(new ResourceNotFoundException("File not found: photo.jpg"))
                .when(fileAccessService).ensureOperatorCanReadFile(eq(gameId), any());

        assertThrows(ResourceNotFoundException.class, () -> controller.getThumbnailAsOperator(gameId, "photo.jpg"));
        verify(objectStorageService, never()).generatePresignedUrl(anyString(), anyString());
        verify(fileStorageService, never()).loadFile(any(), anyString());
    }
}
