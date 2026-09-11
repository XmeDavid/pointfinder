package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.ExploreGameResponse;
import com.prayer.pointfinder.dto.response.ExplorePageResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GamePublication;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PublicationCategory;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GamePublicationRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * PF-08: Explore for signed-in accounts. Lists deliberate public summaries of
 * eligible games (listed, not ended, never practice) under the game's own
 * name as title, joins games through the
 * account participation contract, and never reads bases, challenges, codes
 * or player locations. Filtering runs in the database; ordering and paging
 * run in memory over the (small) eligible set.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExploreService {

    static final List<GameStatus> ELIGIBLE = List.of(GameStatus.setup, GameStatus.live);
    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 50;
    static final int MAX_QUERY_LENGTH = 100;
    static final double MAX_RADIUS_KM = 500;

    private final GamePublicationRepository publicationRepository;
    private final GameRepository gameRepository;
    private final PlayerRepository playerRepository;
    private final PlayerAccountService playerAccountService;

    /** Bounded query parameters; anything outside the bounds is a 400. */
    public record Query(String q, String category, boolean featured,
                        Double lat, Double lng, Double radiusKm, Integer page, Integer size) {}

    /**
     * Without a viewer position: featured first, live before upcoming, then
     * earliest start, then newest listing. With one: nearest first, listings
     * without coordinates last (and excluded when a radius is given).
     */
    @Transactional(readOnly = true)
    public ExplorePageResponse list(User viewer, Query query) {
        int page = query.page() == null ? 0 : query.page();
        int size = query.size() == null ? DEFAULT_SIZE : query.size();
        if (page < 0) throw new BadRequestException("page must be 0 or greater");
        if (size < 1 || size > MAX_SIZE) throw new BadRequestException("size must be between 1 and " + MAX_SIZE);
        if (query.q() != null && query.q().length() > MAX_QUERY_LENGTH) throw new BadRequestException("q must not exceed " + MAX_QUERY_LENGTH + " characters");
        if ((query.lat() == null) != (query.lng() == null)) throw new BadRequestException("Provide both lat and lng, or neither");
        if (query.lat() != null && (query.lat() < -90 || query.lat() > 90 || query.lng() < -180 || query.lng() > 180)) throw new BadRequestException("lat/lng out of range");
        if (query.radiusKm() != null && (query.lat() == null || query.radiusKm() <= 0 || query.radiusKm() > MAX_RADIUS_KM)) throw new BadRequestException("radiusKm needs lat/lng and must be between 0 and " + MAX_RADIUS_KM);

        String needle = query.q() == null || query.q().isBlank() ? null : query.q().trim().toLowerCase();
        PublicationCategory category = PublicationCategory.parse(query.category());
        Map<UUID, Player> mine = participationsOf(viewer);
        List<ExploreGameResponse> all = publicationRepository.findListed(ELIGIBLE).stream()
                .filter(p -> needle == null || matches(p, needle))
                .filter(p -> category == null || p.getCategory() == category)
                .filter(p -> !query.featured() || Boolean.TRUE.equals(p.getFeatured()))
                .map(p -> toResponse(p, mine.get(p.getGameId()), query.lat(), query.lng()))
                .filter(r -> query.radiusKm() == null || (r.distanceKm() != null && r.distanceKm() <= query.radiusKm()))
                .sorted(query.lat() != null ? NEAREST : DEFAULT_ORDER)
                .toList();
        // long arithmetic: page * size overflows int for page near Integer.MAX_VALUE.
        int from = (int) Math.min((long) page * size, all.size());
        int to = (int) Math.min((long) from + size, all.size());
        return new ExplorePageResponse(all.subList(from, to), page, size, all.size(), to < all.size());
    }

    /** 404 for anything not currently listed, so an unlisted game cannot be probed by id. */
    @Transactional(readOnly = true)
    public ExploreGameResponse get(User viewer, UUID gameId) {
        GamePublication publication = requireListed(gameId);
        return toResponse(publication, playerRepository.findByUserIdAndGameId(viewer.getId(), gameId).orElse(null), null, null);
    }

    /**
     * Joins from Explore. An existing participation is recovered with the
     * account recovery contract (team untouched). A new one needs the game to
     * be live with a designated admission team and goes through the account
     * join contract with that team's code, which is never returned.
     *
     * <p>Takes the game row's pessimistic write lock first (the lock go-live,
     * end and every publication mutation take), so listing, admission and
     * status are read after any concurrent closure committed, and the
     * participation is created under that lock.
     */
    @Transactional
    public PlayerAuthResponse join(User viewer, UUID gameId, String displayName, String deviceId) {
        gameRepository.findByIdForUpdate(gameId)
                .orElseThrow(() -> new ResourceNotFoundException("Listing", gameId));
        GamePublication publication = requireListed(gameId);
        Game game = publication.getGame();
        if (playerRepository.findByUserIdAndGameId(viewer.getId(), gameId).isPresent()) {
            PlayerAuthResponse recovered = playerAccountService.recoverForAccount(viewer, gameId, deviceId);
            log.info("[EXPLORE] operation=join gameId={} userId={} recovered=true", gameId, viewer.getId());
            return recovered;
        }
        Team team = publication.getAdmissionTeam();
        if (team == null) {
            throw new BadRequestException("This game is listed for information; ask the organizer for a join code",
                    ErrorCode.PUBLICATION_ADMISSION_CLOSED);
        }
        if (game.getStatus() != GameStatus.live) {
            throw new BadRequestException("This game is not live yet", ErrorCode.PUBLICATION_ADMISSION_CLOSED);
        }
        PlayerAuthResponse joined = playerAccountService.joinForAccount(viewer, team.getJoinCode(), displayName, deviceId);
        log.info("[EXPLORE] operation=join gameId={} userId={} teamId={} recovered=false", gameId, viewer.getId(), team.getId());
        return joined;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static final Comparator<ExploreGameResponse> DEFAULT_ORDER = Comparator
            .comparing(ExploreGameResponse::featured).reversed()
            .thenComparing(r -> "live".equals(r.gameStatus()) ? 0 : 1)
            .thenComparing(ExploreGameResponse::startDate, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(ExploreGameResponse::publishedAt, Comparator.nullsLast(Comparator.reverseOrder()));

    private static final Comparator<ExploreGameResponse> NEAREST = Comparator
            .comparing(ExploreGameResponse::distanceKm, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(DEFAULT_ORDER);

    private GamePublication requireListed(UUID gameId) {
        return publicationRepository.findListedByGameId(gameId, ELIGIBLE)
                .orElseThrow(() -> new ResourceNotFoundException("Listing", gameId));
    }

    private Map<UUID, Player> participationsOf(User viewer) {
        Map<UUID, Player> byGame = new HashMap<>();
        for (Player p : playerRepository.findByUserIdOrderByCreatedAtDesc(viewer.getId())) {
            byGame.putIfAbsent(p.getGame().getId(), p);
        }
        return byGame;
    }

    /** Game name (the listing title), place or summary, case-insensitively. */
    private static boolean matches(GamePublication p, String needle) {
        return GamePublicationService.titleOf(p.getGame()).toLowerCase().contains(needle)
                || p.getPlace().toLowerCase().contains(needle)
                || p.getSummary().toLowerCase().contains(needle);
    }

    static boolean joinable(GamePublication p) {
        return p.isListed() && p.getAdmissionTeam() != null && p.getGame().getStatus() == GameStatus.live;
    }

    /** Great-circle distance, rounded to 0.1 km. */
    static double distanceKm(double lat1, double lng1, double lat2, double lng2) {
        double r = Math.PI / 180;
        double dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10.0;
    }

    private ExploreGameResponse toResponse(GamePublication p, Player mine, Double fromLat, Double fromLng) {
        Game game = p.getGame();
        Double distance = fromLat != null && p.getLat() != null ? distanceKm(fromLat, fromLng, p.getLat(), p.getLng()) : null;
        return new ExploreGameResponse(
                p.getGameId(),
                GamePublicationService.titleOf(game),
                p.getSummary(),
                p.getPlace(),
                p.getLat(),
                p.getLng(),
                p.getCategory().name(),
                GamePublicationService.organizerOf(game),
                game.getStatus().name(),
                p.getAdmissionTeam() != null ? "open" : "code",
                joinable(p),
                Boolean.TRUE.equals(p.getFeatured()),
                game.getStartDate(),
                game.getEndDate(),
                p.getPublishedAt(),
                distance,
                mine != null,
                mine != null ? mine.getId() : null);
    }
}
