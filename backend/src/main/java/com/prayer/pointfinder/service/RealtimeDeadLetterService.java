package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.RealtimeDeadLettersResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.realtime.RealtimeOutboxRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * OW-23: the supported way to inspect dead-lettered realtime events. Platform
 * admins only; bounded; never mutates. There is no replay on purpose: every
 * event is a refresh signal carrying a state version, and clients converge on
 * a snapshot on reconnect or their next refresh, so a late copy would only
 * cause a needless refetch. Retention stays with the existing cleanup job.
 */
@Service
@RequiredArgsConstructor
public class RealtimeDeadLetterService {

    static final int MAX_LIMIT = 200;
    static final int MAX_ERROR_LENGTH = 500;

    private final RealtimeOutboxRepository outboxRepository;
    private final GameAccessService gameAccessService;

    public RealtimeDeadLettersResponse recent(int limit) {
        gameAccessService.ensureCurrentUserIsAdmin();
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new BadRequestException("limit must be between 1 and " + MAX_LIMIT);
        }
        var items = outboxRepository.recentDeadLetters(limit).stream()
                .map(d -> new RealtimeDeadLettersResponse.Item(d.outboxId(), d.instanceId(), d.gameId(), d.audience(), d.teamId(),
                        d.type(), d.payloadJson(), d.attempts(), trim(d.lastError()), d.createdAt(), d.deadLetteredAt()))
                .toList();
        return new RealtimeDeadLettersResponse(outboxRepository.countAllDeadLetters(), items);
    }

    private static String trim(String error) {
        if (error == null || error.length() <= MAX_ERROR_LENGTH) return error;
        return error.substring(0, MAX_ERROR_LENGTH - 1) + "…";
    }
}
