package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.PushPlatform;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

/** A token belongs to one registration; a participation may hold one per phone. */
@ExtendWith(MockitoExtension.class)
class PushTokenServiceTest {
    @Mock JdbcTemplate jdbc;
    @InjectMocks PushTokenService service;

    @Test
    void registeringAPhoneReleasesTheTokenEverywhereThenUpsertsThatPhonesRow() {
        UUID player = UUID.randomUUID();
        lenient().when(jdbc.update(contains("INSERT INTO player_push_tokens"), eq("device-b"), eq("tok"), eq("android"), eq(player))).thenReturn(1);
        service.registerPlayer(player, "device-b", "tok", PushPlatform.android);
        var order = inOrder(jdbc);
        order.verify(jdbc).queryForObject("SELECT 1 FROM pg_advisory_xact_lock(hashtext(?))", Integer.class, "android:tok");
        order.verify(jdbc).update("DELETE FROM player_push_tokens WHERE token = ? AND device_id <> ?", "tok", "device-b");
        order.verify(jdbc).update("UPDATE users SET push_token = NULL, push_platform = NULL WHERE push_token = ?", "tok");
        order.verify(jdbc).update(contains("ON CONFLICT (player_id, device_id) DO UPDATE"), eq("device-b"), eq("tok"), eq("android"), eq(player));
    }

    @Test
    void movingDeviceToOperatorClearsThePlayerRowsBeforeRegistering() {
        UUID user = UUID.randomUUID();
        lenient().when(jdbc.update("UPDATE users SET push_token = ?, push_platform = ? WHERE id = ?", "device-token", "android", user)).thenReturn(1);
        service.registerOperator(user, "device-token", PushPlatform.android);
        var order = inOrder(jdbc);
        order.verify(jdbc).queryForObject("SELECT 1 FROM pg_advisory_xact_lock(hashtext(?))", Integer.class, "android:device-token");
        order.verify(jdbc).update("DELETE FROM player_push_tokens WHERE token = ?", "device-token");
        order.verify(jdbc).update("UPDATE users SET push_token = ?, push_platform = ? WHERE id = ?", "device-token", "android", user);
    }

    @Test
    void registeringDeletedPlayerFailsSoTransactionRollsBackTheReassignment() {
        UUID player = UUID.randomUUID();
        assertThrows(ResourceNotFoundException.class, () -> service.registerPlayer(player, "device-a", "token", PushPlatform.ios));
    }

    @Test
    void delayedLogoutRemovesOnlyThatPhonesRegistration() {
        UUID player = UUID.randomUUID();
        UUID operator = UUID.randomUUID();
        service.unregisterPlayer(player, "old-token", PushPlatform.ios);
        service.unregisterOperator(operator, "old-token", PushPlatform.android);
        verify(jdbc).update("DELETE FROM player_push_tokens WHERE player_id = ? AND token = ? AND platform = ?", player, "old-token", "ios");
        verify(jdbc).update("UPDATE users SET push_token = NULL, push_platform = NULL WHERE id = ? AND push_token = ? AND (push_platform = ? OR push_platform IS NULL)", operator, "old-token", "android");
        verifyNoMoreInteractions(jdbc);
    }
}
