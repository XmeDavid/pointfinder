package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.export.BaseExportDto;
import com.prayer.pointfinder.dto.export.ChallengeExportDto;
import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.export.GameMetadataDto;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.*;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GameServiceTest {

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
    private CheckInRepository checkInRepository;
    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private TeamLocationRepository teamLocationRepository;
    @Mock
    private ActivityEventRepository activityEventRepository;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private FileStorageService fileStorageService;
    @Mock
    private GameEventBroadcaster eventBroadcaster;
    @Mock
    private ChallengeAssignmentService challengeAssignmentService;

    private GameService gameService;
    private GameImportExportService gameImportExportService;

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

        gameImportExportService = new GameImportExportService(
                gameRepository,
                userRepository,
                baseRepository,
                challengeRepository,
                teamRepository,
                assignmentRepository,
                gameAccessService
        );

        gameService = new GameService(
                gameRepository,
                userRepository,
                baseRepository,
                challengeRepository,
                teamRepository,
                assignmentRepository,
                checkInRepository,
                submissionRepository,
                teamLocationRepository,
                activityEventRepository,
                gameAccessService,
                fileStorageService,
                eventBroadcaster,
                challengeAssignmentService,
                gameImportExportService
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void exportGameIncludesRequirePresenceToSubmitInBasePayload() {
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder()
                .id(gameId)
                .name("Game")
                .description("Desc")
                .status(GameStatus.setup)
                .createdBy(authenticatedUser)
                .build();

        Base base = Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Base A")
                .description("Desc")
                .lat(40.0)
                .lng(-8.0)
                .nfcLinked(true)
                .hidden(false)
                .requirePresenceToSubmit(true)
                .build();

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(base));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        GameExportDto exported = gameService.exportGame(gameId);

        assertEquals(1, exported.getBases().size());
        assertTrue(exported.getBases().get(0).getRequirePresenceToSubmit());
    }

    @Test
    void importGamePreservesRequirePresenceAndDefaultsOptionalChallengeFields() {
        UUID importedGameId = UUID.randomUUID();
        UUID importedChallengeId = UUID.randomUUID();

        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));
        when(gameRepository.save(any(Game.class))).thenAnswer(invocation -> {
            Game game = invocation.getArgument(0);
            game.setId(importedGameId);
            return game;
        });
        when(challengeRepository.save(any(Challenge.class))).thenAnswer(invocation -> {
            Challenge challenge = invocation.getArgument(0);
            challenge.setId(importedChallengeId);
            return challenge;
        });
        when(baseRepository.save(any(Base.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder()
                        .name("Imported Game")
                        .description("Imported description")
                        .uniformAssignment(false)
                        .build())
                .bases(List.of(BaseExportDto.builder()
                        .tempId("base_1")
                        .name("Base 1")
                        .description(null)
                        .lat(11.0)
                        .lng(12.0)
                        .hidden(false)
                        .requirePresenceToSubmit(true)
                        .build()))
                .challenges(List.of(ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Challenge 1")
                        .description(null)
                        .content(null)
                        .completionContent(null)
                        .answerType(AnswerType.text)
                        .autoValidate(null)
                        .points(100)
                        .locationBound(null)
                        .build()))
                .assignments(List.of())
                .teams(List.of())
                .build());

        GameResponse imported = gameService.importGame(request);

        ArgumentCaptor<Base> baseCaptor = ArgumentCaptor.forClass(Base.class);
        verify(baseRepository).save(baseCaptor.capture());
        Base savedBase = baseCaptor.getValue();
        assertTrue(savedBase.getRequirePresenceToSubmit());
        assertEquals("", savedBase.getDescription());

        ArgumentCaptor<Challenge> challengeCaptor = ArgumentCaptor.forClass(Challenge.class);
        verify(challengeRepository).save(challengeCaptor.capture());
        Challenge savedChallenge = challengeCaptor.getValue();
        assertEquals("", savedChallenge.getDescription());
        assertEquals("", savedChallenge.getContent());
        assertEquals("", savedChallenge.getCompletionContent());
        assertFalse(savedChallenge.getAutoValidate());
        assertFalse(savedChallenge.getLocationBound());

        assertEquals(importedGameId, imported.getId());
    }

    @Test
    void importGameRejectsUnsupportedExportVersion() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("2.0")
                .game(GameMetadataDto.builder().name("Game").description("").uniformAssignment(false).build())
                .bases(List.of())
                .challenges(List.of())
                .assignments(List.of())
                .build());

        BadRequestException ex = assertThrows(BadRequestException.class, () -> gameService.importGame(request));
        assertTrue(ex.getMessage().contains("Unsupported export version"));
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    void importGameRejectsMalformedChallengeMissingPoints() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder().name("Game").description("").uniformAssignment(false).build())
                .bases(List.of(BaseExportDto.builder()
                        .tempId("base_1")
                        .name("Base")
                        .description("")
                        .lat(1.0)
                        .lng(2.0)
                        .hidden(false)
                        .requirePresenceToSubmit(false)
                        .build()))
                .challenges(List.of(ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Challenge")
                        .answerType(AnswerType.text)
                        .points(null)
                        .build()))
                .assignments(List.of())
                .teams(List.of())
                .build());

        BadRequestException ex = assertThrows(BadRequestException.class, () -> gameService.importGame(request));
        assertEquals("challenges[0].points is required", ex.getMessage());
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    void importGameRejectsUnlockTargetThatIsNotHidden() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder().name("Game").description("").uniformAssignment(false).build())
                .bases(List.of(
                        BaseExportDto.builder()
                                .tempId("base_1")
                                .name("Source")
                                .description("")
                                .lat(1.0)
                                .lng(2.0)
                                .hidden(false)
                                .fixedChallengeTempId("challenge_1")
                                .requirePresenceToSubmit(false)
                                .build(),
                        BaseExportDto.builder()
                                .tempId("base_2")
                                .name("Target")
                                .description("")
                                .lat(3.0)
                                .lng(4.0)
                                .hidden(false)
                                .requirePresenceToSubmit(false)
                                .build()
                ))
                .challenges(List.of(ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Challenge")
                        .answerType(AnswerType.text)
                        .points(100)
                        .locationBound(true)
                        .unlocksBaseTempId("base_2")
                        .build()))
                .assignments(List.of())
                .teams(List.of())
                .build());

        BadRequestException ex = assertThrows(BadRequestException.class, () -> gameService.importGame(request));
        assertTrue(ex.getMessage().contains("hidden base"));
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    void importGameRejectsDuplicateUnlockTargets() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder().name("Game").description("").uniformAssignment(false).build())
                .bases(List.of(
                        BaseExportDto.builder()
                                .tempId("base_1")
                                .name("Source 1")
                                .description("")
                                .lat(1.0)
                                .lng(2.0)
                                .hidden(false)
                                .fixedChallengeTempId("challenge_1")
                                .requirePresenceToSubmit(false)
                                .build(),
                        BaseExportDto.builder()
                                .tempId("base_2")
                                .name("Source 2")
                                .description("")
                                .lat(5.0)
                                .lng(6.0)
                                .hidden(false)
                                .fixedChallengeTempId("challenge_2")
                                .requirePresenceToSubmit(false)
                                .build(),
                        BaseExportDto.builder()
                                .tempId("base_3")
                                .name("Hidden target")
                                .description("")
                                .lat(3.0)
                                .lng(4.0)
                                .hidden(true)
                                .requirePresenceToSubmit(false)
                                .build()
                ))
                .challenges(List.of(
                        ChallengeExportDto.builder()
                                .tempId("challenge_1")
                                .title("Challenge 1")
                                .answerType(AnswerType.text)
                                .points(100)
                                .locationBound(true)
                                .unlocksBaseTempId("base_3")
                                .build(),
                        ChallengeExportDto.builder()
                                .tempId("challenge_2")
                                .title("Challenge 2")
                                .answerType(AnswerType.text)
                                .points(100)
                                .locationBound(true)
                                .unlocksBaseTempId("base_3")
                                .build()
                ))
                .assignments(List.of())
                .teams(List.of())
                .build());

        BadRequestException ex = assertThrows(BadRequestException.class, () -> gameService.importGame(request));
        assertTrue(ex.getMessage().contains("Multiple challenges cannot unlock the same base"));
        verify(gameRepository, never()).save(any(Game.class));
    }

    @Test
    void importGameRejectsUnlockingOwnFixedBase() {
        when(userRepository.findById(authenticatedUser.getId())).thenReturn(Optional.of(authenticatedUser));

        GameImportRequest request = new GameImportRequest();
        request.setGameData(GameExportDto.builder()
                .exportVersion("1.0")
                .game(GameMetadataDto.builder().name("Game").description("").uniformAssignment(false).build())
                .bases(List.of(
                        BaseExportDto.builder()
                                .tempId("base_1")
                                .name("Source")
                                .description("")
                                .lat(1.0)
                                .lng(2.0)
                                .hidden(true)
                                .fixedChallengeTempId("challenge_1")
                                .requirePresenceToSubmit(false)
                                .build()
                ))
                .challenges(List.of(ChallengeExportDto.builder()
                        .tempId("challenge_1")
                        .title("Challenge")
                        .answerType(AnswerType.text)
                        .points(100)
                        .locationBound(true)
                        .unlocksBaseTempId("base_1")
                        .build()))
                .assignments(List.of())
                .teams(List.of())
                .build());

        BadRequestException ex = assertThrows(BadRequestException.class, () -> gameService.importGame(request));
        assertTrue(ex.getMessage().contains("cannot unlock its own fixed base"));
        verify(gameRepository, never()).save(any(Game.class));
    }

    // ── Status transition tests ──────────────────────────────────────

    @Test
    void updateStatusRejectsInvalidStatusString() {
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.setup)
                .createdBy(authenticatedUser).build();
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> gameService.updateStatus(gameId, "invalid_status", false));
        assertTrue(ex.getMessage().contains("Invalid status"));
    }

    @Test
    void updateStatusRejectsSameStatus() {
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.setup)
                .createdBy(authenticatedUser).build();
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> gameService.updateStatus(gameId, "setup", false));
        assertTrue(ex.getMessage().contains("already in"));
    }

    @Test
    void updateStatusRejectsGoingLiveWithNoBases() {
        UUID gameId = UUID.randomUUID();
        Game game = Game.builder().id(gameId).name("G").description("").status(GameStatus.setup)
                .createdBy(authenticatedUser).build();
        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(baseRepository.countByGameId(gameId)).thenReturn(0L);

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> gameService.updateStatus(gameId, "live", false));
        assertTrue(ex.getMessage().contains("at least one base"));
    }
}
