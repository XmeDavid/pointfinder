package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.dto.request.ReviewSubmissionRequest;
import com.prayer.pointfinder.dto.request.UpdateGameStatusRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.dto.request.ReviewStatus;
import com.prayer.pointfinder.entity.Stage;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.TransitionType;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.StageRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-21: a trigger stage opens when any team completes its trigger base, and
 * only then. Completion means an approved submission; a pending or rejected
 * one leaves the stage closed.
 */
class StageTriggerIntegrationTest extends IntegrationTestBase {

    @Autowired private StageRepository stageRepository;

    private record Setup(UUID gameId, UUID stageTwoId, UUID baseId, UUID challengeId, UUID teamId, HttpHeaders operator, HttpHeaders player) {}

    private Setup liveGameWithTriggerStage(String tag) {
        return liveGameWithTriggerStage(tag, com.prayer.pointfinder.entity.UnlockTrigger.COMPLETED);
    }

    private Setup liveGameWithTriggerStage(String tag, com.prayer.pointfinder.entity.UnlockTrigger unlockTrigger) {
        User operator = createOperator("trigger-" + tag + "@test.com", "Password1");
        Game game = createGame(operator, "Trigger " + tag, GameStatus.setup);
        game.setUnlockTrigger(unlockTrigger);
        game = gameRepository.save(game);
        Base gate = createBase(game, "Gate " + tag);
        Challenge challenge = createChallenge(game, "Open the gate", AnswerType.text, 10);
        Team team = createTeam(game, "Falcons", "TRG" + tag.toUpperCase());
        HttpHeaders operatorHeaders = headersWithAuth(operatorAuthHeader(operator));
        // Going live through the API assigns the challenge to the base, as an operator would.
        UpdateGameStatusRequest goLive = new UpdateGameStatusRequest();
        goLive.setStatus("live");
        assertEquals(HttpStatus.OK, restTemplate.exchange("/api/games/" + game.getId() + "/status", HttpMethod.PATCH,
                new HttpEntity<>(goLive, operatorHeaders), GameResponse.class).getStatusCode());
        stageRepository.save(Stage.builder().game(game).name("Explore").orderIndex(0)
                .transitionType(TransitionType.manual).isActive(true).build());
        Stage second = stageRepository.save(Stage.builder().game(game).name("Race").orderIndex(1)
                .transitionType(TransitionType.trigger).triggerBaseId(gate.getId()).isActive(false).build());

        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode("TRG" + tag.toUpperCase());
        join.setDisplayName("Scout");
        join.setDeviceId("trigger-device-" + tag);
        ResponseEntity<PlayerAuthResponse> joined = restTemplate.postForEntity("/api/auth/player/join", join, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, joined.getStatusCode());
        HttpHeaders player = headersWithAuth("Bearer " + joined.getBody().token());
        restTemplate.exchange("/api/player/games/" + game.getId() + "/bases/" + gate.getId() + "/check-in",
                HttpMethod.POST, new HttpEntity<>(checkInRequestFor(gate), player), CheckInResponse.class);
        return new Setup(game.getId(), second.getId(), gate.getId(), challenge.getId(), team.getId(), operatorHeaders, player);
    }

    private SubmissionResponse submit(Setup s, String answer) {
        PlayerSubmissionRequest request = new PlayerSubmissionRequest();
        request.setBaseId(s.baseId());
        request.setChallengeId(s.challengeId());
        request.setAnswer(answer);
        ResponseEntity<SubmissionResponse> response = restTemplate.exchange("/api/player/games/" + s.gameId() + "/submissions",
                HttpMethod.POST, new HttpEntity<>(request, s.player()), SubmissionResponse.class);
        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        return response.getBody();
    }

    private void review(Setup s, UUID submissionId, ReviewStatus status) {
        ReviewSubmissionRequest request = new ReviewSubmissionRequest();
        request.setStatus(status);
        request.setPoints(10);
        ResponseEntity<SubmissionResponse> response = restTemplate.exchange(
                "/api/games/" + s.gameId() + "/submissions/" + submissionId + "/review",
                HttpMethod.PATCH, new HttpEntity<>(request, s.operator()), SubmissionResponse.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    private boolean active(UUID stageId) {
        return Boolean.TRUE.equals(stageRepository.findById(stageId).orElseThrow().getIsActive());
    }

    @Test
    void approvingTheTriggerBaseSubmissionOpensTheStage() {
        Setup s = liveGameWithTriggerStage("one");
        SubmissionResponse pending = submit(s, "the key");
        assertEquals("pending", pending.status());
        assertFalse(active(s.stageTwoId()), "a pending submission is not a completion");

        review(s, pending.id(), ReviewStatus.approved);

        assertTrue(active(s.stageTwoId()), "the approved completion opened the trigger stage");
    }

    @Test
    void anAutoValidatedCorrectAnswerOpensTheStageWithoutReview() {
        Setup s = liveGameWithTriggerStage("auto");
        Challenge challenge = challengeRepository.findById(s.challengeId()).orElseThrow();
        challenge.setCorrectAnswer(java.util.List.of("the key"));
        challenge.setAutoValidate(true);
        challengeRepository.save(challenge);

        SubmissionResponse result = submit(s, "The Key");

        assertEquals("correct", result.status());
        assertTrue(active(s.stageTwoId()), "auto-validation is a completion too");
    }

    @Test
    void anOperatorMarkingTheBaseCompleteOpensTheStage() {
        Setup s = liveGameWithTriggerStage("mark");
        Map<String, Object> body = Map.of("challengeId", s.challengeId(), "reason", "tag broken, team was there");
        ResponseEntity<String> marked = restTemplate.exchange(
                "/api/games/" + s.gameId() + "/teams/" + s.teamId() + "/bases/" + s.baseId() + "/mark-completed",
                HttpMethod.POST, new HttpEntity<>(body, s.operator()), String.class);
        assertEquals(HttpStatus.CREATED, marked.getStatusCode(), marked.getBody());

        assertTrue(active(s.stageTwoId()));
    }

    @Test
    void aCheckInOpensTheStageOnlyWhenTheGameUnlocksOnCheckIn() {
        Setup s = liveGameWithTriggerStage("chk", com.prayer.pointfinder.entity.UnlockTrigger.CHECK_IN);
        assertTrue(active(s.stageTwoId()), "the setup check-in completed the trigger base for a check-in game");

        Setup t = liveGameWithTriggerStage("sub", com.prayer.pointfinder.entity.UnlockTrigger.SUBMISSION);
        assertFalse(active(t.stageTwoId()), "a check-in is not a completion when the game unlocks on submission");
    }

    @Test
    void rejectingTheSubmissionLeavesTheStageClosed() {
        Setup s = liveGameWithTriggerStage("two");
        SubmissionResponse pending = submit(s, "wrong");

        review(s, pending.id(), ReviewStatus.rejected);

        assertFalse(active(s.stageTwoId()));
    }
}
