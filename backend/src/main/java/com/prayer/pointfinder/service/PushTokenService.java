package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.PushPlatform;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * A device token belongs to exactly one active registration at a time: one
 * phone of one player (player_push_tokens, keyed by device), or one operator
 * account (users.push_token). A participation on two phones keeps two rows.
 */
@Service
@RequiredArgsConstructor
public class PushTokenService {

    private final JdbcTemplate jdbc;

    @Transactional(timeout = 10)
    public void registerPlayer(UUID playerId, String deviceId, String token, PushPlatform platform) {
        lock(token, platform);
        // The same phone plays several games under several player rows with one token; keep those.
        jdbc.update("DELETE FROM player_push_tokens WHERE token = ? AND device_id <> ?", token, deviceId);
        jdbc.update("UPDATE users SET push_token = NULL, push_platform = NULL WHERE push_token = ?", token);
        int upserted = jdbc.update("""
                INSERT INTO player_push_tokens (player_id, device_id, token, platform, updated_at)
                SELECT id, ?, ?, ?, now() FROM players WHERE id = ?
                ON CONFLICT (player_id, device_id) DO UPDATE SET token = EXCLUDED.token, platform = EXCLUDED.platform, updated_at = now()
                """, deviceId, token, platform.name(), playerId);
        if (upserted != 1) throw new ResourceNotFoundException("Push token owner", playerId);
    }

    @Transactional(timeout = 10)
    public void registerOperator(UUID id, String token, PushPlatform platform) {
        lock(token, platform);
        releaseEverywhere(token);
        int updated = jdbc.update("UPDATE users SET push_token = ?, push_platform = ? WHERE id = ?", token, platform.name(), id);
        if (updated != 1) throw new ResourceNotFoundException("Push token owner", id);
    }

    /** Match the old token so delayed logout cannot remove a newer registration of the same phone. */
    @Transactional(timeout = 10)
    public void unregisterPlayer(UUID playerId, String token, PushPlatform platform) {
        jdbc.update("DELETE FROM player_push_tokens WHERE player_id = ? AND token = ? AND platform = ?", playerId, token, platform.name());
    }

    @Transactional(timeout = 10)
    public void unregisterOperator(UUID id, String token, PushPlatform platform) {
        jdbc.update("UPDATE users SET push_token = NULL, push_platform = NULL WHERE id = ? AND push_token = ? AND (push_platform = ? OR push_platform IS NULL)", id, token, platform.name());
    }

    /** Serialize even the first registration, when no row yet owns this token. Releases on commit. */
    private void lock(String token, PushPlatform platform) {
        jdbc.queryForObject("SELECT 1 FROM pg_advisory_xact_lock(hashtext(?))", Integer.class, platform.name() + ":" + token);
    }

    private void releaseEverywhere(String token) {
        jdbc.update("DELETE FROM player_push_tokens WHERE token = ?", token);
        jdbc.update("UPDATE users SET push_token = NULL, push_platform = NULL WHERE push_token = ?", token);
    }
}
