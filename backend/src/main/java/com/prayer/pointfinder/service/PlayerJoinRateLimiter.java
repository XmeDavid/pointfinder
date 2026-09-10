package com.prayer.pointfinder.service;

import com.prayer.pointfinder.service.ratelimit.InMemoryRateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStoreUnavailableException;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

/**
 * Per-IP and per-device rate limiter for {@code POST /api/auth/player/join}.
 *
 * <p>Two independent buckets:
 * <ul>
 *   <li>IP: {@value #MAX_IP_ATTEMPTS} attempts per {@value #WINDOW_SECONDS}s</li>
 *   <li>Device ID: {@value #MAX_DEVICE_ATTEMPTS} attempts per {@value #WINDOW_SECONDS}s</li>
 * </ul>
 *
 * <p>This is a backend-side safety net. The primary defense for join-flood
 * attacks is the nginx {@code player_join_limit} zone (5 r/m / IP). Nginx
 * handles the anonymous IP-based flood; this service handles the cases nginx
 * cannot see (device ID abuse, or cases where nginx is bypassed in dev/test).
 *
 * <p>Counters live in the shared {@link RateLimitStore} so alternating join
 * attempts between two backends draw from one allowance. If the store cannot
 * answer, the join is refused rather than allowed.
 */
@Service
public class PlayerJoinRateLimiter {

    static final int MAX_IP_ATTEMPTS = 10;
    static final int MAX_DEVICE_ATTEMPTS = 20;
    static final long WINDOW_SECONDS = 60;

    static final String SCOPE_IP = "join_ip";
    static final String SCOPE_DEVICE = "join_device";
    /**
     * (ip, deviceId) pairs already counted toward the IP bucket in the
     * current window, so a single device reusing the same IP does not
     * double-dip. The device bucket handles same-device abuse; the IP bucket
     * is meant to catch multi-device flood from one IP.
     */
    static final String SCOPE_PAIR = "join_pair";

    private static final Duration WINDOW = Duration.ofSeconds(WINDOW_SECONDS);

    private final RateLimitStore store;

    public PlayerJoinRateLimiter(RateLimitStore store) {
        this.store = store;
    }

    /** Per-process limiter; used by unit tests of the policy. */
    public PlayerJoinRateLimiter() {
        this(new InMemoryRateLimitStore());
    }

    /**
     * Record one attempt and return {@code true} if neither bucket is
     * exceeded (i.e. the join should proceed). A {@code false} return means
     * the caller must reject the request.
     */
    public boolean tryAcquire(String ip, String deviceId) {
        try {
            Instant now = Instant.now();
            boolean deviceBlocked = deviceId != null
                    && store.hit(SCOPE_DEVICE, deviceId, WINDOW, now).count() > MAX_DEVICE_ATTEMPTS;

            boolean ipBlocked = false;
            if (ip != null) {
                boolean countTowardIp;
                if (deviceId == null) {
                    countTowardIp = true;
                } else {
                    // count == 1 means this pair opened a fresh window: first sighting.
                    countTowardIp = store.hit(SCOPE_PAIR, ip + "|" + deviceId, WINDOW, now).count() == 1;
                }
                if (countTowardIp) {
                    ipBlocked = store.hit(SCOPE_IP, ip, WINDOW, now).count() > MAX_IP_ATTEMPTS;
                } else {
                    ipBlocked = store.get(SCOPE_IP, ip)
                            .filter(bucket -> !bucket.windowExpired(now, WINDOW))
                            .map(bucket -> bucket.count() > MAX_IP_ATTEMPTS)
                            .orElse(false);
                }
            }
            return !(ipBlocked || deviceBlocked);
        } catch (DataAccessException ex) {
            throw new RateLimitStoreUnavailableException("Join limiter unavailable", ex);
        }
    }

    // visible for testing
    public void clear() {
        if (store instanceof InMemoryRateLimitStore memory) {
            memory.clear();
        }
    }

    // visible for testing
    int getIpCount(String ip) {
        return currentCount(SCOPE_IP, ip);
    }

    // visible for testing
    int getDeviceCount(String deviceId) {
        return currentCount(SCOPE_DEVICE, deviceId);
    }

    private int currentCount(String scope, String key) {
        Instant now = Instant.now();
        return store.get(scope, key)
                .filter(bucket -> !bucket.windowExpired(now, WINDOW))
                .map(RateLimitStore.Bucket::count)
                .orElse(0);
    }
}
