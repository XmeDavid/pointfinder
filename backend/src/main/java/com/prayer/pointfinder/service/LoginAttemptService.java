package com.prayer.pointfinder.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class LoginAttemptService {

    static final int MAX_ATTEMPTS = 10;
    static final long BLOCK_DURATION_MINUTES = 15;

    private final ConcurrentHashMap<String, AttemptRecord> attempts = new ConcurrentHashMap<>();

    public boolean isBlocked(String email) {
        String key = email.toLowerCase();
        AttemptRecord record = attempts.get(key);
        if (record == null) {
            return false;
        }
        if (isExpired(record)) {
            attempts.remove(key);
            return false;
        }
        return record.count >= MAX_ATTEMPTS;
    }

    public void recordFailure(String email) {
        String key = email.toLowerCase();
        attempts.compute(key, (k, existing) -> {
            if (existing == null || isExpired(existing)) {
                return new AttemptRecord(1, Instant.now());
            }
            return new AttemptRecord(existing.count + 1, existing.firstAttempt);
        });
    }

    public void recordSuccess(String email) {
        attempts.remove(email.toLowerCase());
    }

    @Scheduled(fixedRate = 30 * 60 * 1000) // every 30 minutes
    public void cleanupExpiredEntries() {
        attempts.entrySet().removeIf(entry -> isExpired(entry.getValue()));
    }

    // visible for testing
    int getAttemptCount(String email) {
        AttemptRecord record = attempts.get(email.toLowerCase());
        return record == null ? 0 : record.count;
    }

    // visible for testing
    void clear() {
        attempts.clear();
    }

    private boolean isExpired(AttemptRecord record) {
        return Instant.now().isAfter(record.firstAttempt.plusSeconds(BLOCK_DURATION_MINUTES * 60));
    }

    record AttemptRecord(int count, Instant firstAttempt) {}
}
