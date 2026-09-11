package com.prayer.pointfinder.xp;

import com.prayer.pointfinder.dto.response.LeaderboardEntry;
import com.prayer.pointfinder.dto.response.XpProfileResponse;
import com.prayer.pointfinder.dto.response.XpRewardResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.service.AssignmentResolver;
import com.prayer.pointfinder.service.MonitoringService;
import com.prayer.pointfinder.service.PlayerAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * PF-03: the platform's XP ledger. Game points belong to the organizer; XP
 * belongs to the platform. Every award is an append-only row on a cycle,
 * written with ON CONFLICT DO NOTHING against the (cycle, kind, reference,
 * player) key, so replays, retries, repeated reviews and repeated resets are
 * no-ops without ever touching the caller's persistence context. See
 * docs/specs/2026-09-10-xp-and-profile.md for the formulas.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class XpService {

    static final String REASON_PRACTICE = "practice_game";
    static final String REASON_SINGLE_TEAM = "single_team";
    static final String REASON_CREATOR_PLAYS = "creator_plays";

    private static final String INSERT_AWARD = """
            INSERT INTO xp_awards (cycle_id, game_id, team_id, player_id, user_id, kind, reference_id, base_amount, factor, amount, formula_version, awarded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (cycle_id, kind, reference_id, player_id) WHERE player_id IS NOT NULL DO NOTHING
            """;

    private final XpCycleRepository cycleRepository;
    private final XpAwardRepository awardRepository;
    private final XpResultRepository resultRepository;
    private final PlayerRepository playerRepository;
    private final TeamRepository teamRepository;
    private final BaseRepository baseRepository;
    private final AssignmentRepository assignmentRepository;
    private final SubmissionRepository submissionRepository;
    private final MonitoringService monitoringService;
    private final JdbcTemplate jdbc;

    // ── level and factor ──────────────────────────────────────────────

    /** The account advances as team actions earn XP, including while the game is running. */
    @Transactional(readOnly = true)
    public long totalXp(UUID userId) {
        return awardRepository.earnedTotalForUser(userId);
    }

    @Transactional(readOnly = true)
    public int levelOf(UUID userId) {
        return XpLevels.levelFor(totalXp(userId));
    }

    // ── cycles ────────────────────────────────────────────────────────

    /**
     * Called when a game goes live. A cycle that was ended and reopened without a
     * reset continues: its saved result stays, already awarded events stay paid,
     * and new events pay until the next end. Only an invalidated or absent cycle
     * opens a new one, with the factor frozen from the creator's finalized XP.
     */
    @Transactional
    public XpCycle openCycle(Game game) {
        XpCycle latest = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElse(null);
        if (latest != null && latest.getInvalidatedAt() == null) {
            if (latest.getFinalizedAt() != null) {
                latest.setFinalizedAt(null);
                cycleRepository.save(latest);
                log.info("[XP] operation=reopenCycle gameId={} cycle={}", game.getId(), latest.getNumber());
            }
            return latest;
        }
        // Live action XP advances the visible level, but only settled XP seeds another
        // game's factor: a field later ruled ineligible cannot amplify future games.
        int level = game.getCreatedBy() != null
                ? XpLevels.levelFor(awardRepository.finalizedTotalForUser(game.getCreatedBy().getId())) : 0;
        XpCycle cycle = cycleRepository.save(XpCycle.builder()
                .game(game)
                .gameName(game.getName())
                .number(latest == null ? 1 : latest.getNumber() + 1)
                .startedAt(Instant.now())
                .factor(XpLevels.factorForLevel(level))
                .featuredMultiplier(game.getXpFeaturedMultiplier() != null ? game.getXpFeaturedMultiplier() : BigDecimal.ONE)
                .formulaVersion(XpLevels.FORMULA_VERSION)
                .build());
        log.info("[XP] operation=openCycle gameId={} cycle={} creatorLevel={} factor={}", game.getId(), cycle.getNumber(), level, cycle.getFactor());
        return cycle;
    }

    /** Reset with progress erased: every row of the cycle is reversed, exactly once per participation. */
    @Transactional
    public void invalidateCycle(Game game) {
        XpCycle latest = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElse(null);
        if (latest == null || latest.getInvalidatedAt() != null) return;
        reverseCycle(latest);
        latest.setInvalidatedAt(Instant.now());
        cycleRepository.save(latest);
        log.info("[XP] operation=invalidateCycle gameId={} cycle={}", game.getId(), latest.getNumber());
    }

    private void reverseCycle(XpCycle cycle) {
        Instant now = Instant.now();
        for (Object[] row : awardRepository.earnedPerPlayerInCycle(cycle.getId())) {
            UUID playerId = (UUID) row[0];
            long earned = ((Number) row[1]).longValue();
            if (earned == 0) continue;
            Player member = playerRepository.findById(playerId).orElse(null);
            insertAward(cycle, playerId, member != null && member.getTeam() != null ? member.getTeam().getId() : null,
                    member != null && member.getUser() != null ? member.getUser().getId() : null,
                    XpAwardKind.reversal, cycle.getId(), (int) -earned, (int) -earned, cycle.getFactor(), now);
        }
    }

    private Optional<XpCycle> openCycleOf(UUID gameId) {
        return cycleRepository.findFirstByGameIdOrderByNumberDesc(gameId).filter(XpCycle::isOpen);
    }

    // ── event awards ─────────────────────────────────────────────────

    /** One XP to every eligible member when the team's check-in at a base is recorded. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void awardCheckIn(Team team, Base base) {
        awardLiveEvent(team, XpAwardKind.check_in, base.getId(), XpLevels.CHECK_IN_XP);
    }

    /** Five XP to every eligible member the first time a base counts as completed for the team in this cycle. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void awardBaseCompleted(Team team, Base base) {
        awardLiveEvent(team, XpAwardKind.base_completed, base.getId(), XpLevels.BASE_COMPLETED_XP);
    }

    private void awardLiveEvent(Team team, XpAwardKind kind, UUID referenceId, int baseAmount) {
        Game game = team.getGame();
        XpCycle cycle = openCycleOf(game.getId()).orElse(null);
        if (cycle == null) return;
        // What is knowable while live is refused while live; a single-team field is only known at the end.
        if (game.isPracticeGame() || creatorPlays(game)) return;
        awardTeam(cycle, team, eligibleMembers(team), kind, referenceId, baseAmount);
    }

    // ── finalization ──────────────────────────────────────────────────

    /**
     * The one finalizer, called from every ending path under the game's row lock.
     * Idempotent: results and awards are keyed on the cycle, so a retry completes
     * the same result rather than a second one. A game that was live before XP
     * existed gets its cycle opened here so its end is still recorded.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void finalizeCycle(Game game) {
        XpCycle cycle = openCycleOf(game.getId()).orElse(null);
        if (cycle == null) {
            if (cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).isPresent()) return;
            cycle = openCycle(game);
        }
        Instant now = Instant.now();
        List<Team> teams = teamRepository.findByGameId(game.getId());
        Map<UUID, List<Player>> rosters = new HashMap<>();
        for (Team team : teams) rosters.put(team.getId(), new ArrayList<>());
        for (Player p : playerRepository.findByTeamGameId(game.getId())) {
            if (!isRetired(p) && rosters.containsKey(p.getTeam().getId())) rosters.get(p.getTeam().getId()).add(p);
        }
        List<Team> field = teams.stream().filter(t -> !rosters.get(t.getId()).isEmpty()).toList();
        String reason = ineligibilityReason(game, field, rosters);
        Map<UUID, Long> points = monitoringService.computeLeaderboardForXp(game.getId()).stream()
                .collect(Collectors.toMap(LeaderboardEntry::teamId, LeaderboardEntry::points));
        int totalPlayers = field.stream().mapToInt(t -> rosters.get(t.getId()).size()).sum();
        Map<UUID, Boolean> completedByTeam = completionByTeam(game, teams);

        // Placement: ties share the better placement; "beaten" counts people in teams strictly below.
        List<Team> ranked = field.stream()
                .sorted(Comparator.comparingLong((Team t) -> points.getOrDefault(t.getId(), 0L)).reversed())
                .toList();
        Map<UUID, Integer> placement = new HashMap<>();
        Map<UUID, Boolean> tied = new HashMap<>();
        for (int i = 0; i < ranked.size(); i++) {
            UUID teamId = ranked.get(i).getId();
            long pts = points.getOrDefault(teamId, 0L);
            int place = i + 1;
            for (int j = 0; j < i; j++) {
                UUID earlier = ranked.get(j).getId();
                if (points.getOrDefault(earlier, 0L) == pts) { place = placement.get(earlier); break; }
            }
            placement.put(teamId, place);
            tied.put(teamId, ranked.stream().filter(o -> points.getOrDefault(o.getId(), 0L) == pts).count() > 1);
        }

        for (Team team : teams) {
            List<Player> roster = rosters.get(team.getId());
            boolean inField = !roster.isEmpty();
            long pts = points.getOrDefault(team.getId(), 0L);
            int beaten = inField ? field.stream()
                    .filter(o -> !o.getId().equals(team.getId()) && points.getOrDefault(o.getId(), 0L) < pts)
                    .mapToInt(o -> rosters.get(o.getId()).size()).sum() : 0;
            boolean completed = inField && completedByTeam.getOrDefault(team.getId(), false);
            boolean eligible = reason == null && inField;
            int placementBase = eligible ? XpLevels.placementBase(field.size(), placement.get(team.getId()), totalPlayers, roster.size(), beaten) : 0;
            int placementXp = eligible ? XpLevels.apply(placementBase, effectiveFactor(cycle)) : 0;

            if (resultRepository.findByCycleIdAndTeamId(cycle.getId(), team.getId()).isEmpty()) {
                resultRepository.save(XpResult.builder()
                        .cycle(cycle).teamId(team.getId()).teamName(team.getName())
                        .placement(inField ? placement.get(team.getId()) : null)
                        .tied(inField && tied.get(team.getId()))
                        .teams(field.size()).players(totalPlayers).members(roster.size()).beaten(beaten)
                        .points(pts).completed(completed)
                        .eligible(eligible).ineligibleReason(eligible ? null : (reason != null ? reason : "no_roster"))
                        .placementXp(placementXp)
                        .build());
            }
            if (!eligible) continue;
            if (completed) awardTeam(cycle, team, roster, XpAwardKind.game_completed, cycle.getId(), XpLevels.GAME_COMPLETED_XP);
            if (placementBase > 0) awardTeam(cycle, team, roster, XpAwardKind.placement, cycle.getId(), placementBase);
        }
        // A field that turned out ineligible (e.g. one team) pays nothing at all: undo its live rows.
        if (reason != null) reverseCycle(cycle);
        cycle.setFinalizedAt(now);
        cycleRepository.save(cycle);
        log.info("[XP] operation=finalize gameId={} cycle={} teams={} eligible={}", game.getId(), cycle.getNumber(), field.size(), reason == null);
    }

    // ── read models ───────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public XpProfileResponse profile(UUID userId) {
        List<XpAward> awards = awardRepository.earnedForUser(userId);
        long total = awards.stream().mapToLong(XpAward::getAmount).sum();
        int level = XpLevels.levelFor(total);
        int basesCompleted = (int) awards.stream().filter(a -> a.getKind() == XpAwardKind.base_completed).count();
        // One placement per (cycle, team) the account earned in; team ids survive until a team is deleted.
        Map<UUID, XpAward> perCycle = new LinkedHashMap<>();
        for (XpAward a : awards) perCycle.putIfAbsent(a.getCycle().getId(), a);
        List<XpProfileResponse.Placement> placements = new ArrayList<>();
        int gamesCompleted = 0;
        for (XpAward sample : perCycle.values()) {
            XpCycle cycle = sample.getCycle();
            // Live actions advance XP and activity counts; results are still published
            // only at the end, never inferred from a running game's leaderboard.
            if (!cycle.isFinalized()) continue;
            XpResult r = sample.getTeamId() != null ? resultRepository.findByCycleIdAndTeamId(cycle.getId(), sample.getTeamId()).orElse(null) : null;
            long earned = awards.stream().filter(a -> a.getCycle().getId().equals(cycle.getId())).mapToLong(XpAward::getAmount).sum();
            boolean completed = r != null && r.isCompleted() && r.isEligible();
            if (completed) gamesCompleted++;
            placements.add(new XpProfileResponse.Placement(
                    cycle.getGame() != null ? cycle.getGame().getId() : null, cycle.getGameName(), cycle.getFinalizedAt(),
                    r != null ? r.getTeamName() : null, r != null ? r.getPlacement() : null, r != null && r.isTied(),
                    r != null ? r.getTeams() : 0, completed, r != null && r.isEligible(), r != null ? r.getIneligibleReason() : null, earned));
        }
        placements.sort(Comparator.comparing(XpProfileResponse.Placement::endedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return new XpProfileResponse(level, total, XpLevels.xpForLevel(level), XpLevels.xpForLevel(level + 1),
                perCycle.size(), gamesCompleted, basesCompleted, placements);
    }

    @Transactional(readOnly = true)
    public XpRewardResponse reward(Player player, UUID gameId) {
        XpCycle cycle = cycleRepository.findFirstByGameIdOrderByNumberDesc(gameId).orElse(null);
        XpRewardResponse.Level level = null;
        if (player.getUser() != null) {
            long total = totalXp(player.getUser().getId());
            int l = XpLevels.levelFor(total);
            level = new XpRewardResponse.Level(l, total, XpLevels.xpForLevel(l), XpLevels.xpForLevel(l + 1));
        }
        if (cycle == null) return new XpRewardResponse("pending", null, 0, List.of(), null, level);
        String state = cycle.getInvalidatedAt() != null ? "invalidated" : cycle.getFinalizedAt() != null ? "finalized" : "pending";
        if ("invalidated".equals(state)) {
            // A reset erases this cycle's progress and its displayed rewards.
            return new XpRewardResponse(state, cycle.getFinalizedAt(), 0, List.of(), null, level);
        }
        List<XpAward> awards = awardRepository.findByCycleIdAndPlayerId(cycle.getId(), player.getId());
        Map<XpAwardKind, int[]> grouped = new EnumMap<>(XpAwardKind.class);
        for (XpAward a : awards) {
            int[] acc = grouped.computeIfAbsent(a.getKind(), k -> new int[2]);
            acc[0] += a.getAmount(); acc[1]++;
        }
        List<XpRewardResponse.Award> summary = grouped.entrySet().stream()
                .map(e -> new XpRewardResponse.Award(e.getKey().name(), e.getValue()[0], e.getValue()[1])).toList();
        // Reopening keeps the old result in storage, but must not publish it as a
        // live placement. Only earned awards and the account's current level are live.
        XpResult r = "finalized".equals(state)
                ? resultRepository.findByCycleIdAndTeamId(cycle.getId(), player.getTeam().getId()).orElse(null) : null;
        XpRewardResponse.Placement placement = r == null ? null
                : new XpRewardResponse.Placement(r.getPlacement(), r.isTied(), r.getTeams(), r.isCompleted(), r.isEligible(), r.getIneligibleReason());
        long xp = awards.stream().mapToLong(XpAward::getAmount).sum();
        return new XpRewardResponse(state, cycle.getFinalizedAt(), xp, summary, placement, level);
    }

    // ── account linking ───────────────────────────────────────────────

    /** A claim attaches the participation's history to the account; an unlink detaches it. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void reassignPlayer(UUID playerId, UUID userId) {
        awardRepository.reassignPlayer(playerId, userId);
    }

    // ── helpers ───────────────────────────────────────────────────────

    private void awardTeam(XpCycle cycle, Team team, List<Player> roster, XpAwardKind kind, UUID referenceId, int baseAmount) {
        BigDecimal factor = effectiveFactor(cycle);
        int amount = XpLevels.apply(baseAmount, factor);
        Instant now = Instant.now();
        for (Player member : roster) {
            insertAward(cycle, member.getId(), team.getId(), member.getUser() != null ? member.getUser().getId() : null,
                    kind, referenceId, baseAmount, amount, factor, now);
        }
    }

    /** Plain SQL with ON CONFLICT DO NOTHING: no flush of the caller's entities, no exception to catch. */
    private void insertAward(XpCycle cycle, UUID playerId, UUID teamId, UUID userId, XpAwardKind kind, UUID referenceId,
                             int baseAmount, int amount, BigDecimal factor, Instant now) {
        jdbc.update(INSERT_AWARD, cycle.getId(), cycle.getGame() != null ? cycle.getGame().getId() : null, teamId, playerId, userId,
                kind.name(), referenceId, baseAmount, factor, amount, cycle.getFormulaVersion(), Timestamp.from(now));
    }

    private BigDecimal effectiveFactor(XpCycle cycle) {
        return cycle.getFactor().multiply(cycle.getFeaturedMultiplier());
    }

    static boolean isRetired(Player p) {
        return p.getDeviceId() != null && p.getDeviceId().startsWith(PlayerAccountService.RETIRED_DEVICE_PREFIX);
    }

    /** Non-retired rows on the team. Retired guest rows earn nothing and are counted nowhere. */
    List<Player> eligibleMembers(Team team) {
        return playerRepository.findByTeamId(team.getId()).stream().filter(p -> !isRetired(p)).toList();
    }

    private boolean creatorPlays(Game game) {
        return game.getCreatedBy() != null && playerRepository.findByUserIdAndGameId(game.getCreatedBy().getId(), game.getId()).isPresent();
    }

    private String ineligibilityReason(Game game, List<Team> field, Map<UUID, List<Player>> rosters) {
        if (game.isPracticeGame()) return REASON_PRACTICE;
        if (field.size() < 2) return REASON_SINGLE_TEAM;
        UUID creatorId = game.getCreatedBy() != null ? game.getCreatedBy().getId() : null;
        boolean creatorPlays = creatorId != null && rosters.values().stream().flatMap(List::stream)
                .anyMatch(p -> p.getUser() != null && p.getUser().getId().equals(creatorId));
        return creatorPlays ? REASON_CREATOR_PLAYS : null;
    }

    /**
     * A team completed the game when every base that resolves to a challenge for it
     * has an approved or correct submission for that very challenge. Read once for
     * the whole game, not per team.
     */
    private Map<UUID, Boolean> completionByTeam(Game game, List<Team> teams) {
        List<Base> bases = baseRepository.findByGameId(game.getId());
        List<Assignment> assignments = assignmentRepository.findByGameId(game.getId());
        Map<UUID, Set<String>> completedPairs = new HashMap<>();
        for (Submission s : submissionRepository.findByGameIdForXp(game.getId())) {
            if (s.getStatus() != SubmissionStatus.approved && s.getStatus() != SubmissionStatus.correct) continue;
            completedPairs.computeIfAbsent(s.getTeam().getId(), k -> new HashSet<>()).add(s.getBase().getId() + ":" + s.getChallenge().getId());
        }
        Map<UUID, Boolean> out = new HashMap<>();
        for (Team team : teams) {
            List<Assignment> forTeam = assignments.stream()
                    .filter(a -> a.getTeam() == null || a.getTeam().getId().equals(team.getId()))
                    .sorted(AssignmentResolver.RECENCY_COMPARATOR).toList();
            Set<String> done = completedPairs.getOrDefault(team.getId(), Set.of());
            boolean any = false, all = true;
            for (Base base : bases) {
                Challenge challenge = AssignmentResolver.resolve(base, team.getId(), forTeam);
                if (challenge == null) continue;
                any = true;
                if (!done.contains(base.getId() + ":" + challenge.getId())) { all = false; break; }
            }
            out.put(team.getId(), any && all);
        }
        return out;
    }
}
