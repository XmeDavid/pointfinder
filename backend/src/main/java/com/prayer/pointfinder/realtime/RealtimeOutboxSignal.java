package com.prayer.pointfinder.realtime;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicReference;

/**
 * Lets a producer wake this instance's consumer right after commit, so the
 * producer's own sockets do not wait for the poll interval or for the
 * NOTIFY round trip. The runner installs the listener when it starts.
 */
@Component
public class RealtimeOutboxSignal {

    private final AtomicReference<Runnable> listener = new AtomicReference<>();

    public void install(Runnable wake) {
        listener.set(wake);
    }

    public void wake() {
        Runnable wake = listener.get();
        if (wake != null) {
            wake.run();
        }
    }
}
