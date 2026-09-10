package com.prayer.pointfinder.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.ha.InstanceIdentity;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Owns the consumer loop and the optional LISTEN connection for this
 * instance.
 *
 * <p>The poll loop is the delivery guarantee: it runs every
 * {@code app.ha.outbox.poll-interval-ms} regardless of notifications. Two
 * things wake it early: the local producer right after its commit (through
 * {@link RealtimeOutboxSignal}) and the LISTEN connection for commits on the
 * other instance, so latency stays close to commit rather than the poll
 * interval. It is a raw
 * driver connection outside the Hikari pool (a pooled connection held open
 * forever would trip leak detection and cost a pool slot) and reconnects
 * with backoff if it drops.
 */
@Slf4j
@Component
public class RealtimeOutboxRunner implements SmartLifecycle {

    private final RealtimeOutboxConsumer consumer;
    private final HaProperties.Outbox config;
    private final DataSourceProperties dataSourceProperties;
    private final RealtimeOutboxSignal signal;

    private final ReentrantLock lock = new ReentrantLock();
    private final Condition wakeup = lock.newCondition();
    private volatile boolean running;
    private volatile boolean pendingWake;
    private Thread pollThread;
    private Thread listenThread;

    public RealtimeOutboxRunner(RealtimeOutboxRepository repository,
                                RealtimeDispatcher dispatcher,
                                ObjectMapper objectMapper,
                                InstanceIdentity instance,
                                HaProperties haProperties,
                                MeterRegistry meterRegistry,
                                DataSourceProperties dataSourceProperties,
                                RealtimeOutboxSignal signal) {
        this.config = haProperties.getOutbox();
        this.consumer = new RealtimeOutboxConsumer(repository, dispatcher, objectMapper, instance, config, meterRegistry);
        this.dataSourceProperties = dataSourceProperties;
        this.signal = signal;
    }

    public RealtimeOutboxConsumer consumer() {
        return consumer;
    }

    @Override
    public void start() {
        if (!config.isEnabled() || running) {
            return;
        }
        running = true;
        signal.install(this::wake);
        try {
            consumer.start();
        } catch (RuntimeException ex) {
            log.warn("[OUTBOX] consumer could not initialise; will retry on first poll: {}", ex.getMessage());
        }
        pollThread = new Thread(this::pollLoop, "realtime-outbox-poll");
        pollThread.setDaemon(true);
        pollThread.start();
        if (config.isListenEnabled()) {
            listenThread = new Thread(this::listenLoop, "realtime-outbox-listen");
            listenThread.setDaemon(true);
            listenThread.start();
        }
    }

    @Override
    public void stop() {
        running = false;
        wake();
        if (listenThread != null) {
            listenThread.interrupt();
        }
        if (pollThread != null) {
            pollThread.interrupt();
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        // Start after the web server and message broker so dispatch targets exist.
        return Integer.MAX_VALUE - 10;
    }

    /** Wake the poll loop now (a NOTIFY arrived or a test wants immediate delivery). */
    public void wake() {
        lock.lock();
        try {
            pendingWake = true;
            wakeup.signalAll();
        } finally {
            lock.unlock();
        }
    }

    private void pollLoop() {
        while (running) {
            try {
                consumer.poll();
            } catch (RuntimeException ex) {
                log.warn("[OUTBOX] poll failed: {}", ex.getMessage());
            }
            lock.lock();
            try {
                if (!pendingWake) {
                    wakeup.await(config.getPollIntervalMs(), TimeUnit.MILLISECONDS);
                }
                pendingWake = false;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } finally {
                lock.unlock();
            }
        }
    }

    private void listenLoop() {
        long backoffMs = 1000;
        while (running) {
            try (Connection connection = openListenConnection()) {
                backoffMs = 1000;
                PGConnection pg = connection.unwrap(PGConnection.class);
                log.info("[OUTBOX] LISTEN {} established", RealtimeOutboxRepository.NOTIFY_CHANNEL);
                while (running) {
                    PGNotification[] notifications = pg.getNotifications(1000);
                    if (notifications != null && notifications.length > 0) {
                        wake();
                    }
                }
            } catch (SQLException | RuntimeException ex) {
                if (!running) {
                    return;
                }
                log.warn("[OUTBOX] LISTEN connection failed ({}); retrying in {} ms", ex.getMessage(), backoffMs);
                try {
                    Thread.sleep(backoffMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                backoffMs = Math.min(backoffMs * 2, 30_000);
            }
        }
    }

    private Connection openListenConnection() throws SQLException {
        Connection connection = DriverManager.getConnection(
                dataSourceProperties.determineUrl(),
                dataSourceProperties.determineUsername(),
                dataSourceProperties.determinePassword());
        try (Statement statement = connection.createStatement()) {
            statement.execute("LISTEN " + RealtimeOutboxRepository.NOTIFY_CHANNEL);
        }
        return connection;
    }
}
