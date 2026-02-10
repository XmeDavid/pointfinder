package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateSubmissionRequest;
import com.dbv.scoutmission.dto.response.SubmissionResponse;
import com.dbv.scoutmission.entity.*;
import com.dbv.scoutmission.repository.*;
import com.dbv.scoutmission.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubmissionServiceTest {

    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private BaseRepository baseRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ActivityEventRepository activityEventRepository;
    @Mock
    private GameEventBroadcaster eventBroadcaster;
    @Mock
    private GameAccessService gameAccessService;
    @Mock
    private FileStorageService fileStorageService;
    @Mock
    private PlayerRepository playerRepository;

    @InjectMocks
    private SubmissionService submissionService;

    private UUID gameId;
    private UUID teamId;
    private UUID challengeId;
    private UUID baseId;
    private Team team;
    private Challenge challenge;
    private Base base;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        teamId = UUID.randomUUID();
        challengeId = UUID.randomUUID();
        baseId = UUID.randomUUID();

        Game game = Game.builder()
                .id(gameId)
                .name("Camporee")
                .description("Desc")
                .status(GameStatus.live)
                .build();

        team = Team.builder()
                .id(teamId)
                .game(game)
                .name("Pathfinders")
                .joinCode("ABC1234")
                .color("#123456")
                .build();

        challenge = Challenge.builder()
                .id(challengeId)
                .game(game)
                .title("Challenge")
                .description("Desc")
                .content("Content")
                .completionContent("Done")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(50)
                .locationBound(false)
                .build();

        base = Base.builder()
                .id(baseId)
                .game(game)
                .name("Base")
                .description("Desc")
                .lat(1.0)
                .lng(2.0)
                .nfcLinked(true)
                .build();

        User operator = User.builder()
                .id(UUID.randomUUID())
                .email("operator@example.com")
                .name("Operator")
                .passwordHash("hash")
                .role(UserRole.operator)
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null)
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createSubmissionReturnsExistingRecordWhenIdempotencySaveRaces() {
        UUID idempotencyKey = UUID.randomUUID();
        UUID existingSubmissionId = UUID.randomUUID();

        CreateSubmissionRequest request = new CreateSubmissionRequest();
        request.setTeamId(teamId);
        request.setChallengeId(challengeId);
        request.setBaseId(baseId);
        request.setAnswer("answer");
        request.setIdempotencyKey(idempotencyKey);

        Submission existing = Submission.builder()
                .id(existingSubmissionId)
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer("answer")
                .status(SubmissionStatus.pending)
                .submittedAt(Instant.now())
                .idempotencyKey(idempotencyKey)
                .build();

        when(submissionRepository.findByIdempotencyKey(idempotencyKey))
                .thenReturn(Optional.empty(), Optional.of(existing));
        when(fileStorageService.validateStoredFileUrl(null, gameId)).thenReturn(null);
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(submissionRepository.save(any(Submission.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key value"));

        SubmissionResponse response = submissionService.createSubmission(gameId, request);

        assertEquals(existingSubmissionId, response.getId());
        verify(submissionRepository, times(2)).findByIdempotencyKey(idempotencyKey);
    }

    @Test
    void createSubmissionPersistsValidatedFileUrl() {
        String rawFileUrl = "/uploads/" + gameId + "/" + UUID.randomUUID() + ".jpg";
        String normalizedFileUrl = rawFileUrl;
        UUID createdSubmissionId = UUID.randomUUID();

        CreateSubmissionRequest request = new CreateSubmissionRequest();
        request.setTeamId(teamId);
        request.setChallengeId(challengeId);
        request.setBaseId(baseId);
        request.setAnswer("answer");
        request.setFileUrl(rawFileUrl);

        when(fileStorageService.validateStoredFileUrl(rawFileUrl, gameId)).thenReturn(normalizedFileUrl);
        when(teamRepository.findById(teamId)).thenReturn(Optional.of(team));
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(baseRepository.findById(baseId)).thenReturn(Optional.of(base));
        when(submissionRepository.save(any(Submission.class))).thenAnswer(invocation -> {
            Submission saved = invocation.getArgument(0);
            saved.setId(createdSubmissionId);
            saved.setSubmittedAt(Instant.now());
            return saved;
        });

        SubmissionResponse response = submissionService.createSubmission(gameId, request);

        ArgumentCaptor<Submission> submissionCaptor = ArgumentCaptor.forClass(Submission.class);
        verify(submissionRepository).save(submissionCaptor.capture());
        assertEquals(normalizedFileUrl, submissionCaptor.getValue().getFileUrl());
        assertEquals(createdSubmissionId, response.getId());
        verify(fileStorageService).validateStoredFileUrl(eq(rawFileUrl), eq(gameId));
    }
}
