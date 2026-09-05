package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.PushPlatform;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** A device token belongs to exactly one active player or operator at a time. */
@Service
@RequiredArgsConstructor
public class PushTokenService {
    private final JdbcTemplate jdbc;

    @Transactional(timeout = 10)
    public void registerPlayer(UUID id, String token, PushPlatform platform) {
        register("players", id, token, platform);
    }

    @Transactional(timeout = 10)
    public void registerOperator(UUID id, String token, PushPlatform platform) {
        register("users", id, token, platform);
    }

    private void register(String table, UUID id, String token, PushPlatform platform) {
        // Serialize even the first registration, when no row yet owns this
        // token. The lock spans both account tables and releases on commit.
        jdbc.queryForObject("SELECT 1 FROM pg_advisory_xact_lock(hashtext(?))", Integer.class, platform.name() + ":" + token);
        for (String ownerTable : new String[] {"players", "users"}) {
            jdbc.update("UPDATE " + ownerTable + " SET push_token = NULL, push_platform = NULL WHERE push_token = ? AND (push_platform = ? OR push_platform IS NULL)", token, platform.name());
        }
        int updated = jdbc.update("UPDATE " + table + " SET push_token = ?, push_platform = ? WHERE id = ?", token, platform.name(), id);
        if (updated != 1) throw new ResourceNotFoundException("Push token owner", id);
    }

    /** Match the old token so delayed logout cannot remove a newer device registration. */
    @Transactional(timeout = 10)
    public void unregisterPlayer(UUID id, String token, PushPlatform platform) {
        unregister("players", id, token, platform);
    }

    @Transactional(timeout = 10)
    public void unregisterOperator(UUID id, String token, PushPlatform platform) {
        unregister("users", id, token, platform);
    }

    private void unregister(String table, UUID id, String token, PushPlatform platform) {
        jdbc.update("UPDATE " + table + " SET push_token = NULL, push_platform = NULL WHERE id = ? AND push_token = ? AND (push_platform = ? OR push_platform IS NULL)", id, token, platform.name());
    }
}
