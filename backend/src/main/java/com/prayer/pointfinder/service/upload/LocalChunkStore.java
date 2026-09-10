package com.prayer.pointfinder.service.upload;

import com.prayer.pointfinder.exception.FileStorageException;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Chunks on the local filesystem under {@code <uploads>/_chunk_sessions/<sessionId>/chunk-<n>.part}.
 * The pre-HA layout, unchanged, so sessions in flight when a deployment
 * switches stores keep working: a chunk missing from the new store is
 * reported to the client as missing and re-uploaded through the existing
 * recovery path.
 */
@Slf4j
public class LocalChunkStore implements ChunkStore {

    private final Path root;

    public LocalChunkStore(Path uploadsRoot) {
        this.root = uploadsRoot.resolve("_chunk_sessions");
    }

    @Override
    public String kind() {
        return "local";
    }

    @Override
    public void prepare(UUID sessionId) {
        try {
            Files.createDirectories(sessionDirectory(sessionId));
        } catch (IOException e) {
            throw new FileStorageException("Could not create upload session directory", e);
        }
    }

    @Override
    public void put(UUID sessionId, int chunkIndex, byte[] bytes) {
        Path chunkPath = chunkPath(sessionId, chunkIndex);
        try {
            Files.createDirectories(chunkPath.getParent());
            Files.write(chunkPath, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            throw new FileStorageException("Failed to store upload chunk", e);
        }
    }

    @Override
    public boolean exists(UUID sessionId, int chunkIndex) {
        return Files.exists(chunkPath(sessionId, chunkIndex));
    }

    @Override
    public Set<Integer> existingChunkIndexes(UUID sessionId) {
        Path dir = sessionDirectory(sessionId);
        Set<Integer> indexes = new TreeSet<>();
        if (!Files.isDirectory(dir)) {
            return indexes;
        }
        try (Stream<Path> files = Files.list(dir)) {
            files.forEach(p -> {
                String name = p.getFileName().toString();
                if (name.startsWith("chunk-") && name.endsWith(".part")) {
                    try {
                        indexes.add(Integer.parseInt(name.substring(6, name.length() - 5)));
                    } catch (NumberFormatException ignored) {
                        // foreign file; ignore
                    }
                }
            });
        } catch (IOException e) {
            throw new FileStorageException("Failed to list upload chunks", e);
        }
        return indexes;
    }

    @Override
    public void copyTo(UUID sessionId, int chunkIndex, OutputStream out) throws IOException {
        Files.copy(chunkPath(sessionId, chunkIndex), out);
    }

    @Override
    public void deleteSession(UUID sessionId) {
        Path dir = sessionDirectory(sessionId);
        if (!Files.exists(dir)) {
            return;
        }
        try (Stream<Path> files = Files.walk(dir)) {
            List<Path> paths = new ArrayList<>();
            files.forEach(paths::add);
            paths.sort((a, b) -> b.getNameCount() - a.getNameCount());
            for (Path path : paths) {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            log.warn("Failed to clean session chunk directory for {}: {}", sessionId, e.getMessage());
        }
    }

    /** Last directory name examined by {@link #sessionsWithStorage}; the next call continues after it. */
    private volatile String sweepCursor;

    @Override
    public List<UUID> sessionsWithStorage(int limit) {
        List<UUID> ids = new ArrayList<>();
        if (!Files.isDirectory(root)) {
            return ids;
        }
        List<String> names;
        try (Stream<Path> dirs = Files.list(root)) {
            names = dirs.filter(Files::isDirectory).map(p -> p.getFileName().toString()).sorted().toList();
        } catch (IOException e) {
            log.warn("Failed to list chunk session directories: {}", e.getMessage());
            return ids;
        }
        String after = sweepCursor;
        int start = 0;
        if (after != null) {
            while (start < names.size() && names.get(start).compareTo(after) <= 0) start++;
        }
        for (int i = 0; i < names.size() && ids.size() < limit; i++) {
            String name = names.get((start + i) % names.size());
            try {
                ids.add(UUID.fromString(name));
            } catch (IllegalArgumentException ignored) {
                // not a session directory
            }
            sweepCursor = name;
        }
        if (ids.size() < limit) {
            sweepCursor = null;
        }
        return ids;
    }

    private Path chunkPath(UUID sessionId, int chunkIndex) {
        return sessionDirectory(sessionId).resolve("chunk-" + chunkIndex + ".part");
    }

    private Path sessionDirectory(UUID sessionId) {
        return root.resolve(sessionId.toString());
    }
}
