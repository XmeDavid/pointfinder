package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.GamePublicationRequest;
import com.prayer.pointfinder.dto.response.GamePublicationResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GamePublication;
import com.prayer.pointfinder.entity.GamePublicationEvent;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.OrgPermission;
import com.prayer.pointfinder.entity.PublicationCategory;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.RateLimitExceededException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GamePublicationEventRepository;
import com.prayer.pointfinder.repository.GamePublicationRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * PF-07: publishers write a deliberate public summary and list or delist it;
 * platform administrators alone curate (feature). Publishing never touches the
 * game's status. The listing title is the game's name (no separate public
 * title), so renaming the game renames the listing.
 *
 * <p>Publisher = platform admin, the game's creator, or for an organization
 * game a member holding {@link OrgPermission#DELETE_GAMES} (the org's
 * game-admin bit). A co-operator added through {@code game_operators} may
 * read the publication but not change it.
 *
 * <p>Audit: every listing, admission and curation change is written as a
 * structured {@code [PUBLICATION]} log line with the acting user, and the
 * row keeps who published / featured it and when.
 *
 * <p>Concurrency: every mutation first takes the same pessimistic write lock
 * on the game row that go-live / end take ({@code findByIdForUpdate}) and
 * only then loads the publication row, so a save or feature cannot flush
 * state it read before a concurrent unpublish or end committed, and Explore
 * joins (which take the same lock) serialize with closure. Lock order is
 * always game row, then publication row.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GamePublicationService {

    private final GamePublicationRepository publicationRepository;
    private final GameRepository gameRepository;
    private final GameAccessService gameAccessService;
    private final OrgMembershipRepository orgMembershipRepository;
    private final TeamRepository teamRepository;
    private final GamePublicationEventRepository eventRepository;
    private final PublicationRateLimiter rateLimiter;

    // ── Publisher ───────────────────────────────────────────────────────

    /** Anyone who can access the game may read; 404 until a draft is saved. */
    @Transactional(readOnly = true)
    public GamePublicationResponse get(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return toResponse(requirePublication(gameId));
    }

    /** Creates or updates the draft. Listing state is untouched. */
    @Transactional
    public GamePublicationResponse save(UUID gameId, GamePublicationRequest request) {
        Game game = requirePublisher(gameId);
        throttle();
        if (game.isPracticeGame()) {
            throw new BadRequestException("Practice games cannot be published", ErrorCode.PUBLICATION_NOT_ALLOWED);
        }
        if ((request.getLat() == null) != (request.getLng() == null)) {
            throw new BadRequestException("Provide both latitude and longitude, or neither");
        }
        Team admissionTeam = resolveAdmissionTeam(game, request.getAdmissionTeamId());
        GamePublication publication = publicationRepository.findById(gameId)
                .orElseGet(() -> GamePublication.builder().game(game).build());
        UUID before = publication.getAdmissionTeam() != null ? publication.getAdmissionTeam().getId() : null;
        publication.setTitle(titleOf(game)); // request.title is ignored: the listing title is the game name
        publication.setSummary(request.getSummary().trim());
        publication.setPlace(request.getPlace().trim());
        publication.setLat(request.getLat());
        publication.setLng(request.getLng());
        publication.setCategory(PublicationCategory.parse(request.getCategory()));
        publication.setAdmissionTeam(admissionTeam);
        publication = publicationRepository.saveAndFlush(publication);
        UUID after = admissionTeam != null ? admissionTeam.getId() : null;
        UUID actor = SecurityUtils.getCurrentUser().getId();
        log.info("[PUBLICATION] operation=save gameId={} userId={} listed={}", gameId, actor, publication.isListed());
        if (!Objects.equals(before, after)) {
            log.info("[PUBLICATION] operation=admission gameId={} userId={} teamId={} previousTeamId={}", gameId, actor, after, before);
            audit(game, "admission", admissionTeam, before != null ? teamRepository.getReferenceById(before) : null);
        }
        return toResponse(publication);
    }

    /** Lists the game in Explore. Idempotent. */
    @Transactional
    public GamePublicationResponse publish(UUID gameId) {
        Game game = requirePublisher(gameId);
        throttle();
        GamePublication publication = requirePublication(gameId);
        ensurePublishable(game);
        if (publication.getPublishedAt() == null) {
            User actor = SecurityUtils.getCurrentUser();
            publication.setPublishedAt(Instant.now());
            publication.setPublishedBy(actor);
            publication = publicationRepository.saveAndFlush(publication);
            log.info("[PUBLICATION] operation=publish gameId={} userId={} admissionTeamId={}", gameId, actor.getId(),
                    publication.getAdmissionTeam() != null ? publication.getAdmissionTeam().getId() : null);
            audit(game, "publish", publication.getAdmissionTeam(), null);
        }
        return toResponse(publication);
    }

    /** Delists the game; the summary stays as a draft and curation is cleared. Idempotent. */
    @Transactional
    public GamePublicationResponse unpublish(UUID gameId) {
        Game game = requirePublisher(gameId);
        throttle();
        GamePublication publication = requirePublication(gameId);
        if (publication.getPublishedAt() != null) {
            publication.setPublishedAt(null);
            publication.setPublishedBy(null);
            clearFeatured(publication);
            publication = publicationRepository.saveAndFlush(publication);
            log.info("[PUBLICATION] operation=unpublish gameId={} userId={}", gameId, SecurityUtils.getCurrentUser().getId());
            audit(game, "unpublish", null, null);
        }
        return toResponse(publication);
    }

    // ── Platform admin ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<GamePublicationResponse> listAll() {
        gameAccessService.ensureCurrentUserIsAdmin();
        return publicationRepository.findAllWithGame().stream().map(this::toResponse).toList();
    }

    /** Featured is a curation flag on a listed publication; delisting clears it. */
    @Transactional
    public GamePublicationResponse setFeatured(UUID gameId, boolean featured) {
        gameAccessService.ensureCurrentUserIsAdmin();
        User admin = SecurityUtils.getCurrentUser();
        Game game = lockGame(gameId);
        GamePublication publication = requirePublication(gameId);
        if (featured && !publication.isListed()) {
            throw new BadRequestException("Only a listed publication can be featured", ErrorCode.PUBLICATION_NOT_ALLOWED);
        }
        if (featured) {
            publication.setFeatured(true);
            publication.setFeaturedAt(Instant.now());
            publication.setFeaturedBy(admin);
        } else {
            clearFeatured(publication);
        }
        publication = publicationRepository.saveAndFlush(publication);
        log.info("[PUBLICATION] operation={} gameId={} adminId={}", featured ? "feature" : "unfeature", gameId, admin.getId());
        audit(game, featured ? "feature" : "unfeature", null, null);
        return toResponse(publication);
    }

    // ── Rules ───────────────────────────────────────────────────────────

    /** Pessimistic write lock on the game row: the one lock the lifecycle, publication and Explore join share. */
    private Game lockGame(UUID gameId) {
        return gameRepository.findByIdForUpdate(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Game", gameId));
    }

    /** Locks the game row, then checks access plus the publisher role described on the class. */
    private Game requirePublisher(UUID gameId) {
        // Authorize on an unlocked read first, so a stranger cannot hold this game's row lock
        // while being rejected; the locked re-check below covers ownership changed in between.
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        Game game = lockGame(gameId);
        gameAccessService.ensureCurrentUserCanAccessGame(game);
        User user = SecurityUtils.getCurrentUser();
        if (user.getRole() == UserRole.admin) return game;
        if (game.getCreatedBy() != null && game.getCreatedBy().getId().equals(user.getId())) return game;
        if (game.getOrganization() != null) {
            boolean gameAdmin = orgMembershipRepository
                    .findByOrganizationIdAndUserId(game.getOrganization().getId(), user.getId())
                    .map(m -> m.hasPermission(OrgPermission.DELETE_GAMES))
                    .orElse(false);
            if (gameAdmin) return game;
        }
        throw new ForbiddenException("Only the game owner, an organization game admin or a platform admin can publish this game");
    }

    private GamePublication requirePublication(UUID gameId) {
        return publicationRepository.findById(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Publication", gameId));
    }

    private Team resolveAdmissionTeam(Game game, UUID teamId) {
        if (teamId == null) return null;
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new BadRequestException("Admission team not found", ErrorCode.PUBLICATION_TEAM_INVALID));
        if (!team.getGame().getId().equals(game.getId())) {
            throw new BadRequestException("Admission team must belong to this game", ErrorCode.PUBLICATION_TEAM_INVALID);
        }
        return team;
    }

    /** What may never be listed: practice games and games that already ended. */
    static void ensurePublishable(Game game) {
        if (game.isPracticeGame()) {
            throw new BadRequestException("Practice games cannot be published", ErrorCode.PUBLICATION_NOT_ALLOWED);
        }
        if (game.getStatus() == GameStatus.ended) {
            throw new BadRequestException("An ended game cannot be published", ErrorCode.PUBLICATION_NOT_ALLOWED);
        }
    }

    /** Well above any hand-driven pace; an account flipping listings in a loop is refused and logged. */
    private void throttle() {
        User actor = SecurityUtils.getCurrentUser();
        if (!rateLimiter.tryAcquire(actor.getId())) {
            log.warn("[PUBLICATION] operation=throttled userId={}", actor.getId());
            throw new RateLimitExceededException("Too many listing changes. Please try again later.");
        }
    }

    /** One audit row per listing change, carrying the acting account. */
    private void audit(Game game, String operation, Team team, Team previousTeam) {
        User actor = SecurityUtils.getCurrentUser();
        eventRepository.save(GamePublicationEvent.builder()
                .game(game)
                .operation(operation)
                .actorUser(actor)
                .actorNameSnapshot(actor.getName())
                .team(team)
                .previousTeam(previousTeam)
                .build());
    }

    private static void clearFeatured(GamePublication publication) {
        publication.setFeatured(false);
        publication.setFeaturedAt(null);
        publication.setFeaturedBy(null);
    }

    /** The listing title is always the game's current name; the stored column is only a mirror. */
    static String titleOf(Game game) {
        return game.getName();
    }

    /** Public organizer label: the club for org games, otherwise the game creator. */
    static String organizerOf(Game game) {
        if (game.getOrganization() != null) {
            return game.getOrganization().getName();
        }
        return game.getCreatedBy() != null ? game.getCreatedBy().getName() : null;
    }

    GamePublicationResponse toResponse(GamePublication p) {
        Game game = p.getGame();
        Team team = p.getAdmissionTeam();
        return new GamePublicationResponse(
                p.getGameId(),
                game.getName(),
                game.getStatus().name(),
                organizerOf(game),
                titleOf(game),
                p.getSummary(),
                p.getPlace(),
                p.getLat(),
                p.getLng(),
                p.getCategory().name(),
                team != null ? team.getId() : null,
                team != null ? team.getName() : null,
                p.isListed(),
                p.getPublishedAt(),
                p.getPublishedBy() != null ? p.getPublishedBy().getId() : null,
                p.getPublishedBy() != null ? p.getPublishedBy().getName() : null,
                Boolean.TRUE.equals(p.getFeatured()),
                p.getFeaturedAt(),
                p.getUpdatedAt());
    }
}
