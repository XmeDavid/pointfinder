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
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.mapper.GameResponseMapper;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
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
    public static final Set<String> SEEDED_SCENARIOS = Set.of("fixed-route", "exploration");

    /** Where seeded bases go when the client sends no centre. */
    static final double FALLBACK_LAT = 38.7223;
    static final double FALLBACK_LNG = -9.1393;

    /** Roughly 170 m steps, so the seeded bases read as a short walk apart. */
    private static final double[][] OFFSETS = {{0.0, 0.0}, {0.0015, 0.002}, {-0.0012, 0.0021}};

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
        game = gameRepository.save(game);

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
        if (game.getStatus() != GameStatus.ended) {
            quotaService.enforceActiveGameLimit(game.getCreatedBy());
        }
        game.setTutorialScenario(null);
        game.setTutorialExpiresAt(null);
        return GameResponseMapper.toResponse(gameRepository.save(game));
    }

    // ── Seeding ───────────────────────────────────────────────────────────

    private void seed(UUID gameId, String scenarioId, Double lat, Double lng) {
        double centreLat = lat != null && lng != null ? lat : FALLBACK_LAT;
        double centreLng = lat != null && lng != null ? lng : FALLBACK_LNG;

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
}
