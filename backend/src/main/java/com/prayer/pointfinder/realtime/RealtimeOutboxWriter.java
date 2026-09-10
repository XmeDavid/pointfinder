package com.prayer.pointfinder.realtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.ha.InstanceIdentity;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Records a realtime event durably, in the caller's transaction, so the
 * other instance can deliver it to its own sockets after commit.
 *
 * <p>Runs inside whatever transaction the caller holds. Business mutations
 * are transactional, so the row commits or rolls back with the change it
 * announces. Outside a transaction the insert auto-commits. With the outbox
 * enabled this is the only delivery path, also for the producing instance:
 * after commit the local consumer is woken and delivers the row to the
 * local sockets in the same order every other instance sees.
 *
 * <p>With the outbox enabled a failure to write the row is a failure of the
 * mutation: the exception propagates and the caller's transaction rolls
 * back. Silently continuing would let the two instances disagree about what
 * happened, which is exactly what the outbox exists to prevent. Disable the
 * outbox (`app.ha.outbox.enabled=false`) to get local-only delivery instead.
 */
@Component
public class RealtimeOutboxWriter {

    private final RealtimeOutboxRepository repository;
    private final ObjectMapper objectMapper;
    private final InstanceIdentity instance;
    private final HaProperties haProperties;
    private final RealtimeOutboxSignal signal;

    public RealtimeOutboxWriter(RealtimeOutboxRepository repository,
                                ObjectMapper objectMapper,
                                InstanceIdentity instance,
                                HaProperties haProperties,
                                RealtimeOutboxSignal signal) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.instance = instance;
        this.haProperties = haProperties;
        this.signal = signal;
    }

    public boolean enabled() {
        return haProperties.getOutbox().isEnabled();
    }

    /**
     * @throws RealtimeOutboxException when the envelope cannot be serialised
     * @throws org.springframework.dao.DataAccessException when the row cannot be written
     */
    public void enqueue(RealtimeEvent event) {
        if (!enabled()) {
            return;
        }
        String json;
        try {
            json = objectMapper.writeValueAsString(event.envelope());
        } catch (JsonProcessingException ex) {
            throw new RealtimeOutboxException("Cannot serialise " + event.type() + " event for game " + event.gameId(), ex);
        }
        repository.insert(instance.id(), event, json);
        wakeLocalConsumerAfterCommit();
    }

    private void wakeLocalConsumerAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    signal.wake();
                }
            });
        } else {
            signal.wake();
        }
    }

    /** An event could not be recorded durably. */
    public static class RealtimeOutboxException extends RuntimeException {
        public RealtimeOutboxException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
