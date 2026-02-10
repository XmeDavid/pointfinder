package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.export.BaseExportDto;
import com.dbv.scoutmission.dto.export.ChallengeExportDto;
import com.dbv.scoutmission.dto.export.GameExportDto;
import com.dbv.scoutmission.dto.export.GameMetadataDto;
import com.dbv.scoutmission.dto.request.GameImportRequest;
import com.dbv.scoutmission.dto.response.GameResponse;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.exception.BadRequestException;
import com.dbv.scoutmission.repository.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
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

    @InjectMocks
    private GameService gameService;

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
}
