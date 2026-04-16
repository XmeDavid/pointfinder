package com.prayer.pointfinder.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

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
 * <p>Storage is an in-memory {@link ConcurrentHashMap} with a background
 * cleanup task. Good enough for a single-backend deployment; for multi-replica
 * we would swap in Redis or Caffeine with distributed counters. Current scale
 * (hundreds of submissions per game) does not justify that complexity.
 */
@Service
public class PlayerJoinRateLimiter {

    static final int MAX_IP_ATTEMPTS = 10;
    static final int MAX_DEVICE_ATTEMPTS = 20;
    static final long WINDOW_SECONDS = 60;

    private final ConcurrentHashMap<String, Counter> ipCounters = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Counter> deviceCounters = new ConcurrentHashMap<>();
    // Tracks which (ip, deviceId) pairs have already counted toward the IP
    // bucket in the current window so a single device reusing the same IP
    // doesn't double-dip. The device bucket handles same-device abuse; the
    // IP bucket is meant to catch multi-device flood from one IP.
    private final ConcurrentHashMap<String, Counter> countedPairs = new ConcurrentHashMap<>();

    /**
     * Record one attempt and return {@code true} if neither bucket is
     * exceeded (i.e. the join should proceed). A {@code false} return means
     * the caller must reject the request.
     */
    public boolean tryAcquire(String ip, String deviceId) {
        boolean deviceBlocked = deviceId != null && bump(deviceCounters, deviceId) > MAX_DEVICE_ATTEMPTS;

        boolean ipBlocked = false;
        if (ip != null) {
            Instant now = Instant.now();
            boolean countTowardIp;
            if (deviceId == null) {
                countTowardIp = true;
            } else {
                String pairKey = ip + "|" + deviceId;
                Counter existing = countedPairs.get(pairKey);
                if (existing == null || existing.isExpired(now)) {
                    countedPairs.put(pairKey, new Counter(1, now));
                    countTowardIp = true;
                } else {
                    countTowardIp = false;
                }
            }
            if (countTowardIp) {
                ipBlocked = bump(ipCounters, ip) > MAX_IP_ATTEMPTS;
            } else {
                Counter c = ipCounters.get(ip);
                ipBlocked = c != null && !c.isExpired(now) && c.count > MAX_IP_ATTEMPTS;
            }
        }
        return !(ipBlocked || deviceBlocked);
    }

    private int bump(ConcurrentHashMap<String, Counter> map, String key) {
        Counter updated = map.compute(key, (k, existing) -> {
            Instant now = Instant.now();
            if (existing == null || existing.isExpired(now)) {
                return new Counter(1, now);
            }
            return new Counter(existing.count + 1, existing.windowStart);
        });
        return updated.count;
    }

    @Scheduled(fixedRate = 5 * 60 * 1000) // every 5 minutes
    public void cleanupExpiredEntries() {
        Instant now = Instant.now();
        ipCounters.entrySet().removeIf(e -> e.getValue().isExpired(now));
        deviceCounters.entrySet().removeIf(e -> e.getValue().isExpired(now));
        countedPairs.entrySet().removeIf(e -> e.getValue().isExpired(now));
    }

    // visible for testing
    public void clear() {
        ipCounters.clear();
        deviceCounters.clear();
        countedPairs.clear();
    }

    // visible for testing
    int getIpCount(String ip) {
        Counter c = ipCounters.get(ip);
        return c == null ? 0 : c.count;
    }

    // visible for testing
    int getDeviceCount(String deviceId) {
        Counter c = deviceCounters.get(deviceId);
        return c == null ? 0 : c.count;
    }

    private record Counter(int count, Instant windowStart) {
        boolean isExpired(Instant now) {
            return now.isAfter(windowStart.plusSeconds(WINDOW_SECONDS));
        }
    }
}
