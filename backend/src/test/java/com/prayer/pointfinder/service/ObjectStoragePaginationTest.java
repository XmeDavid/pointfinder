package com.prayer.pointfinder.service;

import com.prayer.pointfinder.config.ObjectStorageConfig;
import com.prayer.pointfinder.service.upload.S3ChunkStore;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.util.UUID;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ObjectStoragePaginationTest {
    @Test
    void completionSeesChunksBeyondTheFirstThousandObjects() {
        S3Client client = mock(S3Client.class);
        ObjectStorageConfig config = mock(ObjectStorageConfig.class);
        when(config.getBucket()).thenReturn("test-bucket");
        UUID session = UUID.randomUUID();
        String prefix = "chunk-sessions/" + session + "/";
        when(client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(
                ListObjectsV2Response.builder().isTruncated(true).nextContinuationToken("page-two")
                        .contents(IntStream.range(0, 1000).mapToObj(i ->
                                S3Object.builder().key(prefix + "chunk-" + i + ".part").build()).toList()).build(),
                ListObjectsV2Response.builder().isTruncated(false)
                        .contents(S3Object.builder().key(prefix + "chunk-1000.part").build()).build());
        var store = new S3ChunkStore(new ObjectStorageService(config, client, null));
        var indexes = store.existingChunkIndexes(session);
        assertEquals(1001, indexes.size());
        assertTrue(indexes.contains(1000));
        var requests = ArgumentCaptor.forClass(ListObjectsV2Request.class);
        verify(client, times(2)).listObjectsV2(requests.capture());
        assertNull(requests.getAllValues().get(0).continuationToken());
        assertEquals("page-two", requests.getAllValues().get(1).continuationToken());
        assertTrue(requests.getAllValues().stream().allMatch(r -> prefix.equals(r.prefix())));
    }

    @Test
    void emptyListingStopsWithoutAnotherRequest() {
        S3Client client = mock(S3Client.class);
        when(client.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenReturn(ListObjectsV2Response.builder().isTruncated(false).build());
        var service = new ObjectStorageService(mock(ObjectStorageConfig.class), client, null);
        assertTrue(service.listKeys("empty/").isEmpty());
        verify(client).listObjectsV2(any(ListObjectsV2Request.class));
    }
}
