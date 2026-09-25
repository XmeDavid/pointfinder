package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PublicationReportRequest;
import com.prayer.pointfinder.dto.response.GamePublicationResponse;
import com.prayer.pointfinder.dto.response.PublicationReportResponse;
import com.prayer.pointfinder.entity.GamePublication;
import com.prayer.pointfinder.entity.PublicationReport;
import com.prayer.pointfinder.entity.PublicationReportReason;
import com.prayer.pointfinder.entity.PublicationReportStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GamePublicationRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PublicationReportRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * OW-06: moderation of public listings. Any signed-in account may report a
 * game Explore currently lists; one open report per account and game, so
 * repeating a report adds nothing. Platform admins read open reports and
 * resolve all of a game's open reports at once: dismiss keeps the listing,
 * remove is the ordinary unpublish (audited as the admin's own action, the
 * game and the organizer's summary stay). Reporters are visible to admins
 * only.
 *
 * <p>Resolution takes the game row's write lock first, the same lock order
 * every publication mutation uses, so a dismiss and a remove never interleave.
 * Removal holds the listing (owner decision 2026-09-24).
 *
 * <p>Alerts: when a game receives its first open report, the moderation
 * recipients ({@code app.moderation.alert-emails}) get one email after the
 * report commits. Further reports on that game while it has open reports do
 * not send more, so a pile-on cannot flood the inbox; resolving the reports
 * re-arms the alert.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PublicationReportService {

    private final PublicationReportRepository reportRepository;
    private final GamePublicationRepository publicationRepository;
    private final GameRepository gameRepository;
    private final GamePublicationService publicationService;
    private final GameAccessService gameAccessService;
    private final EmailService emailService;

    @Value("${app.moderation.alert-emails:}")
    private String alertEmails;

    /** 404 for anything Explore does not list, so reports cannot probe unlisted games. */
    @Transactional
    public void report(User reporter, UUID gameId, PublicationReportRequest request) {
        PublicationReportReason reason = PublicationReportReason.parse(request.getReason());
        GamePublication publication = publicationRepository.findListedByGameId(gameId, ExploreService.ELIGIBLE)
                .orElseThrow(() -> new ResourceNotFoundException("Listing", gameId));
        if (reportRepository.existsByGameIdAndReporterIdAndStatus(gameId, reporter.getId(), PublicationReportStatus.open)) {
            log.info("[PUBLICATION] operation=report gameId={} userId={} result=alreadyOpen", gameId, reporter.getId());
            return;
        }
        String details = request.getDetails() == null || request.getDetails().isBlank() ? null : request.getDetails().trim();
        boolean firstOpen = !reportRepository.existsByGameIdAndStatus(gameId, PublicationReportStatus.open);
        reportRepository.saveAndFlush(PublicationReport.builder()
                .game(publication.getGame())
                .reporter(reporter)
                .reporterNameSnapshot(reporter.getName())
                .reason(reason)
                .details(details)
                .build());
        log.info("[PUBLICATION] operation=report gameId={} userId={} reason={}", gameId, reporter.getId(), reason);
        if (firstOpen) alertAfterCommit(publication.getGame().getName(), reason.name(), details, reporter.getName());
    }

    private void alertAfterCommit(String gameName, String reason, String details, String reporterName) {
        List<String> recipients = Arrays.stream(alertEmails.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (recipients.isEmpty()) return;
        Runnable send = () -> emailService.sendModerationAlert(recipients, gameName, reason, details, reporterName);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }

    /** Open reports, oldest first. */
    @Transactional(readOnly = true)
    public List<PublicationReportResponse> listOpen() {
        gameAccessService.ensureCurrentUserIsAdmin();
        List<PublicationReport> reports = reportRepository.findByStatusWithGame(PublicationReportStatus.open);
        Map<UUID, GamePublication> publications = publicationRepository
                .findAllById(reports.stream().map(r -> r.getGame().getId()).distinct().toList())
                .stream().collect(Collectors.toMap(GamePublication::getGameId, Function.identity()));
        return reports.stream().map(r -> {
            GamePublication publication = publications.get(r.getGame().getId());
            return new PublicationReportResponse(
                    r.getId(),
                    r.getGame().getId(),
                    r.getGame().getName(),
                    publication != null && publication.isListed(),
                    r.getReason().name(),
                    r.getDetails(),
                    r.getReporterNameSnapshot(),
                    r.getCreatedAt());
        }).toList();
    }

    /** Closes the game's open reports and keeps the listing. Idempotent. */
    @Transactional
    public void dismiss(UUID gameId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        gameRepository.findByIdForUpdate(gameId).orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
        int closed = resolve(gameId, PublicationReportStatus.dismissed);
        log.info("[PUBLICATION] operation=dismissReports gameId={} adminId={} reports={}", gameId, SecurityUtils.getCurrentUser().getId(), closed);
    }

    /** Removes the listing from Explore and closes the game's open reports. */
    @Transactional
    public GamePublicationResponse remove(UUID gameId) {
        gameAccessService.ensureCurrentUserIsAdmin();
        GamePublicationResponse unpublished = publicationService.adminRemove(gameId);
        int closed = resolve(gameId, PublicationReportStatus.removed);
        log.info("[PUBLICATION] operation=removeReported gameId={} adminId={} reports={}", gameId, SecurityUtils.getCurrentUser().getId(), closed);
        return unpublished;
    }

    private int resolve(UUID gameId, PublicationReportStatus outcome) {
        User admin = SecurityUtils.getCurrentUser();
        Instant now = Instant.now();
        List<PublicationReport> open = reportRepository.findByGameIdAndStatus(gameId, PublicationReportStatus.open);
        for (PublicationReport report : open) {
            report.setStatus(outcome);
            report.setResolvedAt(now);
            report.setResolvedBy(admin);
        }
        reportRepository.saveAll(open);
        return open.size();
    }
}
