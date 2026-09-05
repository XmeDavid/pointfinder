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
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PushTokenServiceTest {
    @Mock JdbcTemplate jdbc;
    @InjectMocks PushTokenService service;

    @Test
    void movingDeviceToOperatorClearsBothPreviousOwnersBeforeRegistering() {
        UUID user = UUID.randomUUID();
        lenient().when(jdbc.update("UPDATE users SET push_token = ?, push_platform = ? WHERE id = ?", "device-token", "android", user)).thenReturn(1);
        service.registerOperator(user, "device-token", PushPlatform.android);
        var order = inOrder(jdbc);
        order.verify(jdbc).queryForObject("SELECT 1 FROM pg_advisory_xact_lock(hashtext(?))", Integer.class, "android:device-token");
        order.verify(jdbc).update("UPDATE players SET push_token = NULL, push_platform = NULL WHERE push_token = ? AND (push_platform = ? OR push_platform IS NULL)", "device-token", "android");
        order.verify(jdbc).update("UPDATE users SET push_token = NULL, push_platform = NULL WHERE push_token = ? AND (push_platform = ? OR push_platform IS NULL)", "device-token", "android");
        order.verify(jdbc).update("UPDATE users SET push_token = ?, push_platform = ? WHERE id = ?", "device-token", "android", user);
    }

    @Test
    void registeringDeletedPlayerFailsSoTransactionRollsBackTheReassignment() {
        UUID player = UUID.randomUUID();
        assertThrows(ResourceNotFoundException.class, () -> service.registerPlayer(player, "token", PushPlatform.ios));
    }

    @Test
    void delayedLogoutMatchesBothAccountAndOriginalToken() {
        UUID player = UUID.randomUUID();
        UUID operator = UUID.randomUUID();
        service.unregisterPlayer(player, "old-token", PushPlatform.ios);
        service.unregisterOperator(operator, "old-token", PushPlatform.android);
        verify(jdbc).update("UPDATE players SET push_token = NULL, push_platform = NULL WHERE id = ? AND push_token = ? AND (push_platform = ? OR push_platform IS NULL)", player, "old-token", "ios");
        verify(jdbc).update("UPDATE users SET push_token = NULL, push_platform = NULL WHERE id = ? AND push_token = ? AND (push_platform = ? OR push_platform IS NULL)", operator, "old-token", "android");
        verifyNoMoreInteractions(jdbc);
    }
}
