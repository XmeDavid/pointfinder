package com.prayer.pointfinder.ha;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * The name this backend process uses when it claims job leases, owns presence
 * rows, tags outbox events and persists its outbox cursor.
 *
 * <p>Resolution order: {@code app.instance-id}, then {@code HOSTNAME} (the
 * container id under Docker Swarm, which is stable for the life of the
 * container and changes on redeploy), then a random UUID. A random id still
 * works; it only means a restarted process starts its outbox cursor from
 * "now" instead of replaying what it missed while down.
 */
@Slf4j
@Component
public class InstanceIdentity {

    private final String id;

    @Autowired
    public InstanceIdentity(@Value("${app.instance-id:}") String configured,
                            @Value("${HOSTNAME:}") String hostname) {
        String resolved;
        if (configured != null && !configured.isBlank()) {
            resolved = configured.trim();
        } else if (hostname != null && !hostname.isBlank()) {
            resolved = hostname.trim();
        } else {
            resolved = "instance-" + UUID.randomUUID();
        }
        this.id = resolved.length() > 120 ? resolved.substring(0, 120) : resolved;
        log.info("[HA] instance id = {}", this.id);
    }

    /** Test-only constructor for a fixed identity. */
    public InstanceIdentity(String id) {
        this.id = id;
    }

    public String id() {
        return id;
    }
}
