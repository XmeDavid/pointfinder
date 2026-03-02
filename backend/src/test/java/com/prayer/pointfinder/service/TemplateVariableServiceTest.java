package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.ChallengeTeamVariable;
import com.prayer.pointfinder.entity.TeamVariable;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.repository.ChallengeTeamVariableRepository;
import com.prayer.pointfinder.repository.TeamVariableRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TemplateVariableServiceTest {

    @Mock
    private TeamVariableRepository teamVariableRepository;
    @Mock
    private ChallengeTeamVariableRepository challengeTeamVariableRepository;

    @InjectMocks
    private TemplateVariableService service;

    private UUID gameId;
    private UUID challengeId;
    private UUID teamId;
    private Game game;
    private Team team;
    private Challenge challenge;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        challengeId = UUID.randomUUID();
        teamId = UUID.randomUUID();
        game = Game.builder().id(gameId).build();
        team = Team.builder().id(teamId).build();
        challenge = Challenge.builder().id(challengeId).game(game).build();
    }

    @Test
    void resolveTemplate_nullTemplate_returnsNull() {
        assertNull(service.resolveTemplate(null, gameId, challengeId, teamId));
    }

    @Test
    void resolveTemplate_emptyTemplate_returnsEmpty() {
        assertEquals("", service.resolveTemplate("", gameId, challengeId, teamId));
    }

    @Test
    void resolveTemplate_noVariables_returnsUnchanged() {
        String template = "Hello, this has no variables.";
        assertEquals(template, service.resolveTemplate(template, gameId, challengeId, teamId));
    }

    @Test
    void resolveTemplate_basicReplacement() {
        when(teamVariableRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of(
                        TeamVariable.builder().game(game).team(team)
                                .variableKey("region").variableValue("North").build()
                ));
        when(challengeTeamVariableRepository.findByChallengeIdAndTeamId(challengeId, teamId))
                .thenReturn(List.of());

        String result = service.resolveTemplate("Go to the {{region}} sector!", gameId, challengeId, teamId);
        assertEquals("Go to the North sector!", result);
    }

    @Test
    void resolveTemplate_multipleVariables() {
        when(teamVariableRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of(
                        TeamVariable.builder().game(game).team(team)
                                .variableKey("city").variableValue("Lisbon").build(),
                        TeamVariable.builder().game(game).team(team)
                                .variableKey("code").variableValue("ALPHA").build()
                ));
        when(challengeTeamVariableRepository.findByChallengeIdAndTeamId(challengeId, teamId))
                .thenReturn(List.of());

        String result = service.resolveTemplate("City: {{city}}, Code: {{code}}", gameId, challengeId, teamId);
        assertEquals("City: Lisbon, Code: ALPHA", result);
    }

    @Test
    void resolveTemplate_challengeLevelOverridesGameLevel() {
        when(teamVariableRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of(
                        TeamVariable.builder().game(game).team(team)
                                .variableKey("secret").variableValue("game-level").build()
                ));
        when(challengeTeamVariableRepository.findByChallengeIdAndTeamId(challengeId, teamId))
                .thenReturn(List.of(
                        ChallengeTeamVariable.builder().challenge(challenge).team(team)
                                .variableKey("secret").variableValue("challenge-level").build()
                ));

        String result = service.resolveTemplate("Secret: {{secret}}", gameId, challengeId, teamId);
        assertEquals("Secret: challenge-level", result);
    }

    @Test
    void resolveTemplate_missingVariable_leftAsIs() {
        when(teamVariableRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of());
        when(challengeTeamVariableRepository.findByChallengeIdAndTeamId(challengeId, teamId))
                .thenReturn(List.of());

        String result = service.resolveTemplate("Value: {{unknown}}", gameId, challengeId, teamId);
        assertEquals("Value: {{unknown}}", result);
    }

    @Test
    void resolveTemplate_htmlContent() {
        when(teamVariableRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of(
                        TeamVariable.builder().game(game).team(team)
                                .variableKey("coords").variableValue("41.15N, 8.63W").build()
                ));
        when(challengeTeamVariableRepository.findByChallengeIdAndTeamId(challengeId, teamId))
                .thenReturn(List.of());

        String result = service.resolveTemplate("<p>Go to <b>{{coords}}</b></p>", gameId, challengeId, teamId);
        assertEquals("<p>Go to <b>41.15N, 8.63W</b></p>", result);
    }

    @Test
    void resolveTemplate_nullChallengeId_onlyUsesGameLevel() {
        when(teamVariableRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of(
                        TeamVariable.builder().game(game).team(team)
                                .variableKey("mascot").variableValue("Eagle").build()
                ));

        String result = service.resolveTemplate("Team {{mascot}}", gameId, null, teamId);
        assertEquals("Team Eagle", result);
    }

    @Test
    void resolveTemplates_list() {
        when(teamVariableRepository.findByGameIdAndTeamId(gameId, teamId))
                .thenReturn(List.of(
                        TeamVariable.builder().game(game).team(team)
                                .variableKey("code").variableValue("PHOENIX").build()
                ));
        when(challengeTeamVariableRepository.findByChallengeIdAndTeamId(challengeId, teamId))
                .thenReturn(List.of());

        List<String> result = service.resolveTemplates(
                List.of("{{code}}", "static answer"), gameId, challengeId, teamId);
        assertEquals(List.of("PHOENIX", "static answer"), result);
    }

    @Test
    void resolveTemplates_nullList_returnsNull() {
        assertNull(service.resolveTemplates(null, gameId, challengeId, teamId));
    }
}
