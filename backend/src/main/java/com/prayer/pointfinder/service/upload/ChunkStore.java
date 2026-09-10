package com.prayer.pointfinder.service.upload;

import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Where the bytes of an in-progress chunked upload live between the first
 * chunk and completion. The database ({@code upload_session_chunks}) remains
 * the record of which chunks were accepted; the store holds the bytes.
 *
 * <p>Two active backends need a store both can reach: chunks accepted on one
 * instance must be readable when the other instance completes the session.
 * {@link S3ChunkStore} provides that; {@link LocalChunkStore} is the
 * single-instance and local-development behaviour.
 *
 * <p>Every operation is idempotent: writing the same chunk twice, deleting a
 * session that has no chunks, and preparing a session twice are all safe.
 */
public interface ChunkStore {

    /** Human-readable store kind for logs and the readiness doc. */
    String kind();

    /** Called when a session is created; may allocate a directory. */
    void prepare(UUID sessionId);

    /** Stores (or overwrites) one chunk's bytes. */
    void put(UUID sessionId, int chunkIndex, byte[] bytes);

    /** Whether the bytes for this chunk are present. */
    boolean exists(UUID sessionId, int chunkIndex);

    /** Indexes of all chunks with bytes present. Prefer this over per-chunk {@link #exists} on completion. */
    Set<Integer> existingChunkIndexes(UUID sessionId);

    /** Streams one chunk's bytes to {@code out}. */
    void copyTo(UUID sessionId, int chunkIndex, OutputStream out) throws IOException;

    /** Removes everything stored for the session. Safe to call repeatedly. */
    void deleteSession(UUID sessionId);

    /** Session ids that still hold bytes, at most {@code limit}; used to reclaim storage of forgotten sessions. */
    List<UUID> sessionsWithStorage(int limit);
}
