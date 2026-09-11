package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.XpAwardRepository;
import com.prayer.pointfinder.repository.XpCycleRepository;
import com.prayer.pointfinder.repository.XpResultRepository;
import com.prayer.pointfinder.service.GameSchedulerService;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import com.prayer.pointfinder.xp.XpService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PF-03 end to end against Postgres: a cycle opens at go-live, check-ins and
 * completions award every member, ending finalizes placement once through
 * every path, ended is frozen, and a reset reverses exactly once.
 */
class XpLedgerIntegrationTest extends IntegrationTestBase {

    @Autowired private XpService xpService;
    @Autowired private XpCycleRepository cycleRepository;
    @Autowired private XpAwardRepository awardRepository;
    @Autowired private XpResultRepository resultRepository;
    @Autowired private GameSchedulerService scheduler;
    @Autowired private PlayerJoinRateLimiter rateLimiter;
    @Autowired private TransactionTemplate tx;

    private User operator;
    private Game game;
    private Team falcons;
    private Team owls;
    private Base mill;
    private Challenge riddle;

    @BeforeEach
    void setUpGame() {
        rateLimiter.clear();
        operator = createOperator("xp-op-" + UUID.randomUUID() + "@test.com", "Password1");
        game = createGame(operator, "XP Camp " + UUID.randomUUID(), GameStatus.live);
        falcons = createTeam(game, "Falcons", "FALC" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        owls = createTeam(game, "Owls", "OWLS" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        mill = createBase(game, "Mill");
        mill.setNfcToken("mill-nfc");
        baseRepository.save(mill);
        riddle = createChallenge(game, "Riddle", AnswerType.text, 10);
        riddle.setAutoValidate(true);
        riddle.setCorrectAnswer(List.of("seven"));
        challengeRepository.save(riddle);
        assignmentRepository.save(Assignment.builder().game(game).base(mill).challenge(riddle).team(null).build());
        tx.executeWithoutResult(s -> xpService.openCycle(gameRepository.findById(game.getId()).orElseThrow()));
    }

    private PlayerAuthResponse join(Team team, String name, String deviceId) {
        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode(team.getJoinCode()); join.setDisplayName(name); join.setDeviceId(deviceId);
        ResponseEntity<PlayerAuthResponse> resp = restTemplate.postForEntity("/api/auth/player/join", join, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        return resp.getBody();
    }

    private HttpHeaders bearer(String token) {
        HttpHeaders h = new HttpHeaders(); h.set("Authorization", "Bearer " + token); h.setContentType(MediaType.APPLICATION_JSON); return h;
    }

    private HttpHeaders asOperator() {
        HttpHeaders h = new HttpHeaders(); h.set("Authorization", operatorAuthHeader(operator)); h.setContentType(MediaType.APPLICATION_JSON); return h;
    }

    private void checkIn(PlayerAuthResponse player) {
        CheckInRequest body = new CheckInRequest(); body.setNfcToken("mill-nfc");
        ResponseEntity<String> r = restTemplate.exchange("/api/player/games/" + game.getId() + "/bases/" + mill.getId() + "/check-in", HttpMethod.POST, new HttpEntity<>(body, bearer(player.token())), String.class);
        assertTrue(r.getStatusCode().is2xxSuccessful(), r.getBody());
    }

    private void answer(PlayerAuthResponse player, String text) {
        PlayerSubmissionRequest body = new PlayerSubmissionRequest();
        body.setBaseId(mill.getId()); body.setChallengeId(riddle.getId()); body.setAnswer(text); body.setIdempotencyKey(UUID.randomUUID());
        ResponseEntity<String> r = restTemplate.exchange("/api/player/games/" + game.getId() + "/submissions", HttpMethod.POST, new HttpEntity<>(body, bearer(player.token())), String.class);
        assertTrue(r.getStatusCode().is2xxSuccessful(), r.getBody());
    }

    private ResponseEntity<String> setStatus(String status, boolean reset) {
        return restTemplate.exchange("/api/games/" + game.getId() + "/status", HttpMethod.PATCH,
                new HttpEntity<>(Map.of("status", status, "resetProgress", reset), asOperator()), String.class);
    }

    private HttpHeaders linkAccount(PlayerAuthResponse player) {
        String email = "xp-player-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<Map> linked = restTemplate.exchange("/api/player/account/link", HttpMethod.POST,
                new HttpEntity<>(Map.of("email", email, "password", "Secret123", "name", "Ana", "createAccount", true), bearer(player.token())), Map.class);
        assertEquals(HttpStatus.OK, linked.getStatusCode());
        ResponseEntity<Map> login = restTemplate.postForEntity("/api/auth/login", Map.of("email", email, "password", "Secret123"), Map.class);
        assertEquals(HttpStatus.OK, login.getStatusCode());
        return bearer((String) login.getBody().get("accessToken"));
    }

    private Map<String, Object> profile(HttpHeaders account) {
        ResponseEntity<Map> response = restTemplate.exchange("/api/account/profile", HttpMethod.GET, new HttpEntity<>(account), Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        return response.getBody();
    }

    private Map<String, Object> reward(PlayerAuthResponse player) {
        ResponseEntity<Map> response = restTemplate.exchange("/api/player/games/" + game.getId() + "/reward", HttpMethod.GET,
                new HttpEntity<>(bearer(player.token())), Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        return response.getBody();
    }

    @Test
    void teamActionsAdvanceAccountXpAndLevelBeforeTheGameEnds() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        PlayerAuthResponse ben = join(falcons, "Ben", "device-b");
        join(owls, "Cai", "device-c");
        HttpHeaders account = linkAccount(ana);
        UUID userId = tx.execute(s -> playerRepository.findById(ana.player().id()).orElseThrow().getUser().getId());

        // A previous game left the account one XP short of level 1.
        XpCycle previous = cycleRepository.save(XpCycle.builder().gameName("Earlier trail").number(1)
                .startedAt(Instant.now().minusSeconds(7200)).finalizedAt(Instant.now().minusSeconds(3600))
                .factor(BigDecimal.ONE).build());
        awardRepository.save(XpAward.builder().cycle(previous).userId(userId).kind(XpAwardKind.placement)
                .referenceId(previous.getId()).baseAmount(199).factor(BigDecimal.ONE).amount(199)
                .awardedAt(Instant.now().minusSeconds(3600)).build());
        assertEquals(0, ((Number) profile(account).get("level")).intValue());

        // Ben's action belongs to Ana too, and crosses her level threshold immediately.
        checkIn(ben);
        Map<String, Object> liveProfile = profile(account);
        assertEquals(200, ((Number) liveProfile.get("xp")).intValue());
        assertEquals(1, ((Number) liveProfile.get("level")).intValue());
        assertEquals(2, ((Number) liveProfile.get("gamesPlayed")).intValue());
        assertEquals(0, ((Number) liveProfile.get("gamesCompleted")).intValue());
        assertEquals(1, ((List<?>) liveProfile.get("placements")).size(), "the running game has no placement");
        Map<String, Object> liveReward = reward(ana);
        assertEquals("pending", liveReward.get("state"));
        assertEquals(1, ((Number) liveReward.get("xp")).intValue());
        assertNull(liveReward.get("placement"));
        assertNull(liveReward.get("finalizedAt"));
        assertEquals(1, ((Number) ((Map<?, ?>) liveReward.get("level")).get("level")).intValue());
        assertEquals("check_in", ((Map<?, ?>) ((List<?>) liveReward.get("awards")).get(0)).get("kind"));
        assertEquals(1, ((Number) reward(ben).get("xp")).intValue(), "guests also see their earned action XP");
        assertNull(reward(ben).get("level"));

        // Unsettled XP may advance the player level, but cannot seed a larger organizer factor.
        Game nextGame = createGame(userRepository.findById(userId).orElseThrow(), "Next trail", GameStatus.setup);
        XpCycle nextCycle = tx.execute(s -> xpService.openCycle(gameRepository.findById(nextGame.getId()).orElseThrow()));
        assertEquals("0.2000", nextCycle.getFactor().toPlainString());

        answer(ben, "seven");
        answer(ana, "seven");
        assertEquals(201, ((Number) profile(account).get("xp")).intValue(), "repeated correct answers do not pay twice");
        assertEquals(1, ((Number) profile(account).get("basesCompleted")).intValue());
        assertEquals(2, ((Number) reward(ana).get("xp")).intValue());
    }

    @Test
    void checkInsCompletionsAndTheEndAwardEveryMemberOnce() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        PlayerAuthResponse ben = join(falcons, "Ben", "device-b");
        PlayerAuthResponse cai = join(owls, "Cai", "device-c");
        XpCycle cycle = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElseThrow();
        assertEquals(1, cycle.getNumber());
        assertEquals("0.2000", cycle.getFactor().toPlainString(), "a level-0 creator");

        // Ana checks in and answers correctly: the whole Falcons roster is paid, Ben included, once.
        checkIn(ana);
        answer(ana, "seven");
        answer(ben, "seven"); // a second correct answer for the same base pays nothing more
        assertEquals(2, awardRepository.totalForPlayer(ana.player().id()), "1 check-in (rounded up from 0.2) + 1 base (5 × 0.2)");
        assertEquals(2, awardRepository.totalForPlayer(ben.player().id()));
        assertEquals(0, awardRepository.totalForPlayer(cai.player().id()));

        // The end summary tells the operator nothing is pending, then the end finalizes.
        ResponseEntity<Map> summary = restTemplate.exchange("/api/games/" + game.getId() + "/end-summary", HttpMethod.GET, new HttpEntity<>(asOperator()), Map.class);
        assertEquals(0, ((Number) summary.getBody().get("pendingReviews")).intValue());
        assertEquals(3, ((Number) summary.getBody().get("players")).intValue());
        assertEquals(HttpStatus.OK, setStatus("ended", false).getStatusCode());

        cycle = cycleRepository.findById(cycle.getId()).orElseThrow();
        assertNotNull(cycle.getFinalizedAt());
        XpResult falconsResult = resultRepository.findByCycleIdAndTeamId(cycle.getId(), falcons.getId()).orElseThrow();
        XpResult owlsResult = resultRepository.findByCycleIdAndTeamId(cycle.getId(), owls.getId()).orElseThrow();
        assertEquals(1, falconsResult.getPlacement());
        assertEquals(2, owlsResult.getPlacement());
        assertTrue(falconsResult.isCompleted());
        assertTrue(falconsResult.isEligible());
        // Falcons: 2 teams, first, 3 players, 2 members, beat 1 of 1 others: (200 + 75) × 0.2 = 55.
        assertEquals(55, falconsResult.getPlacementXp());
        assertEquals(0, owlsResult.getPlacementXp());
        // Ana: 1 + 1 + game 10 + placement 55 = 67; Ben identical.
        assertEquals(67, awardRepository.totalForPlayer(ana.player().id()));
        assertEquals(67, awardRepository.totalForPlayer(ben.player().id()));

        // The reward screen for Ana reads finalized, and the profile of a guest is not a thing yet.
        ResponseEntity<Map> reward = restTemplate.exchange("/api/player/games/" + game.getId() + "/reward", HttpMethod.GET, new HttpEntity<>(bearer(ana.token())), Map.class);
        assertEquals("finalized", reward.getBody().get("state"));
        assertEquals(67, ((Number) reward.getBody().get("xp")).intValue());
        assertEquals(1, ((Number) ((Map<?, ?>) reward.getBody().get("placement")).get("placement")).intValue());

        // Ended is frozen: reviewing answers 400 GAME_ENDED, and a second end changes nothing.
        UUID pendingId = submissionRepository.findByTeamId(falcons.getId()).get(0).getId();
        ResponseEntity<Map> review = restTemplate.exchange("/api/games/" + game.getId() + "/submissions/" + pendingId + "/review", HttpMethod.PATCH,
                new HttpEntity<>(Map.of("status", "rejected"), asOperator()), Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, review.getStatusCode());
        assertEquals("GAME_ENDED", review.getBody().get("code"));
        tx.executeWithoutResult(s -> xpService.finalizeCycle(gameRepository.findById(game.getId()).orElseThrow()));
        assertEquals(67, awardRepository.totalForPlayer(ana.player().id()), "finalizing again awards nothing");
    }

    @Test
    void claimingAttachesTheLedgerAndTheProfileReadsIt() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        join(owls, "Cai", "device-c");
        checkIn(ana);
        answer(ana, "seven");
        String email = "ana-" + UUID.randomUUID() + "@example.com";
        ResponseEntity<Map> linked = restTemplate.exchange("/api/player/account/link", HttpMethod.POST,
                new HttpEntity<>(Map.of("email", email, "password", "Secret123", "name", "Ana", "createAccount", true), bearer(ana.token())), Map.class);
        assertEquals(HttpStatus.OK, linked.getStatusCode());
        assertEquals(HttpStatus.OK, setStatus("ended", false).getStatusCode());

        ResponseEntity<Map> login = restTemplate.postForEntity("/api/auth/login", Map.of("email", email, "password", "Secret123"), Map.class);
        ResponseEntity<Map> profile = restTemplate.exchange("/api/account/profile", HttpMethod.GET, new HttpEntity<>(bearer((String) login.getBody().get("accessToken"))), Map.class);
        assertEquals(HttpStatus.OK, profile.getStatusCode());
        Map<String, Object> p = profile.getBody();
        // 1 + 1 + 10 + placement (2 teams, first, 2 players, 1 member, beat 1 of 1: (200 + 100) × 0.2 = 60) = 72
        assertEquals(72, ((Number) p.get("xp")).intValue());
        assertEquals(0, ((Number) p.get("level")).intValue());
        assertEquals(1, ((Number) p.get("gamesCompleted")).intValue());
        assertEquals(1, ((Number) p.get("basesCompleted")).intValue());
        List<Map<String, Object>> placements = (List<Map<String, Object>>) p.get("placements");
        assertEquals(1, placements.size());
        assertEquals(1, ((Number) placements.get(0).get("placement")).intValue());
        assertEquals(72, ((Number) placements.get(0).get("xp")).intValue());
    }

    @Test
    void resetReversesExactlyOnceAndANewCycleStartsClean() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        join(owls, "Cai", "device-c");
        HttpHeaders account = linkAccount(ana);
        checkIn(ana);
        answer(ana, "seven");
        assertEquals(2, awardRepository.totalForPlayer(ana.player().id()));
        assertEquals(2, ((Number) profile(account).get("xp")).intValue());
        assertEquals(HttpStatus.OK, setStatus("ended", false).getStatusCode());
        long afterEnd = awardRepository.totalForPlayer(ana.player().id());
        assertTrue(afterEnd > 2, "completion and placement were awarded at the end");

        assertEquals(HttpStatus.OK, setStatus("setup", true).getStatusCode());
        assertEquals(0, awardRepository.totalForPlayer(ana.player().id()), "everything from the cycle is reversed");
        XpCycle first = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElseThrow();
        assertNotNull(first.getInvalidatedAt());
        long reversals = awardRepository.findByPlayerIdOrderByAwardedAtDesc(ana.player().id()).stream().filter(a -> a.getKind() == XpAwardKind.reversal).count();
        assertEquals(1, reversals);
        // The reward screen now reports the cycle as invalidated.
        ResponseEntity<Map> reward = restTemplate.exchange("/api/player/games/" + game.getId() + "/reward", HttpMethod.GET, new HttpEntity<>(bearer(ana.token())), Map.class);
        assertEquals("invalidated", reward.getBody().get("state"));
        assertEquals(0, ((Number) reward.getBody().get("xp")).intValue());
        assertTrue(((List<?>) reward.getBody().get("awards")).isEmpty());
        assertEquals(0, ((Number) profile(account).get("xp")).intValue());
        assertEquals(0, ((Number) profile(account).get("basesCompleted")).intValue());
        assertTrue(((List<?>) profile(account).get("placements")).isEmpty());

        // Going live again opens cycle 2 with a fresh factor; nothing from cycle 1 leaks in.
        tx.executeWithoutResult(s -> xpService.openCycle(gameRepository.findById(game.getId()).orElseThrow()));
        XpCycle second = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElseThrow();
        assertEquals(2, second.getNumber());
        assertTrue(second.isOpen());
    }

