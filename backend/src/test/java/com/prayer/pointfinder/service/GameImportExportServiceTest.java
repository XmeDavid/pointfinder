package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.export.*;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GameImportExportServiceTest {

    @Mock
    private GameRepository gameRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private AssignmentRepository assignmentRepository;
    @Mock
    private GameAccessService gameAccessService;

    private GameImportExportService service;

    private User authenticatedUser;

    @BeforeEach
    void setUp() {
        authenticatedUser = User.builder()
                .id(UUID.randomUUID())
                .email("operator@example.com")
                .name("Operator")
                .passwordHash("hash")
                .role(UserRole.operator)
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(authenticatedUser, null)
        );

        service = new GameImportExportService(
                gameRepository,
                userRepository,
                baseRepository,
                challengeRepository,
                teamRepository,
                assignmentRepository,
                gameAccessService
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ── Export tests ─────────────────────────────────────────────────

    @Test
    void exportGame_setsExportVersionAndExportedAt() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "My Game");

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        GameExportDto result = service.exportGame(gameId);

        assertEquals("1.0", result.getExportVersion());
        assertNotNull(result.getExportedAt());
        assertTrue(result.getExportedAt().isBefore(Instant.now().plusSeconds(1)));
    }

    @Test
    void exportGame_includesGameMetadata() {
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder()
                .id(gameId)
                .name("Scout Game")
                .description("A great game")
                .uniformAssignment(true)
                .tileSource("osm-classic")
                .status(GameStatus.setup)
                .createdBy(authenticatedUser)
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        GameExportDto result = service.exportGame(gameId);

        assertEquals("Scout Game", result.getGame().getName());
        assertEquals("A great game", result.getGame().getDescription());
        assertTrue(result.getGame().getUniformAssignment());
        assertEquals("osm-classic", result.getGame().getTileSource());
    }

    @Test
    void exportGame_withEmptyCollections_returnsEmptyLists() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Empty Game");

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        GameExportDto result = service.exportGame(gameId);

        assertTrue(result.getBases().isEmpty());
        assertTrue(result.getChallenges().isEmpty());
        assertTrue(result.getTeams().isEmpty());
        assertTrue(result.getAssignments().isEmpty());
    }

    @Test
    void exportGame_assignsTempIdsSequentially() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Base base1 = buildBase(UUID.randomUUID(), game, "Base A", null);
        Base base2 = buildBase(UUID.randomUUID(), game, "Base B", null);
        Challenge ch1 = buildChallenge(UUID.randomUUID(), game, "Challenge A");
        Challenge ch2 = buildChallenge(UUID.randomUUID(), game, "Challenge B");

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base1, base2));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(ch1, ch2));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        GameExportDto result = service.exportGame(gameId);

        assertEquals("base_1", result.getBases().get(0).getTempId());
        assertEquals("base_2", result.getBases().get(1).getTempId());
        assertEquals("challenge_1", result.getChallenges().get(0).getTempId());
        assertEquals("challenge_2", result.getChallenges().get(1).getTempId());
    }

    @Test
    void exportGame_includesAllChallengeFields() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Challenge challenge = Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .title("Find the flag")
                .description("Desc")
                .content("<p>Content</p>")
                .completionContent("<p>Done</p>")
                .answerType(AnswerType.text)
                .autoValidate(true)
                .correctAnswer(List.of("42"))
                .points(50)
                .locationBound(true)
                .requirePresenceToSubmit(true)
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        ChallengeExportDto dto = service.exportGame(gameId).getChallenges().get(0);

        assertEquals("challenge_1", dto.getTempId());
        assertEquals("Find the flag", dto.getTitle());
        assertEquals("Desc", dto.getDescription());
        assertEquals("<p>Content</p>", dto.getContent());
        assertEquals("<p>Done</p>", dto.getCompletionContent());
        assertEquals(AnswerType.text, dto.getAnswerType());
        assertTrue(dto.getAutoValidate());
        assertEquals(List.of("42"), dto.getCorrectAnswer());
        assertEquals(50, dto.getPoints());
        assertTrue(dto.getLocationBound());
        assertTrue(dto.getRequirePresenceToSubmit());
        assertNull(dto.getUnlocksBaseTempIds());
    }

    @Test
    void exportGame_includesAllBaseFields() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Base base = Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("NFC Base")
                .description("At the hill")
                .lat(47.5)
                .lng(8.7)
                .hidden(true)
                .nfcLinked(true)
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        BaseExportDto dto = service.exportGame(gameId).getBases().get(0);

        assertEquals("base_1", dto.getTempId());
        assertEquals("NFC Base", dto.getName());
        assertEquals("At the hill", dto.getDescription());
        assertEquals(47.5, dto.getLat());
        assertEquals(8.7, dto.getLng());
        assertTrue(dto.getHidden());
        assertNull(dto.getFixedChallengeTempId());
    }

    @Test
    void exportGame_includesFixedChallengeTempId() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Challenge challenge = buildChallenge(UUID.randomUUID(), game, "Challenge A");
        Base base = Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Base with fixed")
                .description("")
                .lat(1.0).lng(2.0)
                .hidden(false)
                .nfcLinked(false)
                .fixedChallenge(challenge)
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        BaseExportDto dto = service.exportGame(gameId).getBases().get(0);

        assertEquals("challenge_1", dto.getFixedChallengeTempId());
    }

    @Test
    void exportGame_includesUnlocksBaseTempId() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Base targetBase = buildBase(UUID.randomUUID(), game, "Hidden Base", null);
        targetBase.setHidden(true);

        Challenge challenge = Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .title("Unlock Challenge")
                .description("")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(10)
                .locationBound(true)
                .requirePresenceToSubmit(false)
                .unlocksBases(new java.util.HashSet<>(java.util.Set.of(targetBase)))
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(targetBase));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        ChallengeExportDto dto = service.exportGame(gameId).getChallenges().get(0);

        assertNotNull(dto.getUnlocksBaseTempIds(), "Expected unlocksBaseTempIds to be non-null");
        assertEquals(1, dto.getUnlocksBaseTempIds().size());
        assertEquals("base_1", dto.getUnlocksBaseTempIds().get(0));
    }

    @Test
    void exportGame_includesTeamFields() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Team team = Team.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Red Team")
                .color("#FF0000")
                .joinCode("ABC123")
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        TeamExportDto dto = service.exportGame(gameId).getTeams().get(0);

        assertEquals("team_1", dto.getTempId());
        assertEquals("Red Team", dto.getName());
        assertEquals("#FF0000", dto.getColor());
    }

    @Test
    void exportGame_includesAssignmentWithTeamTempId() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Base base = buildBase(UUID.randomUUID(), game, "Base A", null);
        Challenge challenge = buildChallenge(UUID.randomUUID(), game, "Challenge A");
        Team team = Team.builder()
                .id(UUID.randomUUID()).game(game).name("Team A").color("#000").joinCode("XYZ").build();

        Assignment assignment = Assignment.builder()
                .id(UUID.randomUUID()).game(game).base(base).challenge(challenge).team(team).build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of(assignment));

        AssignmentExportDto dto = service.exportGame(gameId).getAssignments().get(0);

        assertEquals("base_1", dto.getBaseTempId());
        assertEquals("challenge_1", dto.getChallengeTempId());
        assertEquals("team_1", dto.getTeamTempId());
    }

    @Test
    void exportGame_includesAssignmentWithNullTeamTempId() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        Base base = buildBase(UUID.randomUUID(), game, "Base A", null);
        Challenge challenge = buildChallenge(UUID.randomUUID(), game, "Challenge A");

        Assignment assignment = Assignment.builder()
                .id(UUID.randomUUID()).game(game).base(base).challenge(challenge).team(null).build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of(assignment));

        AssignmentExportDto dto = service.exportGame(gameId).getAssignments().get(0);

        assertNull(dto.getTeamTempId());
    }

    @Test
    void exportGame_delegatesAccessCheckToGameAccessService() {
        UUID gameId = UUID.randomUUID();
        Game game = buildGame(gameId, "Game");

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.exportGame(gameId);

        verify(gameAccessService).getAccessibleGame(gameId);
    }

    // ── Import: happy path ───────────────────────────────────────────

    @Test
    void importGame_createsGameWithCorrectFields() {
        UUID savedGameId = UUID.randomUUID();
        stubImportSaves(savedGameId);

        GameImportRequest request = buildMinimalRequest();
        request.setStartDate(Instant.parse("2026-06-01T00:00:00Z"));
        request.setEndDate(Instant.parse("2026-06-10T00:00:00Z"));
        request.getGameData().getGame().setDescription("My description");
        request.getGameData().getGame().setUniformAssignment(true);
        request.getGameData().getGame().setTileSource("custom-tile");

        service.importGame(request);

        ArgumentCaptor<Game> gameCaptor = ArgumentCaptor.forClass(Game.class);
        verify(gameRepository).save(gameCaptor.capture());
        Game saved = gameCaptor.getValue();

        assertEquals("Test Game", saved.getName());
        assertEquals("My description", saved.getDescription());
        assertEquals(Instant.parse("2026-06-01T00:00:00Z"), saved.getStartDate());
        assertEquals(Instant.parse("2026-06-10T00:00:00Z"), saved.getEndDate());
        assertTrue(saved.getUniformAssignment());
        assertEquals("custom-tile", saved.getTileSource());
        assertEquals(GameStatus.setup, saved.getStatus());
        assertEquals(authenticatedUser, saved.getCreatedBy());
    }

    @Test
    void importGame_defaultsNullDescriptionToEmpty() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getGame().setDescription(null);

        service.importGame(request);

        ArgumentCaptor<Game> captor = ArgumentCaptor.forClass(Game.class);
        verify(gameRepository).save(captor.capture());
        assertEquals("", captor.getValue().getDescription());
    }

    @Test
    void importGame_defaultsNullUniformAssignmentToFalse() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getGame().setUniformAssignment(null);

        service.importGame(request);

        ArgumentCaptor<Game> captor = ArgumentCaptor.forClass(Game.class);
        verify(gameRepository).save(captor.capture());
        assertFalse(captor.getValue().getUniformAssignment());
    }

    @Test
    void importGame_defaultsNullTileSourceToOsmClassic() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getGame().setTileSource(null);

        service.importGame(request);

        ArgumentCaptor<Game> captor = ArgumentCaptor.forClass(Game.class);
        verify(gameRepository).save(captor.capture());
        assertEquals("osm-classic", captor.getValue().getTileSource());
    }

    @Test
    void importGame_addsCurrentUserAsOperator() {
        stubImportSaves(UUID.randomUUID());

        service.importGame(buildMinimalRequest());

        ArgumentCaptor<Game> captor = ArgumentCaptor.forClass(Game.class);
        verify(gameRepository).save(captor.capture());
        assertTrue(captor.getValue().getOperators().contains(authenticatedUser));
    }

    @Test
    void importGame_createsChallengesWithDefaultedOptionalFields() {
        UUID gameId = UUID.randomUUID();
        stubImportSaves(gameId);

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("My Challenge")
                        .description(null)
                        .content(null)
                        .completionContent(null)
                        .answerType(AnswerType.text)
                        .autoValidate(null)
                        .correctAnswer(null)
                        .points(20)
                        .locationBound(null)
                        .requirePresenceToSubmit(null)
                        .build()
        );
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(inv -> {
            Challenge c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        service.importGame(request);

        ArgumentCaptor<Challenge> captor = ArgumentCaptor.forClass(Challenge.class);
        verify(challengeRepository, atLeastOnce()).save(captor.capture());
        Challenge saved = captor.getAllValues().get(0);

        assertEquals("My Challenge", saved.getTitle());
        assertEquals("", saved.getDescription());
        assertEquals("", saved.getContent());
        assertEquals("", saved.getCompletionContent());
        assertFalse(saved.getAutoValidate());
        assertFalse(saved.getLocationBound());
        assertFalse(saved.getRequirePresenceToSubmit());
        assertEquals(20, saved.getPoints());
    }

    @Test
    void importGame_createsChallengeWithExplicitFields() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Explicit Challenge")
                        .description("Some desc")
                        .content("<p>content</p>")
                        .completionContent("<p>done</p>")
                        .answerType(AnswerType.file)
                        .autoValidate(true)
                        .correctAnswer(List.of("answer"))
                        .points(100)
                        .locationBound(true)
                        .requirePresenceToSubmit(true)
                        .build()
        );
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(inv -> {
            Challenge c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        service.importGame(request);

        ArgumentCaptor<Challenge> captor = ArgumentCaptor.forClass(Challenge.class);
        verify(challengeRepository, atLeastOnce()).save(captor.capture());
        Challenge saved = captor.getAllValues().get(0);

        assertEquals("Some desc", saved.getDescription());
        assertEquals(AnswerType.file, saved.getAnswerType());
        assertTrue(saved.getAutoValidate());
        assertEquals(List.of("answer"), saved.getCorrectAnswer());
        assertTrue(saved.getLocationBound());
        assertTrue(saved.getRequirePresenceToSubmit());
    }

    @Test
    void importGame_createsBasesWithDefaultedOptionalFields() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_1")
                        .name("My Base")
                        .description(null)
                        .lat(10.0)
                        .lng(20.0)
                        .hidden(null)
                        .build()
        );

        service.importGame(request);

        ArgumentCaptor<Base> captor = ArgumentCaptor.forClass(Base.class);
        verify(baseRepository).save(captor.capture());
        Base saved = captor.getValue();

        assertEquals("My Base", saved.getName());
        assertEquals("", saved.getDescription());
        assertEquals(10.0, saved.getLat());
        assertEquals(20.0, saved.getLng());
        assertFalse(saved.getHidden());
        assertFalse(saved.getNfcLinked());
        assertNull(saved.getFixedChallenge());
    }

    @Test
    void importGame_linksFixedChallengeToBase() {
        stubImportSaves(UUID.randomUUID());

        UUID challengeId = UUID.randomUUID();
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(inv -> {
            Challenge c = inv.getArgument(0);
            c.setId(challengeId);
            return c;
        });
        when(baseRepository.save(any(Base.class))).thenAnswer(inv -> {
            Base b = inv.getArgument(0);
            b.setId(UUID.randomUUID());
            return b;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Fixed Challenge")
                        .answerType(AnswerType.text)
                        .points(10)
                        .build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_1")
                        .name("Base with Fixed")
                        .lat(1.0).lng(2.0)
                        .hidden(false)
                        .fixedChallengeTempId("challenge_1")
                        .build()
        );

        service.importGame(request);

        ArgumentCaptor<Base> captor = ArgumentCaptor.forClass(Base.class);
        verify(baseRepository).save(captor.capture());
        assertNotNull(captor.getValue().getFixedChallenge());
        assertEquals(challengeId, captor.getValue().getFixedChallenge().getId());
    }

    @Test
    void importGame_createsTeamsWithGeneratedJoinCodes() {
        UUID gameId = UUID.randomUUID();
        stubImportSaves(gameId);

        when(teamRepository.findByJoinCode(anyString())).thenReturn(Optional.empty());
        when(teamRepository.save(any(Team.class))).thenAnswer(inv -> {
            Team t = inv.getArgument(0);
            t.setId(UUID.randomUUID());
            return t;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder()
                        .tempId("team_1")
                        .name("Blue Team")
                        .color("#0000FF")
                        .build()
        );

        service.importGame(request);

        ArgumentCaptor<Team> captor = ArgumentCaptor.forClass(Team.class);
        verify(teamRepository).save(captor.capture());
        Team saved = captor.getValue();

        assertEquals("Blue Team", saved.getName());
        assertEquals("#0000FF", saved.getColor());
        assertNotNull(saved.getJoinCode());
        assertFalse(saved.getJoinCode().isBlank());
    }

    @Test
    void importGame_createsAssignmentsLinkingEntities() {
        UUID gameId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> {
            Game g = inv.getArgument(0);
            g.setId(gameId);
            return g;
        });
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(inv -> {
            Challenge c = inv.getArgument(0);
            c.setId(challengeId);
            return c;
        });
        when(baseRepository.save(any(Base.class))).thenAnswer(inv -> {
            Base b = inv.getArgument(0);
            b.setId(baseId);
            return b;
        });
        when(assignmentRepository.save(any(Assignment.class))).thenAnswer(inv -> inv.getArgument(0));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Challenge")
                        .answerType(AnswerType.text)
                        .points(10)
                        .build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_1")
                        .name("Base")
                        .lat(1.0).lng(2.0)
                        .hidden(false)
                        .build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder()
                        .baseTempId("base_1")
                        .challengeTempId("challenge_1")
                        .teamTempId(null)
                        .build()
        );

        service.importGame(request);

        ArgumentCaptor<Assignment> captor = ArgumentCaptor.forClass(Assignment.class);
        verify(assignmentRepository).save(captor.capture());
        Assignment saved = captor.getValue();

        assertNotNull(saved.getBase());
        assertNotNull(saved.getChallenge());
        assertNull(saved.getTeam());
        assertEquals(baseId, saved.getBase().getId());
        assertEquals(challengeId, saved.getChallenge().getId());
    }

    @Test
    void importGame_returnsGameResponseWithSavedId() {
        UUID savedGameId = UUID.randomUUID();
        stubImportSaves(savedGameId);

        GameResponse response = service.importGame(buildMinimalRequest());

        assertEquals(savedGameId, response.getId());
    }

    @Test
    void importGame_withNullTeams_doesNotCreateAnyTeams() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().setTeams(null);

        service.importGame(request);

        verify(teamRepository, never()).save(any());
    }

    @Test
    void importGame_withEmptyTeams_doesNotCreateAnyTeams() {
        stubImportSaves(UUID.randomUUID());

        service.importGame(buildMinimalRequest()); // minimal request has empty teams

        verify(teamRepository, never()).save(any());
    }

    // ── Import: unlocks_base entity persistence ──────────────────────

    @Test
    void importGame_setsUnlocksBasesOnChallenge() {
        UUID gameId = UUID.randomUUID();
        UUID sourceBaseId = UUID.randomUUID();
        UUID hiddenBaseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> {
            Game g = inv.getArgument(0);
            g.setId(gameId);
            return g;
        });

        // challenge saved first (empty unlocksBases), then saved again with the hidden base added
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(inv -> {
            Challenge c = inv.getArgument(0);
            if (c.getId() == null) c.setId(challengeId);
            return c;
        });
        when(challengeRepository.findByUnlocksBasesContaining(any())).thenReturn(Optional.empty());

        when(baseRepository.save(any(Base.class))).thenAnswer(inv -> {
            Base b = inv.getArgument(0);
            if (b.getId() == null) {
                b.setId(b.getName().equals("Hidden Base") ? hiddenBaseId : sourceBaseId);
            }
            return b;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Unlock Ch")
                        .answerType(AnswerType.text)
                        .points(10)
                        .locationBound(true)
                        .unlocksBaseTempIds(List.of("base_hidden"))
                        .build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_source")
                        .name("Source Base")
                        .lat(1.0).lng(2.0)
                        .hidden(false)
                        .fixedChallengeTempId("challenge_1")
                        .build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_hidden")
                        .name("Hidden Base")
                        .lat(3.0).lng(4.0)
                        .hidden(true)
                        .build()
        );

        service.importGame(request);

        ArgumentCaptor<Challenge> captor = ArgumentCaptor.forClass(Challenge.class);
        verify(challengeRepository, atLeast(2)).save(captor.capture());
        // The second save of the challenge should have the hidden base in unlocksBases
        Challenge savedWithUnlocks = captor.getAllValues().stream()
                .filter(c -> !c.getUnlocksBases().isEmpty())
                .findFirst()
                .orElse(null);
        assertNotNull(savedWithUnlocks, "Expected challenge to be saved with unlocksBases populated");
        assertEquals(1, savedWithUnlocks.getUnlocksBases().size());
        assertEquals(hiddenBaseId, savedWithUnlocks.getUnlocksBases().iterator().next().getId());
    }

    @Test
    void importGame_setsMultipleUnlocksBasesOnChallenge() {
        UUID gameId = UUID.randomUUID();
        UUID sourceBaseId = UUID.randomUUID();
        UUID hiddenBaseId1 = UUID.randomUUID();
        UUID hiddenBaseId2 = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> {
            Game g = inv.getArgument(0);
            g.setId(gameId);
            return g;
        });
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(inv -> {
            Challenge c = inv.getArgument(0);
            if (c.getId() == null) c.setId(challengeId);
            return c;
        });
        when(challengeRepository.findByUnlocksBasesContaining(any())).thenReturn(Optional.empty());
        when(baseRepository.save(any(Base.class))).thenAnswer(inv -> {
            Base b = inv.getArgument(0);
            if (b.getId() == null) {
                if ("Hidden Base 1".equals(b.getName())) b.setId(hiddenBaseId1);
                else if ("Hidden Base 2".equals(b.getName())) b.setId(hiddenBaseId2);
                else b.setId(sourceBaseId);
            }
            return b;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Multi-Unlock Ch")
                        .answerType(AnswerType.text)
                        .points(10)
                        .locationBound(true)
                        .unlocksBaseTempIds(List.of("base_hidden_1", "base_hidden_2"))
                        .build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_source")
                        .name("Source Base")
                        .lat(1.0).lng(2.0)
                        .hidden(false)
                        .fixedChallengeTempId("challenge_1")
                        .build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_hidden_1")
                        .name("Hidden Base 1")
                        .lat(3.0).lng(4.0)
                        .hidden(true)
                        .build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder()
                        .tempId("base_hidden_2")
                        .name("Hidden Base 2")
                        .lat(5.0).lng(6.0)
                        .hidden(true)
                        .build()
        );

        service.importGame(request);

        ArgumentCaptor<Challenge> captor = ArgumentCaptor.forClass(Challenge.class);
        verify(challengeRepository, atLeast(2)).save(captor.capture());
        Challenge savedWithUnlocks = captor.getAllValues().stream()
                .filter(c -> !c.getUnlocksBases().isEmpty())
                .findFirst()
                .orElse(null);
        assertNotNull(savedWithUnlocks, "Expected challenge to be saved with unlocksBases populated");
        assertEquals(2, savedWithUnlocks.getUnlocksBases().size());
        java.util.Set<UUID> savedIds = savedWithUnlocks.getUnlocksBases().stream()
                .map(Base::getId)
                .collect(java.util.stream.Collectors.toSet());
        assertTrue(savedIds.contains(hiddenBaseId1));
        assertTrue(savedIds.contains(hiddenBaseId2));
    }

    // ── Import: date validation ───────────────────────────────────────

    @Test
    void importGame_allowsNullStartDate() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.setStartDate(null);
        request.setEndDate(null);

        assertDoesNotThrow(() -> service.importGame(request));
    }

    @Test
    void importGame_rejectsEndDateBeforeStartDate() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.setStartDate(Instant.parse("2026-06-10T00:00:00Z"));
        request.setEndDate(Instant.parse("2026-06-05T00:00:00Z"));

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("End date must be after start date"));
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    void importGame_allowsEndDateEqualToStartDate() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.setStartDate(Instant.parse("2026-06-10T00:00:00Z"));
        request.setEndDate(Instant.parse("2026-06-10T00:00:00Z"));

        assertDoesNotThrow(() -> service.importGame(request));
    }

    @Test
    void importGame_allowsOnlyStartDateWithNoEndDate() {
        stubImportSaves(UUID.randomUUID());

        GameImportRequest request = buildMinimalRequest();
        request.setStartDate(Instant.parse("2026-06-01T00:00:00Z"));
        request.setEndDate(null);

        assertDoesNotThrow(() -> service.importGame(request));
    }

    // ── Import: version validation ────────────────────────────────────

    @Test
    void importGame_rejectsUnsupportedExportVersion() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().setExportVersion("2.0");

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Unsupported export version: 2.0"));
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    void importGame_rejectsNullExportVersion() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().setExportVersion(null);

        assertThrows(BadRequestException.class, () -> service.importGame(request));
        verify(gameRepository, never()).save(any(Game.class));
    }

    // ── Import: required fields validation ───────────────────────────

    @Test
    void importGame_rejectsMissingGameMetadata() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().setGame(null);

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Game metadata is required"));
    }

    @Test
    void importGame_rejectsMissingBasesField() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().setBases(null);

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Bases data is required"));
    }

    @Test
    void importGame_rejectsMissingChallengesField() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().setChallenges(null);

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Challenges data is required"));
    }

    @Test
    void importGame_rejectsMissingAssignmentsField() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().setAssignments(null);

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Assignments data is required"));
    }

    @Test
    void importGame_rejectsBlankGameName() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getGame().setName("   ");

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Game name is required"));
    }

    @Test
    void importGame_rejectsNullGameName() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getGame().setName(null);

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Game name is required"));
    }

    // ── Import: base validation ───────────────────────────────────────

    @Test
    void importGame_rejectsBaseMissingTempId() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId(null).name("Base").lat(1.0).lng(2.0).hidden(false).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("bases[0].tempId is required"));
    }

    @Test
    void importGame_rejectsBaseMissingName() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name(null).lat(1.0).lng(2.0).hidden(false).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("bases[0].name is required"));
    }

    @Test
    void importGame_rejectsBaseMissingLat() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Base").lat(null).lng(2.0).hidden(false).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("bases[0].lat is required"));
    }

    @Test
    void importGame_rejectsBaseMissingLng() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Base").lat(1.0).lng(null).hidden(false).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("bases[0].lng is required"));
    }

    @Test
    void importGame_rejectsDuplicateBaseTempIds() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_dup").name("Base 1").lat(1.0).lng(2.0).hidden(false).build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_dup").name("Base 2").lat(3.0).lng(4.0).hidden(false).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Duplicate base tempId: base_dup"));
    }

    @Test
    void importGame_rejectsBlankFixedChallengeTempId() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Base").lat(1.0).lng(2.0)
                        .hidden(false).fixedChallengeTempId("  ").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("fixedChallengeTempId cannot be blank"));
    }

    @Test
    void importGame_rejectsBaseReferencingNonExistentFixedChallenge() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Base").lat(1.0).lng(2.0)
                        .hidden(false).fixedChallengeTempId("nonexistent").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("non-existent fixed challenge: nonexistent"));
    }

    // ── Import: challenge validation ──────────────────────────────────

    @Test
    void importGame_rejectsChallengeMissingTempId() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId(null).title("C").answerType(AnswerType.text).points(10).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("challenges[0].tempId is required"));
    }

    @Test
    void importGame_rejectsChallengeMissingTitle() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title(null).answerType(AnswerType.text).points(10).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("challenges[0].title is required"));
    }

    @Test
    void importGame_rejectsChallengeMissingAnswerType() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(null).points(10).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("challenges[0].answerType is required"));
    }

    @Test
    void importGame_rejectsChallengeMissingPoints() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text).points(null).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertEquals("challenges[0].points is required", ex.getMessage());
    }

    @Test
    void importGame_rejectsChallengeWithNegativePoints() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text).points(-1).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("points must be greater than or equal to 0"));
    }

    @Test
    void importGame_allowsChallengeWithZeroPoints() {
        stubImportSaves(UUID.randomUUID());
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(inv -> {
            Challenge c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text).points(0).build()
        );

        assertDoesNotThrow(() -> service.importGame(request));
    }

    @Test
    void importGame_rejectsDuplicateChallengeTempIds() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("ch_dup").title("C1").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("ch_dup").title("C2").answerType(AnswerType.text).points(20).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Duplicate challenge tempId: ch_dup"));
    }

    @Test
    void importGame_rejectsBlankUnlocksBaseTempId() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text)
                        .points(10).unlocksBaseTempIds(List.of("  ")).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("unlocksBaseTempIds[0] cannot be blank"));
    }

    @Test
    void importGame_rejectsChallengeUnlockingNonExistentBase() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0).hidden(false)
                        .fixedChallengeTempId("challenge_1").build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text)
                        .points(10).locationBound(true).unlocksBaseTempIds(List.of("base_nonexistent")).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("non-existent unlock base: base_nonexistent"));
    }

    // ── Import: unlock validation (complex cross-field) ───────────────

    @Test
    void importGame_rejectsUnlockWhenChallengeNotLocationBound() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Source").lat(1.0).lng(2.0)
                        .hidden(false).fixedChallengeTempId("challenge_1").build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_hidden").name("Hidden").lat(3.0).lng(4.0)
                        .hidden(true).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text)
                        .points(10).locationBound(false).unlocksBaseTempIds(List.of("base_hidden")).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("locationBound=true when unlocksBaseTempIds is set"));
    }

    @Test
    void importGame_rejectsUnlockWhenChallengeNotFixedToBase() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Unfixed").lat(1.0).lng(2.0)
                        .hidden(false).build() // no fixedChallengeTempId
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_hidden").name("Hidden").lat(3.0).lng(4.0)
                        .hidden(true).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text)
                        .points(10).locationBound(true).unlocksBaseTempIds(List.of("base_hidden")).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("must be fixed to a base"));
    }

    @Test
    void importGame_rejectsUnlockTargetThatIsNotHidden() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Source").lat(1.0).lng(2.0)
                        .hidden(false).fixedChallengeTempId("challenge_1").build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_target").name("Visible Target").lat(3.0).lng(4.0)
                        .hidden(false).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text)
                        .points(10).locationBound(true).unlocksBaseTempIds(List.of("base_target")).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("hidden base"));
    }

    @Test
    void importGame_rejectsUnlockingOwnFixedBase() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("Base").lat(1.0).lng(2.0)
                        .hidden(true).fixedChallengeTempId("challenge_1").build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text)
                        .points(10).locationBound(true).unlocksBaseTempIds(List.of("base_1")).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("cannot unlock its own fixed base"));
    }

    @Test
    void importGame_rejectsDuplicateUnlockTargets() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_src1").name("Source 1").lat(1.0).lng(2.0)
                        .hidden(false).fixedChallengeTempId("challenge_1").build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_src2").name("Source 2").lat(5.0).lng(6.0)
                        .hidden(false).fixedChallengeTempId("challenge_2").build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_hidden").name("Hidden").lat(3.0).lng(4.0)
                        .hidden(true).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C1").answerType(AnswerType.text)
                        .points(10).locationBound(true).unlocksBaseTempIds(List.of("base_hidden")).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_2").title("C2").answerType(AnswerType.text)
                        .points(10).locationBound(true).unlocksBaseTempIds(List.of("base_hidden")).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Multiple challenges cannot unlock the same base"));
    }

    // ── Import: team validation ───────────────────────────────────────

    @Test
    void importGame_rejectsTeamMissingTempId() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId(null).name("Team").color("#123456").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("teams[0].tempId is required"));
    }

    @Test
    void importGame_rejectsTeamMissingName() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_1").name(null).color("#123456").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("teams[0].name is required"));
    }

    @Test
    void importGame_rejectsTeamMissingColor() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_1").name("T").color(null).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("teams[0].color is required"));
    }

    @Test
    void importGame_rejectsTeamColorExceedingSevenChars() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_1").name("T").color("#1234567").build() // 8 chars
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("color must be at most 7 characters"));
    }

    @Test
    void importGame_allowsTeamColorWithExactlySevenChars() {
        stubImportSaves(UUID.randomUUID());
        when(teamRepository.findByJoinCode(anyString())).thenReturn(Optional.empty());
        when(teamRepository.save(any(Team.class))).thenAnswer(inv -> {
            Team t = inv.getArgument(0);
            t.setId(UUID.randomUUID());
            return t;
        });

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_1").name("T").color("#123456").build() // 7 chars
        );

        assertDoesNotThrow(() -> service.importGame(request));
    }

    @Test
    void importGame_rejectsDuplicateTeamTempIds() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_dup").name("T1").color("#111111").build()
        );
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_dup").name("T2").color("#222222").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Duplicate team tempId: team_dup"));
    }

    // ── Import: assignment validation ─────────────────────────────────

    @Test
    void importGame_rejectsAssignmentMissingBaseTempId() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId(null).challengeTempId("challenge_1").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("assignments[0].baseTempId is required"));
    }

    @Test
    void importGame_rejectsAssignmentMissingChallengeTempId() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId(null).build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("assignments[0].challengeTempId is required"));
    }

    @Test
    void importGame_rejectsAssignmentReferencingNonExistentBase() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_nonexistent").challengeTempId("challenge_1").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Assignment references non-existent base: base_nonexistent"));
    }

    @Test
    void importGame_rejectsAssignmentReferencingNonExistentChallenge() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0).hidden(false).build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_nonexistent").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Assignment references non-existent challenge: challenge_nonexistent"));
    }

    @Test
    void importGame_rejectsAssignmentReferencingNonExistentTeam() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0).hidden(false).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_1")
                        .teamTempId("team_nonexistent").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Assignment references non-existent team: team_nonexistent"));
    }

    @Test
    void importGame_rejectsBlankTeamTempIdInAssignment() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0).hidden(false).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_1")
                        .teamTempId("  ").build()
        );

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("assignments[0].teamTempId cannot be blank"));
    }

    // ── Import: assignment conflict validation ────────────────────────

    @Test
    void importGame_rejectsDuplicateAllTeamsAssignmentForSameBase() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0).hidden(false).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C1").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_2").title("C2").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_1").teamTempId(null).build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_2").teamTempId(null).build()
        );

        ConflictException ex = assertThrows(ConflictException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Duplicate 'All Teams' assignment for base: base_1"));
    }

    @Test
    void importGame_rejectsMixingAllTeamsAndTeamSpecificForSameBase() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0).hidden(false).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C1").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_2").title("C2").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_1").name("T").color("#AABBCC").build()
        );
        // team-specific first, then all-teams
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_1").teamTempId("team_1").build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_2").teamTempId(null).build()
        );

        ConflictException ex = assertThrows(ConflictException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Cannot mix"));
    }

    @Test
    void importGame_rejectsDuplicateTeamSpecificAssignment() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0).hidden(false).build()
        );
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C").answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_1").name("T").color("#AABBCC").build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_1").teamTempId("team_1").build()
        );
        request.getGameData().getAssignments().add(
                AssignmentExportDto.builder().baseTempId("base_1").challengeTempId("challenge_1").teamTempId("team_1").build()
        );

        ConflictException ex = assertThrows(ConflictException.class, () -> service.importGame(request));
        assertTrue(ex.getMessage().contains("Duplicate assignment for base/team: base_1:team_1"));
    }

    // ── Import: user lookup ───────────────────────────────────────────

    @Test
    void importGame_throwsResourceNotFoundWhenUserNotInRepository() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.importGame(buildMinimalRequest()));
        verify(gameRepository, never()).save(any(Game.class));
    }

    // ── Import: join code exhaustion ──────────────────────────────────

    @Test
    void importGame_throwsWhenJoinCodeCannotBeGenerated() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> {
            Game g = inv.getArgument(0);
            g.setId(UUID.randomUUID());
            return g;
        });
        // All join codes are "taken"
        when(teamRepository.findByJoinCode(anyString())).thenReturn(Optional.of(new Team()));

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getTeams().add(
                TeamExportDto.builder().tempId("team_1").name("Team").color("#AABBCC").build()
        );

        assertThrows(IllegalStateException.class, () -> service.importGame(request));
    }

    // ── Import: fixedChallenge not found in entityMap ─────────────────

    @Test
    void importGame_throwsWhenFixedChallengeEntityMissing() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> {
            Game g = inv.getArgument(0);
            g.setId(UUID.randomUUID());
            return g;
        });
        // challenge is NOT saved (save not stubbed to map challenge_1 into challengeEntityMap)
        // We add a base that references a challenge tempId that does not match any saved challenge
        // Note: validation would normally catch this via cross-reference checks, but we test the
        // entity-creation path by bypassing with a challenge tempId added only to bases, not challenges
        // This scenario passes validation (base's fixedChallengeTempId must exist in challenges list)
        // so we construct a tricky case: challenge is in list but save returns null id
        when(challengeRepository.save(any(Challenge.class))).thenReturn(null);

        GameImportRequest request = buildMinimalRequest();
        request.getGameData().getChallenges().add(
                ChallengeExportDto.builder().tempId("challenge_1").title("C")
                        .answerType(AnswerType.text).points(10).build()
        );
        request.getGameData().getBases().add(
                BaseExportDto.builder().tempId("base_1").name("B").lat(1.0).lng(2.0)
                        .hidden(false).fixedChallengeTempId("challenge_1").build()
        );

        // Saving null challenge means challengeEntityMap stores null, causing NPE or IllegalStateException
        // The service throws IllegalStateException("Challenge not found") when lookup returns null
        assertThrows(Exception.class, () -> service.importGame(request));
    }

    // ── Helper builders ───────────────────────────────────────────────

    private Game buildGame(UUID id, String name) {
        return Game.builder()
                .id(id)
                .name(name)
                .description("desc")
                .uniformAssignment(false)
                .tileSource("osm-classic")
                .status(GameStatus.setup)
                .createdBy(authenticatedUser)
                .build();
    }

    private Base buildBase(UUID id, Game game, String name, Challenge fixedChallenge) {
        return Base.builder()
                .id(id)
                .game(game)
                .name(name)
                .description("")
                .lat(1.0)
                .lng(2.0)
                .hidden(false)
                .nfcLinked(false)
                .fixedChallenge(fixedChallenge)
                .build();
    }

    private Challenge buildChallenge(UUID id, Game game, String title) {
        return Challenge.builder()
                .id(id)
                .game(game)
                .title(title)
                .description("")
                .content("")
                .completionContent("")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(10)
                .locationBound(false)
                .requirePresenceToSubmit(false)
                .build();
    }

    /**
     * Builds a minimal valid import request with no bases, challenges, assignments, or teams.
     * Tests that need those collections must add entries themselves.
     */
    private GameImportRequest buildMinimalRequest() {
        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder()
                        .name("Test Game")
                        .description("desc")
                        .uniformAssignment(false)
                        .tileSource("osm-classic")
                        .build())
                .bases(new java.util.ArrayList<>())
                .challenges(new java.util.ArrayList<>())
                .assignments(new java.util.ArrayList<>())
                .teams(new java.util.ArrayList<>())
                .build());
        return request;
    }

    /**
     * Stubs the minimum repository saves needed for a successful import with no sub-entities.
     */
    private void stubImportSaves(UUID savedGameId) {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));
        when(gameRepository.save(any(Game.class))).thenAnswer(inv -> {
            Game g = inv.getArgument(0);
            g.setId(savedGameId);
            return g;
        });
    }
}
