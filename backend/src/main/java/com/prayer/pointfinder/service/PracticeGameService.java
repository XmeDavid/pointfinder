package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateAssignmentRequest;
import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.CreateChallengeRequest;
import com.prayer.pointfinder.dto.request.CreateTeamRequest;
import com.prayer.pointfinder.dto.request.PracticeGameRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.mapper.GameResponseMapper;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Practice games for the {@code practice-game} scenarios: created and seeded
 * by the server so a tutorial never touches a game the operator made for a
 * real event. See the rules on {@link Game#getTutorialScenario()}.
 */
@Service
@RequiredArgsConstructor
public class PracticeGameService {

    /** Scenarios whose practice game the server creates and seeds. */
    public static final Set<String> SEEDED_SCENARIOS = Set.of(
            "fixed-route", "exploration", "unlock-chain", "different-path", "variable-outcome");

    /** Where seeded bases go when the client sends no centre. */
    static final double FALLBACK_LAT = 38.7223;
    static final double FALLBACK_LNG = -9.1393;

    /** Roughly 170 m steps, so the seeded bases read as a short walk apart. */
    private static final double[][] OFFSETS = {{0.0, 0.0}, {0.0015, 0.002}, {-0.0012, 0.0021}, {0.0028, 0.0035}, {0.0006, 0.0048}, {0.0038, 0.0012}};

    private final GameRepository gameRepository;
    private final UserRepository userRepository;
    private final UserTutorialProgressRepository progressRepository;
    private final GameAccessService gameAccessService;
    private final QuotaService quotaService;
    private final BaseService baseService;
    private final ChallengeService challengeService;
    private final TeamService teamService;
    private final AssignmentService assignmentService;

    @Transactional(timeout = 15)
    public GameResponse createForCurrentUser(String scenarioId, PracticeGameRequest request) {
        if (scenarioId == null || !TutorialProgressService.KNOWN_SCENARIOS.contains(scenarioId)) {
            throw new BadRequestException(
                    "Unknown tutorial scenario: " + scenarioId,
                    ErrorCode.TUTORIAL_SCENARIO_UNKNOWN,
                    Map.of("scenarioId", String.valueOf(scenarioId)));
        }
        if (!SEEDED_SCENARIOS.contains(scenarioId)) {
            throw new BadRequestException(
                    "The " + scenarioId + " tutorial creates its game through the create dialog",
                    ErrorCode.TUTORIAL_PRACTICE_GAME_NOT_ALLOWED,
                    Map.of("scenarioId", scenarioId));
        }

        UUID userId = SecurityUtils.getCurrentUser().getId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        PracticeGames.ensureNoActivePracticeGame(gameRepository, userId);

        Game game = Game.builder()
                .name(request.getName())
                .description("")
                .status(GameStatus.setup)
                .createdBy(user)
                // QR needs no tag, so a kept practice game is closer to ready.
                .defaultCheckInMethod(CheckInMethod.QR)
                .tutorialScenario(scenarioId)
                .tutorialExpiresAt(PracticeGames.expiry())
                .build();
        game.getOperators().add(user);
        try {
            game = gameRepository.saveAndFlush(game);
        } catch (DataIntegrityViolationException e) {
            // The partial unique index (V63) is the last word against two
            // concurrent creations that both passed the existence check.
            throw new ConflictException(
                    "You already have a practice game; delete or keep it first",
                    ErrorCode.TUTORIAL_PRACTICE_GAME_EXISTS);
        }

        seed(game.getId(), scenarioId, request.getLat(), request.getLng());
        PracticeGames.bindProgressRow(progressRepository, userId, scenarioId, game.getId());

        return GameResponseMapper.toResponse(gameRepository.findById(game.getId()).orElse(game));
    }

    /** Clears the practice marker under the normal active-game quota. */
    @Transactional(timeout = 10)
    public GameResponse keepForCurrentUser(UUID gameId) {
        Game game = gameAccessService.getAccessibleGame(gameId);
        if (!game.isPracticeGame()) {
            throw new BadRequestException("This is not a practice game", ErrorCode.TUTORIAL_NOT_PRACTICE_GAME);
        }
        // Always under the quota, ended or not: an ended game can be brought
        // back to setup, so a free keep would be a free extra game.
        quotaService.enforceActiveGameLimit(game.getCreatedBy());
        game.setTutorialScenario(null);
        game.setTutorialExpiresAt(null);
        return GameResponseMapper.toResponse(gameRepository.save(game));
    }

    // ── Seeding ───────────────────────────────────────────────────────────

    private void seed(UUID gameId, String scenarioId, Double lat, Double lng) {
        double centreLat = lat != null && lng != null ? lat : FALLBACK_LAT;
        double centreLng = lat != null && lng != null ? lng : FALLBACK_LNG;
        switch (scenarioId) {
            case "unlock-chain" -> { seedUnlockChain(gameId, centreLat, centreLng); return; }
            case "different-path" -> { seedDifferentPath(gameId, centreLat, centreLng); return; }
            case "variable-outcome" -> { seedVariableOutcome(gameId, centreLat, centreLng); return; }
            default -> { }
        }

        List<String> baseNames = List.of("Old mill", "Chapel steps", "Lookout");
        List<UUID> baseIds = new ArrayList<>();
        for (int i = 0; i < baseNames.size(); i++) {
            CreateBaseRequest base = new CreateBaseRequest();
            base.setName(baseNames.get(i));
            base.setLat(centreLat + OFFSETS[i][0]);
            base.setLng(centreLng + OFFSETS[i][1]);
            base.setCheckInMethod(CheckInMethod.QR.name());
            BaseResponse created = baseService.createBase(gameId, base);
            baseIds.add(created.id());
        }

        List<String[]> challengeSpecs = "fixed-route".equals(scenarioId)
                ? List.of(
                        new String[]{"Count the arches", "<p>How many arches does the old mill have?</p>"},
                        new String[]{"Photograph the bell", "<p>Take a photo of the chapel bell with your whole team in it.</p>"},
                        new String[]{"Name the peak", "<p>From the lookout, which peak is furthest away?</p>"})
                : List.of(
                        new String[]{"Count the arches", "<p>How many arches does the old mill have?</p>"},
                        new String[]{"Photograph the bell", "<p>Take a photo of the chapel bell with your whole team in it.</p>"});
        List<UUID> challengeIds = new ArrayList<>();
        for (String[] spec : challengeSpecs) {
            CreateChallengeRequest challenge = new CreateChallengeRequest();
            challenge.setTitle(spec[0]);
            challenge.setContent(spec[1]);
            challenge.setAnswerType("text");
            challenge.setPoints(10);
            ChallengeResponse created = challengeService.createChallenge(gameId, challenge);
            challengeIds.add(created.id());
        }

        List<CreateAssignmentRequest> assignments = new ArrayList<>();
        for (int i = 0; i < Math.min(baseIds.size(), challengeIds.size()); i++) {
            CreateAssignmentRequest assignment = new CreateAssignmentRequest();
            assignment.setBaseId(baseIds.get(i));
            assignment.setChallengeId(challengeIds.get(i));
            assignments.add(assignment);
        }
        assignmentService.bulkSetAssignments(gameId, assignments);

        CreateTeamRequest team = new CreateTeamRequest();
        team.setName("Scouts");
        teamService.createTeam(gameId, team);
    }

    private UUID base(UUID gameId, String name, double lat, double lng, boolean hidden) {
        CreateBaseRequest base = new CreateBaseRequest();
        base.setName(name);
        base.setLat(lat);
        base.setLng(lng);
        base.setHidden(hidden);
        base.setCheckInMethod(CheckInMethod.QR.name());
        return baseService.createBase(gameId, base).id();
    }

    private UUID challenge(UUID gameId, String title, String content, String completion) {
        return challenge(gameId, title, content, completion, null, List.of());
    }

    /**
     * A challenge, optionally pinned to a base and location bound (both are
     * what unlock targets require) with the hidden bases it reveals.
     */
    private UUID challenge(UUID gameId, String title, String content, String completion, UUID pinnedBaseId, List<UUID> unlocks) {
        CreateChallengeRequest challenge = new CreateChallengeRequest();
        challenge.setTitle(title);
        challenge.setContent(content);
        challenge.setCompletionContent(completion != null ? completion : "");
        challenge.setAnswerType("text");
        challenge.setPoints(10);
        if (pinnedBaseId != null) {
            challenge.setFixedBaseId(pinnedBaseId);
            challenge.setLocationBound(true);
            challenge.setUnlocksBaseIds(unlocks);
        }
        return challengeService.createChallenge(gameId, challenge).id();
    }

    private void assign(UUID gameId, List<UUID[]> pairs, List<UUID[]> perTeam) {
        List<CreateAssignmentRequest> rows = new ArrayList<>();
        for (UUID[] pair : pairs) {
            CreateAssignmentRequest row = new CreateAssignmentRequest();
            row.setBaseId(pair[0]);
            row.setChallengeId(pair[1]);
            rows.add(row);
        }
        for (UUID[] triple : perTeam) {
            CreateAssignmentRequest row = new CreateAssignmentRequest();
            row.setBaseId(triple[0]);
            row.setChallengeId(triple[1]);
            row.setTeamId(triple[2]);
            rows.add(row);
        }
        assignmentService.bulkSetAssignments(gameId, rows);
    }

    private UUID team(UUID gameId, String name) {
        CreateTeamRequest team = new CreateTeamRequest();
        team.setName(name);
        return teamService.createTeam(gameId, team).id();
    }

    /**
     * Unlock chain: one visible trailhead; completing its challenge reveals the
     * bridge; the bridge reveals a fork (tower and ford); the tower reveals a
     * bonus cache back down the trail, the ford reveals the summit. The first
     * link (trailhead → bridge) is left for the tutorial to set.
     */
    private void seedUnlockChain(UUID gameId, double lat, double lng) {
        UUID trailhead = base(gameId, "Trailhead", lat + OFFSETS[0][0], lng + OFFSETS[0][1], false);
        UUID bridge = base(gameId, "Old bridge", lat + OFFSETS[1][0], lng + OFFSETS[1][1], true);
        UUID tower = base(gameId, "Ruined tower", lat + OFFSETS[2][0], lng + OFFSETS[2][1], true);
        UUID ford = base(gameId, "River ford", lat + OFFSETS[3][0], lng + OFFSETS[3][1], true);
        UUID cache = base(gameId, "Bonus cache", lat - OFFSETS[1][0], lng + OFFSETS[1][1] / 2, true);
        UUID summit = base(gameId, "Summit", lat + OFFSETS[4][0], lng + OFFSETS[4][1], true);

        challenge(gameId, "Read the trail sign", "<p>The sign at the trailhead lists a distance. Write it down in metres.</p>", "<p>Well read. Something has just appeared on your map — head there.</p>", trailhead, List.of());
        challenge(gameId, "Count the bridge arches", "<p>How many arches carry the old bridge?</p>", "<p>Two paths open from here. Choose as a team.</p>", bridge, List.of(tower, ford));
        challenge(gameId, "Sketch the tower", "<p>Draw the tower's outline and photograph the drawing with the tower behind it.</p>", "<p>A cache is marked back down the trail — worth the detour?</p>", tower, List.of(cache));
        challenge(gameId, "Cross the ford", "<p>Photograph your whole team on the far bank.</p>", "<p>The summit is now on your map.</p>", ford, List.of(summit));
        challenge(gameId, "Open the cache", "<p>The cache holds a word. What is it?</p>", "<p>Bonus banked.</p>", cache, List.of());
        challenge(gameId, "Summit photo", "<p>A photo of the team at the summit marker.</p>", "<p>Route complete.</p>", summit, List.of());
        team(gameId, "Scouts");
    }

    /**
     * A different path: three bases in a triangle, three challenges, two teams.
     * Nothing assigned yet: the tutorial builds the two routes in the grid.
     */
    private void seedDifferentPath(UUID gameId, double lat, double lng) {
        base(gameId, "Base A · Old mill", lat + OFFSETS[0][0], lng + OFFSETS[0][1], false);
        base(gameId, "Base B · Chapel steps", lat + OFFSETS[1][0], lng + OFFSETS[1][1], false);
        base(gameId, "Base C · Lookout", lat + OFFSETS[2][0], lng + OFFSETS[2][1], false);
        challenge(gameId, "1 · Count the arches", "<p>How many arches does the old mill have?</p>", null);
        challenge(gameId, "2 · Photograph the bell", "<p>Take a photo of the chapel bell with your whole team in it.</p>", null);
        challenge(gameId, "3 · Name the peak", "<p>From the lookout, which peak is furthest away?</p>", null);
        team(gameId, "Falcons");
        team(gameId, "Lions");
    }

    /**
     * A variable outcome: a complete game whose first challenge is pinned to
     * its base, ready for a completion text that sends each team somewhere else.
     */
    private void seedVariableOutcome(UUID gameId, double lat, double lng) {
        UUID mill = base(gameId, "Old mill", lat + OFFSETS[0][0], lng + OFFSETS[0][1], false);
        UUID chapel = base(gameId, "Chapel steps", lat + OFFSETS[1][0], lng + OFFSETS[1][1], false);
        UUID lookout = base(gameId, "Lookout", lat + OFFSETS[2][0], lng + OFFSETS[2][1], false);
        challenge(gameId, "Count the arches", "<p>How many arches does the old mill have?</p>", "<p>Good work. Your next stop is written on the sheet you were given.</p>", mill, List.of());
        UUID c2 = challenge(gameId, "Photograph the bell", "<p>Take a photo of the chapel bell with your whole team in it.</p>", "<p>One to go.</p>");
        UUID c3 = challenge(gameId, "Name the peak", "<p>From the lookout, which peak is furthest away?</p>", "<p>Route complete.</p>");
        assign(gameId, List.of(new UUID[]{chapel, c2}, new UUID[]{lookout, c3}), List.of());
        team(gameId, "Falcons");
        team(gameId, "Lions");
    }
}
