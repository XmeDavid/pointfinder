package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.projection.TeamKeyCount;
import com.prayer.pointfinder.dto.request.TeamVariablesBulkRequest;
import com.prayer.pointfinder.dto.response.TeamVariablesResponse;
import com.prayer.pointfinder.dto.response.VariableCompletenessResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.ChallengeTeamVariableRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.TeamVariableRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TeamVariableServiceTest {

    @Mock
    private TeamVariableRepository teamVariableRepository;
    @Mock
    private ChallengeTeamVariableRepository challengeTeamVariableRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private GameAccessService gameAccessService;

    @InjectMocks
    private TeamVariableService teamVariableService;

    private UUID gameId;
    private UUID challengeId;
    private UUID teamId1;
    private UUID teamId2;
    private Game game;
    private Team team1;
    private Team team2;
    private Challenge challenge;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        challengeId = UUID.randomUUID();
        teamId1 = UUID.randomUUID();
        teamId2 = UUID.randomUUID();

        game = Game.builder()
                .id(gameId)
                .name("Test Game")
                .description("Desc")
                .status(GameStatus.setup)
                .build();

        team1 = Team.builder()
                .id(teamId1)
                .game(game)
                .name("Team Alpha")
                .joinCode("ALPHA1")
                .color("#FF0000")
                .build();

        team2 = Team.builder()
                .id(teamId2)
                .game(game)
                .name("Team Beta")
                .joinCode("BETA1")
                .color("#00FF00")
                .build();

        challenge = Challenge.builder()
                .id(challengeId)
                .game(game)
                .title("Challenge One")
                .description("Desc")
                .content("Content")
                .completionContent("Done")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(10)
                .locationBound(false)
                .build();
    }

    // ── getGameVariables ──────────────────────────────────────────────

    @Test
    void getGameVariables_returnsEmptyResponseWhenNoVariablesExist() {
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        TeamVariablesResponse response = teamVariableService.getGameVariables(gameId);

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        assertTrue(response.getVariables().isEmpty());
    }

    @Test
    void getGameVariables_groupsVariablesByKeyWithTeamValues() {
        TeamVariable var1 = TeamVariable.builder()
                .game(game).team(team1).variableKey("city").variableValue("Lisbon").build();
        TeamVariable var2 = TeamVariable.builder()
                .game(game).team(team2).variableKey("city").variableValue("Porto").build();

        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of(var1, var2));

        TeamVariablesResponse response = teamVariableService.getGameVariables(gameId);

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        assertEquals(1, response.getVariables().size());
        TeamVariablesResponse.VariableDefinition def = response.getVariables().get(0);
        assertEquals("city", def.getKey());
        assertEquals("Lisbon", def.getTeamValues().get(teamId1));
        assertEquals("Porto", def.getTeamValues().get(teamId2));
    }

    @Test
    void getGameVariables_groupsMultipleDistinctKeysIntoSeparateDefinitions() {
        TeamVariable var1 = TeamVariable.builder()
                .game(game).team(team1).variableKey("city").variableValue("Lisbon").build();
        TeamVariable var2 = TeamVariable.builder()
                .game(game).team(team1).variableKey("code").variableValue("ALPHA").build();

        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of(var1, var2));

        TeamVariablesResponse response = teamVariableService.getGameVariables(gameId);

        assertEquals(2, response.getVariables().size());
        List<String> keys = response.getVariables().stream()
                .map(TeamVariablesResponse.VariableDefinition::getKey).toList();
        assertTrue(keys.contains("city"));
        assertTrue(keys.contains("code"));
    }

    @Test
    void getGameVariables_delegatesAccessCheckBeforeFetchingData() {
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        teamVariableService.getGameVariables(gameId);

        // Access check must be called with the exact gameId
        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
    }

    // ── saveGameVariables ─────────────────────────────────────────────

    @Test
    void saveGameVariables_persistsNewVariablesAfterDeletingExisting() {
        TeamVariablesBulkRequest request = buildBulkRequest("score",
                Map.of(teamId1, "100", teamId2, "200"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1, team2));
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        teamVariableService.saveGameVariables(gameId, request);

        verify(teamVariableRepository).deleteByGameId(gameId);
        verify(teamVariableRepository).flush();
        ArgumentCaptor<List<TeamVariable>> captor = ArgumentCaptor.forClass(List.class);
        verify(teamVariableRepository).saveAll(captor.capture());
        List<TeamVariable> saved = captor.getValue();
        assertEquals(2, saved.size());
        assertTrue(saved.stream().allMatch(v -> v.getVariableKey().equals("score")));
        assertTrue(saved.stream().anyMatch(v -> v.getVariableValue().equals("100")));
        assertTrue(saved.stream().anyMatch(v -> v.getVariableValue().equals("200")));
    }

    @Test
    void saveGameVariables_treatsNullTeamValueAsEmptyString() {
        TeamVariablesBulkRequest request = buildBulkRequest("hint",
                Map.of(teamId1, "value"));

        // Override to also include a null-value entry
        TeamVariablesBulkRequest.TeamVariableEntry entry = new TeamVariablesBulkRequest.TeamVariableEntry();
        entry.setKey("hint");
        Map<UUID, String> values = new java.util.HashMap<>();
        values.put(teamId1, null);
        entry.setTeamValues(values);
        request.setVariables(List.of(entry));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        teamVariableService.saveGameVariables(gameId, request);

        ArgumentCaptor<List<TeamVariable>> captor = ArgumentCaptor.forClass(List.class);
        verify(teamVariableRepository).saveAll(captor.capture());
        assertEquals("", captor.getValue().get(0).getVariableValue());
    }

    @Test
    void saveGameVariables_throwsBadRequestExceptionWhenTeamIdNotFound() {
        UUID unknownTeamId = UUID.randomUUID();
        TeamVariablesBulkRequest request = buildBulkRequest("score",
                Map.of(unknownTeamId, "50"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.saveGameVariables(gameId, request));

        assertTrue(ex.getMessage().contains(unknownTeamId.toString()));
        verify(teamVariableRepository, never()).saveAll(anyList());
    }

    @Test
    void saveGameVariables_throwsBadRequestExceptionForInvalidVariableKey_startingWithDigit() {
        TeamVariablesBulkRequest request = buildBulkRequest("1invalid",
                Map.of(teamId1, "value"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.saveGameVariables(gameId, request));

        assertTrue(ex.getMessage().contains("1invalid"));
    }

    @Test
    void saveGameVariables_throwsBadRequestExceptionForInvalidVariableKey_containingHyphen() {
        TeamVariablesBulkRequest request = buildBulkRequest("my-key",
                Map.of(teamId1, "value"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.saveGameVariables(gameId, request));

        assertTrue(ex.getMessage().contains("my-key"));
    }

    @Test
    void saveGameVariables_throwsBadRequestExceptionForInvalidVariableKey_containingSpace() {
        TeamVariablesBulkRequest request = buildBulkRequest("bad key",
                Map.of(teamId1, "value"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.saveGameVariables(gameId, request));

        assertTrue(ex.getMessage().contains("bad key"));
    }

    @Test
    void saveGameVariables_acceptsValidKeyWithUnderscoresAndDigits() {
        TeamVariablesBulkRequest request = buildBulkRequest("score_1",
                Map.of(teamId1, "42"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        assertDoesNotThrow(() -> teamVariableService.saveGameVariables(gameId, request));
        verify(teamVariableRepository).saveAll(anyList());
    }

    @Test
    void saveGameVariables_savesEmptyListWhenNoEntriesProvided() {
        TeamVariablesBulkRequest request = new TeamVariablesBulkRequest();
        request.setVariables(List.of());

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        teamVariableService.saveGameVariables(gameId, request);

        verify(teamVariableRepository).deleteByGameId(gameId);
        ArgumentCaptor<List<TeamVariable>> captor = ArgumentCaptor.forClass(List.class);
        verify(teamVariableRepository).saveAll(captor.capture());
        assertTrue(captor.getValue().isEmpty());
    }

    // ── getChallengeVariables ─────────────────────────────────────────

    @Test
    void getChallengeVariables_returnsEmptyResponseWhenNoneExist() {
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeTeamVariableRepository.findByChallengeId(challengeId)).thenReturn(List.of());

        TeamVariablesResponse response = teamVariableService.getChallengeVariables(gameId, challengeId);

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        assertTrue(response.getVariables().isEmpty());
    }

    @Test
    void getChallengeVariables_groupsVariablesByKeyWithTeamValues() {
        ChallengeTeamVariable var1 = ChallengeTeamVariable.builder()
                .challenge(challenge).team(team1).variableKey("hint").variableValue("Look up").build();
        ChallengeTeamVariable var2 = ChallengeTeamVariable.builder()
                .challenge(challenge).team(team2).variableKey("hint").variableValue("Look down").build();

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(challengeTeamVariableRepository.findByChallengeId(challengeId))
                .thenReturn(List.of(var1, var2));

        TeamVariablesResponse response = teamVariableService.getChallengeVariables(gameId, challengeId);

        assertEquals(1, response.getVariables().size());
        TeamVariablesResponse.VariableDefinition def = response.getVariables().get(0);
        assertEquals("hint", def.getKey());
        assertEquals("Look up", def.getTeamValues().get(teamId1));
        assertEquals("Look down", def.getTeamValues().get(teamId2));
    }

    @Test
    void getChallengeVariables_throwsResourceNotFoundExceptionWhenChallengeDoesNotExist() {
        when(challengeRepository.findById(challengeId)).thenReturn(Optional.empty());

        ResourceNotFoundException ex = assertThrows(ResourceNotFoundException.class,
                () -> teamVariableService.getChallengeVariables(gameId, challengeId));

        assertTrue(ex.getMessage().contains(challengeId.toString()));
    }

    @Test
    void getChallengeVariables_throwsBadRequestExceptionWhenChallengeDoesNotBelongToGame() {
        UUID otherGameId = UUID.randomUUID();
        Game otherGame = Game.builder()
                .id(otherGameId)
                .name("Other Game")
                .description("")
                .status(GameStatus.setup)
                .build();
        Challenge foreignChallenge = Challenge.builder()
                .id(challengeId)
                .game(otherGame)
                .title("Foreign Challenge")
                .description("")
                .content("")
                .completionContent("")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(5)
                .locationBound(false)
                .build();

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(foreignChallenge));
        doThrow(new BadRequestException("Challenge does not belong to this game"))
                .when(gameAccessService).ensureBelongsToGame("Challenge", otherGameId, gameId);

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.getChallengeVariables(gameId, challengeId));

        assertTrue(ex.getMessage().contains("Challenge does not belong to this game"));
    }

    // ── saveChallengeVariables ────────────────────────────────────────

    @Test
    void saveChallengeVariables_persistsNewVariablesAfterDeletingExisting() {
        TeamVariablesBulkRequest request = buildBulkRequest("clue",
                Map.of(teamId1, "East wing", teamId2, "West wing"));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1, team2));
        when(challengeTeamVariableRepository.findByChallengeId(challengeId)).thenReturn(List.of());

        teamVariableService.saveChallengeVariables(gameId, challengeId, request);

        verify(challengeTeamVariableRepository).deleteByChallengeId(challengeId);
        verify(challengeTeamVariableRepository).flush();
        ArgumentCaptor<List<ChallengeTeamVariable>> captor = ArgumentCaptor.forClass(List.class);
        verify(challengeTeamVariableRepository).saveAll(captor.capture());
        List<ChallengeTeamVariable> saved = captor.getValue();
        assertEquals(2, saved.size());
        assertTrue(saved.stream().allMatch(v -> v.getVariableKey().equals("clue")));
        assertTrue(saved.stream().anyMatch(v -> v.getVariableValue().equals("East wing")));
        assertTrue(saved.stream().anyMatch(v -> v.getVariableValue().equals("West wing")));
    }

    @Test
    void saveChallengeVariables_treatsNullTeamValueAsEmptyString() {
        TeamVariablesBulkRequest.TeamVariableEntry entry = new TeamVariablesBulkRequest.TeamVariableEntry();
        entry.setKey("clue");
        Map<UUID, String> values = new java.util.HashMap<>();
        values.put(teamId1, null);
        entry.setTeamValues(values);
        TeamVariablesBulkRequest request = new TeamVariablesBulkRequest();
        request.setVariables(List.of(entry));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));
        when(challengeTeamVariableRepository.findByChallengeId(challengeId)).thenReturn(List.of());

        teamVariableService.saveChallengeVariables(gameId, challengeId, request);

        ArgumentCaptor<List<ChallengeTeamVariable>> captor = ArgumentCaptor.forClass(List.class);
        verify(challengeTeamVariableRepository).saveAll(captor.capture());
        assertEquals("", captor.getValue().get(0).getVariableValue());
    }

    @Test
    void saveChallengeVariables_throwsBadRequestExceptionWhenTeamIdNotFound() {
        UUID unknownTeamId = UUID.randomUUID();
        TeamVariablesBulkRequest request = buildBulkRequest("clue",
                Map.of(unknownTeamId, "hint text"));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.saveChallengeVariables(gameId, challengeId, request));

        assertTrue(ex.getMessage().contains(unknownTeamId.toString()));
        verify(challengeTeamVariableRepository, never()).saveAll(anyList());
    }

    @Test
    void saveChallengeVariables_throwsBadRequestExceptionForInvalidVariableKey() {
        TeamVariablesBulkRequest request = buildBulkRequest("invalid-key",
                Map.of(teamId1, "value"));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.saveChallengeVariables(gameId, challengeId, request));

        assertTrue(ex.getMessage().contains("invalid-key"));
    }

    @Test
    void saveChallengeVariables_throwsResourceNotFoundExceptionWhenChallengeDoesNotExist() {
        TeamVariablesBulkRequest request = buildBulkRequest("clue",
                Map.of(teamId1, "value"));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> teamVariableService.saveChallengeVariables(gameId, challengeId, request));
    }

    @Test
    void saveChallengeVariables_linksEachVariableToTheChallengeEntity() {
        TeamVariablesBulkRequest request = buildBulkRequest("secret",
                Map.of(teamId1, "X47"));

        when(challengeRepository.findById(challengeId)).thenReturn(Optional.of(challenge));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));
        when(challengeTeamVariableRepository.findByChallengeId(challengeId)).thenReturn(List.of());

        teamVariableService.saveChallengeVariables(gameId, challengeId, request);

        ArgumentCaptor<List<ChallengeTeamVariable>> captor = ArgumentCaptor.forClass(List.class);
        verify(challengeTeamVariableRepository).saveAll(captor.capture());
        ChallengeTeamVariable saved = captor.getValue().get(0);
        assertEquals(challenge, saved.getChallenge());
        assertEquals(team1, saved.getTeam());
    }

    // ── checkCompleteness ─────────────────────────────────────────────

    @Test
    void checkCompleteness_returnsCompleteWhenNoTeamsExist() {
        when(teamRepository.countByGameId(gameId)).thenReturn(0L);

        VariableCompletenessResponse response = teamVariableService.checkCompleteness(gameId);

        verify(gameAccessService).ensureCurrentUserCanAccessGame(gameId);
        assertTrue(response.isComplete());
        assertTrue(response.getErrors().isEmpty());
    }

    @Test
    void checkCompleteness_returnsCompleteWhenAllVariablesArePresentForAllTeams() {
        when(teamRepository.countByGameId(gameId)).thenReturn(2L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId))
                .thenReturn(List.of(new TeamKeyCount("city", 2L)));
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());

        VariableCompletenessResponse response = teamVariableService.checkCompleteness(gameId);

        assertTrue(response.isComplete());
        assertTrue(response.getErrors().isEmpty());
    }

    @Test
    void checkCompleteness_returnsErrorWhenGameVariableMissingForSomeTeams() {
        when(teamRepository.countByGameId(gameId)).thenReturn(3L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId))
                .thenReturn(List.of(new TeamKeyCount("city", 2L)));
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());

        VariableCompletenessResponse response = teamVariableService.checkCompleteness(gameId);

        assertFalse(response.isComplete());
        assertEquals(1, response.getErrors().size());
        String error = response.getErrors().get(0);
        assertTrue(error.contains("city"));
        assertTrue(error.contains("1 team(s)"));
    }

    @Test
    void checkCompleteness_returnsErrorWhenChallengeVariableMissingForSomeTeams() {
        ChallengeTeamVariable var1 = ChallengeTeamVariable.builder()
                .challenge(challenge).team(team1).variableKey("clue").variableValue("A").build();

        when(teamRepository.countByGameId(gameId)).thenReturn(2L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId)).thenReturn(List.of());
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of(var1));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(challenge));

        VariableCompletenessResponse response = teamVariableService.checkCompleteness(gameId);

        assertFalse(response.isComplete());
        assertEquals(1, response.getErrors().size());
        String error = response.getErrors().get(0);
        assertTrue(error.contains("Challenge One"));
        assertTrue(error.contains("clue"));
        assertTrue(error.contains("1 team(s)"));
    }

    @Test
    void checkCompleteness_returnsMultipleErrorsWhenSeveralVariablesMissing() {
        when(teamRepository.countByGameId(gameId)).thenReturn(2L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId)).thenReturn(List.of(
                new TeamKeyCount("city", 1L),
                new TeamKeyCount("code", 0L)
        ));
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());

        VariableCompletenessResponse response = teamVariableService.checkCompleteness(gameId);

        assertFalse(response.isComplete());
        assertEquals(2, response.getErrors().size());
    }

    @Test
    void checkCompleteness_usesUnknownTitleWhenChallengeNotFoundInRepository() {
        UUID unknownChallengeId = UUID.randomUUID();
        // Build a challenge object whose ID is not in challengeRepository.findByGameId
        Challenge orphanChallenge = Challenge.builder()
                .id(unknownChallengeId)
                .game(game)
                .title("Orphan")
                .description("")
                .content("")
                .completionContent("")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(5)
                .locationBound(false)
                .build();

        ChallengeTeamVariable var1 = ChallengeTeamVariable.builder()
                .challenge(orphanChallenge).team(team1).variableKey("clue").variableValue("A").build();

        when(teamRepository.countByGameId(gameId)).thenReturn(2L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId)).thenReturn(List.of());
        // challengeRepository.findByGameId returns an empty list, so the title lookup misses
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of(var1));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());

        VariableCompletenessResponse response = teamVariableService.checkCompleteness(gameId);

        assertFalse(response.isComplete());
        String error = response.getErrors().get(0);
        assertTrue(error.contains("Unknown"));
    }

    // ── validateVariableCompleteness (public) ─────────────────────────

    @Test
    void validateVariableCompleteness_returnsEmptyListWhenZeroTeams() {
        when(teamRepository.countByGameId(gameId)).thenReturn(0L);

        List<String> errors = teamVariableService.validateVariableCompleteness(gameId);

        assertTrue(errors.isEmpty());
        // Repositories for variables should not be queried when there are no teams
        verifyNoInteractions(teamVariableRepository);
        verifyNoInteractions(challengeTeamVariableRepository);
    }

    @Test
    void validateVariableCompleteness_returnsNoErrorsWhenAllGameVariablesComplete() {
        when(teamRepository.countByGameId(gameId)).thenReturn(2L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId))
                .thenReturn(List.of(new TeamKeyCount("region", 2L)));
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());

        List<String> errors = teamVariableService.validateVariableCompleteness(gameId);

        assertTrue(errors.isEmpty());
    }

    @Test
    void validateVariableCompleteness_reportsCorrectMissingCountForGameVariable() {
        when(teamRepository.countByGameId(gameId)).thenReturn(4L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId))
                .thenReturn(List.of(new TeamKeyCount("region", 2L)));
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());

        List<String> errors = teamVariableService.validateVariableCompleteness(gameId);

        assertEquals(1, errors.size());
        // 4 teams total - 2 present = 2 missing
        assertTrue(errors.get(0).contains("2 team(s)"));
    }

    @Test
    void validateVariableCompleteness_doesNotReportErrorWhenAllTeamsCoveredForChallengeVariable() {
        ChallengeTeamVariable var1 = ChallengeTeamVariable.builder()
                .challenge(challenge).team(team1).variableKey("secret").variableValue("A").build();
        ChallengeTeamVariable var2 = ChallengeTeamVariable.builder()
                .challenge(challenge).team(team2).variableKey("secret").variableValue("B").build();

        when(teamRepository.countByGameId(gameId)).thenReturn(2L);
        when(teamVariableRepository.countTeamsPerKeyByGameId(gameId)).thenReturn(List.of());
        when(challengeTeamVariableRepository.findByGameId(gameId)).thenReturn(List.of(var1, var2));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(challenge));

        List<String> errors = teamVariableService.validateVariableCompleteness(gameId);

        assertTrue(errors.isEmpty());
    }

    // ── Key validation edge cases ─────────────────────────────────────

    @Test
    void saveGameVariables_acceptsSingleLetterKey() {
        TeamVariablesBulkRequest request = buildBulkRequest("x", Map.of(teamId1, "val"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        assertDoesNotThrow(() -> teamVariableService.saveGameVariables(gameId, request));
    }

    @Test
    void saveGameVariables_throwsBadRequestExceptionForKeyWithLeadingUnderscore() {
        TeamVariablesBulkRequest request = buildBulkRequest("_badKey", Map.of(teamId1, "val"));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> teamVariableService.saveGameVariables(gameId, request));

        assertTrue(ex.getMessage().contains("_badKey"));
    }

    @Test
    void saveGameVariables_supportsMultipleEntriesWithDifferentKeys() {
        TeamVariablesBulkRequest request = new TeamVariablesBulkRequest();

        TeamVariablesBulkRequest.TeamVariableEntry entry1 = new TeamVariablesBulkRequest.TeamVariableEntry();
        entry1.setKey("city");
        entry1.setTeamValues(Map.of(teamId1, "Lisbon"));

        TeamVariablesBulkRequest.TeamVariableEntry entry2 = new TeamVariablesBulkRequest.TeamVariableEntry();
        entry2.setKey("code");
        entry2.setTeamValues(Map.of(teamId1, "ALPHA"));

        request.setVariables(List.of(entry1, entry2));

        when(gameAccessService.getAccessibleGame(gameId)).thenReturn(game);
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(team1));
        when(teamVariableRepository.findByGameId(gameId)).thenReturn(List.of());

        teamVariableService.saveGameVariables(gameId, request);

        ArgumentCaptor<List<TeamVariable>> captor = ArgumentCaptor.forClass(List.class);
        verify(teamVariableRepository).saveAll(captor.capture());
        assertEquals(2, captor.getValue().size());
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private TeamVariablesBulkRequest buildBulkRequest(String key, Map<UUID, String> teamValues) {
        TeamVariablesBulkRequest.TeamVariableEntry entry = new TeamVariablesBulkRequest.TeamVariableEntry();
        entry.setKey(key);
        entry.setTeamValues(teamValues);
        TeamVariablesBulkRequest request = new TeamVariablesBulkRequest();
        request.setVariables(List.of(entry));
        return request;
    }
}
