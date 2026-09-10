package com.prayer.pointfinder.service.upload;

import com.prayer.pointfinder.service.ObjectStorageService;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Chunks as objects under {@code chunk-sessions/<sessionId>/chunk-<n>.part}
 * in the media bucket. Both backends read and write the same objects, so a
 * session can start on one instance, continue on the other and complete on
 * either, and a restart loses nothing.
 *
 * <p>The prefix is outside the per-game {@code <gameId>/} namespace, so
 * deleting a game's media never touches in-flight chunks and the orphan
 * sweep never touches media.
 */
@Slf4j
public class S3ChunkStore implements ChunkStore {

    static final String PREFIX = "chunk-sessions/";

    private final ObjectStorageService objectStorage;

    public S3ChunkStore(ObjectStorageService objectStorage) {
        this.objectStorage = objectStorage;
    }

    @Override
    public String kind() {
        return "s3";
    }

    @Override
    public void prepare(UUID sessionId) {
        // Objects need no container; nothing to allocate.
    }

    @Override
    public void put(UUID sessionId, int chunkIndex, byte[] bytes) {
        objectStorage.upload(key(sessionId, chunkIndex), bytes, "application/octet-stream");
    }

    @Override
    public boolean exists(UUID sessionId, int chunkIndex) {
        return objectStorage.exists(key(sessionId, chunkIndex));
    }

    @Override
    public Set<Integer> existingChunkIndexes(UUID sessionId) {
        Set<Integer> indexes = new TreeSet<>();
        String prefix = sessionPrefix(sessionId);
        for (String key : objectStorage.listKeys(prefix)) {
            String name = key.substring(prefix.length());
            if (name.startsWith("chunk-") && name.endsWith(".part")) {
                try {
                    indexes.add(Integer.parseInt(name.substring(6, name.length() - 5)));
                } catch (NumberFormatException ignored) {
                    // foreign object under the prefix; ignore
                }
            }
        }
        return indexes;
    }

    @Override
    public void copyTo(UUID sessionId, int chunkIndex, OutputStream out) throws IOException {
        objectStorage.downloadTo(key(sessionId, chunkIndex), out);
    }

    @Override
    public void deleteSession(UUID sessionId) {
        try {
            objectStorage.deleteByPrefix(sessionPrefix(sessionId));
        } catch (RuntimeException ex) {
            // The orphan sweep reclaims anything left behind.
            log.warn("[S3] failed to delete chunk objects for session {}: {}", sessionId, ex.getMessage());
        }
    }

    /** Last key examined by {@link #sessionsWithStorage}; the next call continues after it. */
    private volatile String sweepCursor;

    /**
     * Walks the chunk prefix in key order from where the previous call
     * stopped, so a run bounded to {@code limit} sessions eventually reaches
     * every session instead of re-listing the same first ones. Wraps to the
     * start when the listing is exhausted.
     */
    @Override
    public List<UUID> sessionsWithStorage(int limit) {
        List<UUID> ids = new ArrayList<>();
        String after = sweepCursor;
        boolean wrapped = false;
        while (ids.size() < limit) {
            ObjectStorageService.KeyPage page = objectStorage.listKeysPage(PREFIX, after, 1000);
            for (String key : page.keys()) {
                after = key;
                UUID id = sessionIdOf(key);
                if (id != null && !ids.contains(id)) {
                    ids.add(id);
                    if (ids.size() >= limit) {
                        break;
                    }
                }
            }
            if (ids.size() >= limit) {
                sweepCursor = after;
                return ids;
            }
            if (!page.truncated()) {
                // Listing exhausted: start over next time.
                sweepCursor = null;
                if (wrapped || after == null) {
                    return ids;
                }
                // Continue from the beginning within this call once, so a
                // small limit still yields sessions before the old cursor.
                wrapped = true;
                after = null;
            }
        }
        sweepCursor = after;
        return ids;
    }

    private static UUID sessionIdOf(String key) {
        if (!key.startsWith(PREFIX)) {
            return null;
        }
        String rest = key.substring(PREFIX.length());
        int slash = rest.indexOf('/');
        if (slash <= 0) {
            return null;
        }
        try {
            return UUID.fromString(rest.substring(0, slash));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    static String sessionPrefix(UUID sessionId) {
        return PREFIX + sessionId + "/";
    }

    static String key(UUID sessionId, int chunkIndex) {
        return sessionPrefix(sessionId) + "chunk-" + chunkIndex + ".part";
    }
}