    @Test
    void theSchedulerEndsThroughTheSameFinalizer() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        join(owls, "Cai", "device-c");
        checkIn(ana);
        Game due = gameRepository.findById(game.getId()).orElseThrow();
        due.setEndDate(Instant.now().minusSeconds(60));
        gameRepository.save(due);

        scheduler.autoEndGames();

        assertEquals(GameStatus.ended, gameRepository.findById(game.getId()).orElseThrow().getStatus());
        XpCycle cycle = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElseThrow();
        assertNotNull(cycle.getFinalizedAt());
        assertTrue(resultRepository.findByCycleIdAndTeamId(cycle.getId(), falcons.getId()).isPresent());
    }

    @Test
    void creatorsWhoPlayEarnNothingLiveOrAtTheEnd() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        join(owls, "Cai", "device-c");
        // The creator links Ana's participation to their own account: the game is now ineligible.
        Player row = playerRepository.findById(ana.player().id()).orElseThrow();
        row.setUser(operator);
        playerRepository.save(row);
        checkIn(ana);
        assertEquals(0, awardRepository.totalForPlayer(ana.player().id()), "nothing is paid while live either");
        assertEquals(HttpStatus.OK, setStatus("ended", false).getStatusCode());
        XpCycle cycle = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElseThrow();
        XpResult r = resultRepository.findByCycleIdAndTeamId(cycle.getId(), falcons.getId()).orElseThrow();
        assertFalse(r.isEligible());
        assertEquals("creator_plays", r.getIneligibleReason());
        assertEquals(0, awardRepository.totalForPlayer(ana.player().id()));
    }

    @Test
    void aFieldOfOneTeamPaysNothingEvenForWhatWasEarnedLive() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        HttpHeaders account = linkAccount(ana);
        checkIn(ana);
        answer(ana, "seven");
        assertEquals(2, awardRepository.totalForPlayer(ana.player().id()));
        assertEquals(2, ((Number) profile(account).get("xp")).intValue());
        assertEquals(HttpStatus.OK, setStatus("ended", false).getStatusCode());
        assertEquals(0, awardRepository.totalForPlayer(ana.player().id()), "reversed at the end: a single team is not a field");
        assertEquals(0, ((Number) profile(account).get("xp")).intValue());
        assertEquals(0, ((Number) reward(ana).get("xp")).intValue());
        XpCycle cycle = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElseThrow();
        assertEquals("single_team", resultRepository.findByCycleIdAndTeamId(cycle.getId(), falcons.getId()).orElseThrow().getIneligibleReason());
    }

    @Test
    void operatorRescuesPayLikeThePlayersOwnActions() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        join(owls, "Cai", "device-c");
        // Broken tag: the operator checks the team in, then marks the base completed.
        ResponseEntity<String> rescued = restTemplate.exchange("/api/games/" + game.getId() + "/teams/" + falcons.getId() + "/check-in/" + mill.getId(), HttpMethod.POST,
                new HttpEntity<>(Map.of(), asOperator()), String.class);
        assertTrue(rescued.getStatusCode().is2xxSuccessful(), rescued.getBody());
        ResponseEntity<String> completed = restTemplate.exchange("/api/games/" + game.getId() + "/teams/" + falcons.getId() + "/bases/" + mill.getId() + "/mark-completed", HttpMethod.POST,
                new HttpEntity<>(Map.of("challengeId", riddle.getId().toString(), "reason", "Broken tag"), asOperator()), String.class);
        assertTrue(completed.getStatusCode().is2xxSuccessful(), completed.getBody());
        assertEquals(2, awardRepository.totalForPlayer(ana.player().id()), "check-in and completion paid through the rescue paths");
        // A later genuine tap does not pay twice.
        checkIn(ana);
        assertEquals(2, awardRepository.totalForPlayer(ana.player().id()));
    }

    @Test
    void reopeningWithoutResetKeepsTheResultAndPaysOnlyNewEvents() {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        join(owls, "Cai", "device-c");
        HttpHeaders account = linkAccount(ana);
        checkIn(ana);
        answer(ana, "seven");
        assertEquals(HttpStatus.OK, setStatus("ended", false).getStatusCode());
        long afterFirstEnd = awardRepository.totalForPlayer(ana.player().id());
        assertEquals(HttpStatus.OK, setStatus("setup", false).getStatusCode());
        tx.executeWithoutResult(s -> xpService.openCycle(gameRepository.findById(game.getId()).orElseThrow()));
        XpCycle cycle = cycleRepository.findFirstByGameIdOrderByNumberDesc(game.getId()).orElseThrow();
        assertEquals(1, cycle.getNumber(), "the same cycle continues");
        assertTrue(cycle.isOpen());
        assertEquals(afterFirstEnd, ((Number) profile(account).get("xp")).longValue(), "reopening must not temporarily remove earned XP or levels");
        assertEquals("pending", reward(ana).get("state"));
        assertEquals(afterFirstEnd, ((Number) reward(ana).get("xp")).longValue());
        assertNull(reward(ana).get("placement"), "a saved result is not published as a live placement");
        Game live = gameRepository.findById(game.getId()).orElseThrow(); live.setStatus(GameStatus.live); gameRepository.save(live);
        // A second base appears and is completed: only that is new money.
        Base chapel = createBase(game, "Chapel"); chapel.setNfcToken("chp00001"); baseRepository.save(chapel);
        CheckInRequest body = new CheckInRequest(); body.setNfcToken("chp00001");
        assertTrue(restTemplate.exchange("/api/player/games/" + game.getId() + "/bases/" + chapel.getId() + "/check-in", HttpMethod.POST, new HttpEntity<>(body, bearer(ana.token())), String.class).getStatusCode().is2xxSuccessful());
        assertEquals(HttpStatus.OK, setStatus("ended", false).getStatusCode());
        assertEquals(afterFirstEnd + 1, awardRepository.totalForPlayer(ana.player().id()), "one new check-in; completion and placement are not paid twice");
        assertEquals(1, resultRepository.findByCycleId(cycle.getId()).stream().filter(r -> r.getTeamId().equals(falcons.getId())).count());
    }

    @Test
    void twoTransactionsAwardingTheSameEventProduceOneRow() throws Exception {
        PlayerAuthResponse ana = join(falcons, "Ana", "device-a");
        join(owls, "Cai", "device-c");
        Team team = teamRepository.findById(falcons.getId()).orElseThrow();
        Base base = baseRepository.findById(mill.getId()).orElseThrow();
        java.util.concurrent.CountDownLatch go = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Callable<Void> award = () -> { go.await(); tx.executeWithoutResult(s -> xpService.awardCheckIn(teamRepository.findById(team.getId()).orElseThrow(), base)); return null; };
            java.util.concurrent.Future<Void> a = pool.submit(award), b = pool.submit(award);
            go.countDown();
            a.get(20, java.util.concurrent.TimeUnit.SECONDS); b.get(20, java.util.concurrent.TimeUnit.SECONDS);
        } finally { pool.shutdownNow(); }
        assertEquals(1, awardRepository.findByPlayerIdOrderByAwardedAtDesc(ana.player().id()).size());
    }
}
