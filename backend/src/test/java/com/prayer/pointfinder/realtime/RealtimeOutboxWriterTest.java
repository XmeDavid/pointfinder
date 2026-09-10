package com.prayer.pointfinder.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * With the outbox enabled, failing to record an event is failing the
 * mutation: nothing is swallowed, and no direct dispatch ever happens.
 */
class RealtimeOutboxWriterTest {

    private final RealtimeOutboxRepository repository = mock(RealtimeOutboxRepository.class);
    private final HaProperties props = new HaProperties();
    private final RealtimeOutboxWriter writer = new RealtimeOutboxWriter(
            repository, new ObjectMapper(), new InstanceIdentity("node-a"), props, new RealtimeOutboxSignal());

    private GameEventBroadcaster broadcaster(RealtimeDispatcher dispatcher) {
        GameRepository games = mock(GameRepository.class);
        when(games.incrementStateVersion(any(UUID.class))).thenReturn(7L);
        return new GameEventBroadcaster(dispatcher, writer, games);
    }

    @Test
    void insertFailurePropagates() {
        when(repository.insert(anyString(), any(), anyString()))
                .thenThrow(new DataAccessResourceFailureException("db down"));
        RealtimeEvent event = RealtimeEvent.all(UUID.randomUUID(), "activity", Map.of("type", "activity"));
        assertThrows(DataAccessResourceFailureException.class, () -> writer.enqueue(event));
    }

    @Test
    void unserialisableEnvelopeFails() {
        Object selfReferencing = new Object() {
            @SuppressWarnings("unused")
            public Object getSelf() { return this; }
        };
        RealtimeEvent event = RealtimeEvent.all(UUID.randomUUID(), "activity", Map.of("data", selfReferencing));
        assertThrows(RealtimeOutboxWriter.RealtimeOutboxException.class, () -> writer.enqueue(event));
        verify(repository, never()).insert(anyString(), any(), anyString());
    }

    @Test
    void broadcasterFailsTheMutationWhenTheRowCannotBeWritten() {
        when(repository.insert(anyString(), any(), anyString()))
                .thenThrow(new DataAccessResourceFailureException("db down"));
        RealtimeDispatcher dispatcher = mock(RealtimeDispatcher.class);
        assertThrows(DataAccessResourceFailureException.class,
                () -> broadcaster(dispatcher).broadcastGameStatus(UUID.randomUUID(), "live"));
        verify(dispatcher, never()).dispatch(any());
    }

    @Test
    void enabledOutboxRecordsTheRowAndNeverDispatchesDirectly() {
        RealtimeDispatcher dispatcher = mock(RealtimeDispatcher.class);
        broadcaster(dispatcher).broadcastGameStatus(UUID.randomUUID(), "live");
        verify(repository).insert(anyString(), any(), anyString());
        verify(dispatcher, never()).dispatch(any());
    }

    @Test
    void disabledOutboxSkipsTheRowAndDispatchesDirectly() {
        props.getOutbox().setEnabled(false);
        RealtimeDispatcher dispatcher = mock(RealtimeDispatcher.class);
        broadcaster(dispatcher).broadcastGameStatus(UUID.randomUUID(), "live");
        verify(repository, never()).insert(anyString(), any(), anyString());
        verify(dispatcher).dispatch(any());
    }
}
