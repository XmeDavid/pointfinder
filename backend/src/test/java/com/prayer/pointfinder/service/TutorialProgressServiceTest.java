package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.UpdateTutorialProgressRequest;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tutorial progress is per account, upsert-only, and isolated between
 * operators. Restart is expressed as "in_progress with no current step".
 */
class TutorialProgressServiceTest extends IntegrationTestBase {

    @Autowired
    private TutorialProgressService tutorialProgressService;

    @Autowired
    private UserTutorialProgressRepository progressRepository;

    @BeforeEach
    void clearProgress() {
        progressRepository.deleteAll();
    }

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private User authenticate(String email) {
        User operator = createOperator(email, "password");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        return operator;
    }

    private UpdateTutorialProgressRequest body(String status, String currentStep, UUID gameId) {
        UpdateTutorialProgressRequest request = new UpdateTutorialProgressRequest();
        request.setStatus(status);
        request.setCurrentStep(currentStep);
        request.setGameId(gameId);
        return request;
    }

    @Test
    void listIsEmptyForAnOperatorWhoNeverStartedATutorial() {
        authenticate("tut-empty@test.com");

        assertEquals(List.of(), tutorialProgressService.listForCurrentUser());
    }

    @Test
    void upsertCreatesTheRowAndListReturnsIt() {
        authenticate("tut-create@test.com");

        TutorialProgressResponse created = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "place-base", null));

        assertEquals("first-game", created.scenarioId());
        assertEquals("in_progress", created.status());
        assertEquals("place-base", created.currentStep());
        assertNull(created.completedAt());
        assertNotNull(created.startedAt());

        List<TutorialProgressResponse> rows = tutorialProgressService.listForCurrentUser();
        assertEquals(1, rows.size());
        assertEquals("first-game", rows.get(0).scenarioId());
        assertEquals("place-base", rows.get(0).currentStep());
    }

    @Test
    void upsertUpdatesTheSameRowRatherThanAddingAnother() {
        authenticate("tut-update@test.com");
        tutorialProgressService.upsertForCurrentUser("first-game", body("in_progress", "place-base", null));

        tutorialProgressService.upsertForCurrentUser("first-game", body("in_progress", "go-live", null));

        List<TutorialProgressResponse> rows = tutorialProgressService.listForCurrentUser();
        assertEquals(1, rows.size());
        assertEquals("go-live", rows.get(0).currentStep());
    }

    @Test
    void completedStampsCompletedAt() {
        authenticate("tut-complete@test.com");
        tutorialProgressService.upsertForCurrentUser("first-game", body("in_progress", "finish", null));

        TutorialProgressResponse done = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("completed", "finish", null));

        assertEquals("completed", done.status());
        assertNotNull(done.completedAt());
    }

    @Test
    void restartResetsStartedAtAndClearsCompletedAt() throws Exception {
        authenticate("tut-restart@test.com");
        TutorialProgressResponse first = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "orient", null));
        tutorialProgressService.upsertForCurrentUser("first-game", body("completed", "finish", null));

        Thread.sleep(5);
        TutorialProgressResponse restarted = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", null, null));

        assertEquals("in_progress", restarted.status());
        assertNull(restarted.currentStep());
        assertNull(restarted.completedAt());
        assertTrue(restarted.startedAt().isAfter(first.startedAt()),
                "restart must reset startedAt, was " + restarted.startedAt() + " vs " + first.startedAt());
    }

    @Test
    void advancingAnExistingRunKeepsTheOriginalStartedAt() {
        authenticate("tut-keep-start@test.com");
        TutorialProgressResponse first = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "orient", null));

        TutorialProgressResponse later = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("in_progress", "go-live", null));

        assertEquals(first.startedAt(), later.startedAt());
    }

    @Test
    void skippedIsStoredAndCarriesNoCompletionTime() {
        authenticate("tut-skip@test.com");

        TutorialProgressResponse skipped = tutorialProgressService.upsertForCurrentUser(
                "first-game", body("skipped", null, null));

        assertEquals("skipped", skipped.status());
        assertNull(skipped.completedAt());
    }

    @Test
    void gameIdIsRoundTripped() {
        User operator = authenticate("tut-game@test.com");
        UUID gameId = createGame(operator, "Tutorial Game", GameStatus.setup).getId();

        TutorialProgressResponse row = tutorialProgressService.upsertForCurrentUser(
                "fixed-route", body("in_progress", "arrange", gameId));

        assertEquals(gameId, row.gameId());
        assertEquals(gameId, tutorialProgressService.listForCurrentUser().get(0).gameId());
    }

    @Test
    void unknownScenarioIsRejected() {
        authenticate("tut-unknown-scenario@test.com");

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> tutorialProgressService.upsertForCurrentUser("not-a-tutorial", body("in_progress", null, null)));

        assertEquals(ErrorCode.TUTORIAL_SCENARIO_UNKNOWN, ex.getErrorCode());
    }

    @Test
    void unknownStatusIsRejected() {
        authenticate("tut-unknown-status@test.com");

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> tutorialProgressService.upsertForCurrentUser("first-game", body("paused", null, null)));

        assertEquals(ErrorCode.TUTORIAL_STATUS_UNKNOWN, ex.getErrorCode());
    }

    @Test
    void everyKnownScenarioIsAccepted() {
        authenticate("tut-allowlist@test.com");

        for (String scenarioId : TutorialProgressService.KNOWN_SCENARIOS) {
            assertEquals(scenarioId,
                    tutorialProgressService.upsertForCurrentUser(scenarioId, body("in_progress", null, null))
                            .scenarioId());
        }
        assertEquals(3, tutorialProgressService.listForCurrentUser().size());
    }

    @Test
    void oneOperatorNeverSeesAnother() {
        authenticate("tut-isolation-a@test.com");
        tutorialProgressService.upsertForCurrentUser("first-game", body("completed", "finish", null));
        SecurityContextHolder.clearContext();

        authenticate("tut-isolation-b@test.com");

        assertEquals(List.of(), tutorialProgressService.listForCurrentUser());
    }
}
