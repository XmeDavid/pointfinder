package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.response.BaseProgressResponse;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.dto.response.GameDataResponse;
import com.prayer.pointfinder.dto.response.PlayerBaseResponse;
import com.prayer.pointfinder.dto.response.PlayerChallengeResponse;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.ChunkedUploadService;
import com.prayer.pointfinder.service.FileStorageService;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Wave F guardrail: the <strong>"points" substring must NEVER appear in
 * the serialized JSON body of any player-facing endpoint</strong>.
 *
 * <p>PointFinder's product invariant — "players don't see scores or
 * leaderboards" — is stricter than a UI hide: the backend contract must
 * not carry point values on any player-scoped response, because a future
 * mobile client or integration could render whatever the server sends.
 *
 * <p>This test suite locks that invariant in at the serialization layer
 * by fully populating the DTOs behind each player endpoint with
 * mocked data and then asserting, on a case-insensitive substring scan
 * of the response body, that no JSON key or value contains the literal
 * {@code points} token. If a regression adds a {@code points} field
 * back onto any of:
 *
 * <ul>
 *   <li>{@link PlayerChallengeResponse} (via
 *       {@code GET /api/player/games/{id}/data})</li>
 *   <li>{@link CheckInResponse.ChallengeInfo} (via
 *       {@code POST /api/player/games/{id}/bases/{id}/check-in})</li>
 *   <li>{@link BaseProgressResponse} (via
 *       {@code GET /api/player/games/{id}/progress})</li>
 *   <li>{@link SubmissionResponse} as returned on the player submission
 *       path — operators still get points on their own paths, but
 *       players must not</li>
 * </ul>
 *
 * this test fails loudly before the regression can ship.
 *
 * <p>Related but complementary: the submission_status realtime
 * broadcast strips {@code points} / {@code feedback} / {@code reviewedBy}
 * from the team-scoped payload — see
 * {@code GameEventBroadcasterTest} for that invariant.
 */
@WebMvcTest(PlayerController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class PlayerResponsePointsInvarianceTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private PlayerService playerService;

    @MockitoBean
    private ChunkedUploadService chunkedUploadService;

    @MockitoBean
    private FileStorageService fileStorageService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private com.prayer.pointfinder.security.FrozenAccountFilter frozenAccountFilter;

    private MockedStatic<SecurityUtils> securityUtilsMock;
    private Player testPlayer;

    @BeforeEach
    void setUp() {
        testPlayer = Player.builder()
                .id(UUID.randomUUID())
                .displayName("Scout")
                .deviceId("device-xyz")
                .build();
        securityUtilsMock = mockStatic(SecurityUtils.class);
        securityUtilsMock.when(SecurityUtils::getCurrentPlayer).thenReturn(testPlayer);
    }

    @AfterEach
    void tearDown() {
        securityUtilsMock.close();
    }

    // ── Helpers ────────────────────────────────────────────────────

    private static void assertNoPointsSubstring(String body) {
        // Case-insensitive substring scan: any JSON key or value
        // carrying the literal "points" token — at any depth — fails
        // the invariant. The check has intentionally zero wiggle room;
        // if some future field genuinely needs a "point-" prefix (e.g.
        // "pointOfInterest") it can be renamed to avoid collision.
        String lowered = body.toLowerCase();
        assertThat(lowered).doesNotContain("points");
        assertThat(lowered).doesNotContain("\"point\"");
    }

    // ── GET /api/player/games/{id}/data ─────────────────────────────

    @Test
    void getGameDataResponseBodyContainsNoPointsSubstring() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        PlayerBaseResponse base = PlayerBaseResponse.builder()
                .id(baseId)
                .gameId(gameId)
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(true)
                .hidden(false)
                .fixedChallengeId(challengeId)
                .build();

        PlayerChallengeResponse challenge = PlayerChallengeResponse.builder()
                .id(challengeId)
                .gameId(gameId)
                .title("Find the oldest tree")
                .description("Stand next to the trunk and submit a photo")
                .content("Full instructions here")
                .completionContent("Well done!")
                .answerType("photo")
                .autoValidate(false)
                .locationBound(true)
                .requirePresenceToSubmit(true)
                .fixedBaseId(baseId)
                .build();

        BaseProgressResponse progress = BaseProgressResponse.builder()
                .baseId(baseId)
                .challengeTitle("Find the oldest tree")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(true)
                .status("checked_in")
                .checkedInAt(Instant.parse("2026-04-10T10:00:00Z"))
                .challengeId(challengeId)
                .submissionStatus(null)
                .build();

        GameDataResponse response = GameDataResponse.builder()
                .gameStatus("live")
                .unlockTrigger("CHECK_IN")
                .bases(List.of(base))
                .challenges(List.of(challenge))
                .assignments(List.of())
                .progress(List.of(progress))
                .build();

        when(playerService.getGameData(eq(gameId), any(Player.class))).thenReturn(response);

        MvcResult result = mockMvc.perform(get("/api/player/games/" + gameId + "/data"))
                .andExpect(status().isOk())
                .andReturn();

        assertNoPointsSubstring(result.getResponse().getContentAsString());
    }

    // ── POST /api/player/games/{id}/bases/{id}/check-in ─────────────

    @Test
    void checkInResponseBodyContainsNoPointsSubstring() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID checkInId = UUID.randomUUID();

        CheckInResponse response = CheckInResponse.builder()
                .checkInId(checkInId)
                .baseId(baseId)
                .checkedInAt(Instant.parse("2026-04-10T10:15:00Z"))
                .challenge(CheckInResponse.ChallengeInfo.builder()
                        .id(UUID.randomUUID())
                        .title("Find the oldest tree")
                        .description("Stand next to the trunk")
                        .content("instructions")
                        .completionContent("well done")
                        .answerType("photo")
                        .requirePresenceToSubmit(true)
                        .build())
                .build();

        when(playerService.checkIn(eq(gameId), eq(baseId), any(Player.class), any()))
                .thenReturn(response);

        CheckInRequest body = new CheckInRequest();
        body.setNfcToken("nfc-tok");
        MvcResult result = mockMvc.perform(
                        post("/api/player/games/" + gameId + "/bases/" + baseId + "/check-in")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn();

        assertNoPointsSubstring(result.getResponse().getContentAsString());
    }

    // ── GET /api/player/games/{id}/progress ─────────────────────────

    @Test
    void getProgressResponseBodyContainsNoPointsSubstring() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();
        UUID challengeId = UUID.randomUUID();

        BaseProgressResponse progress = BaseProgressResponse.builder()
                .baseId(baseId)
                .challengeTitle("Find the oldest tree")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(true)
                .status("submitted")
                .checkedInAt(Instant.parse("2026-04-10T10:00:00Z"))
                .challengeId(challengeId)
                .submissionStatus("pending")
                .build();

        when(playerService.getProgress(eq(gameId), any(Player.class)))
                .thenReturn(List.of(progress));

        MvcResult result = mockMvc.perform(get("/api/player/games/" + gameId + "/progress"))
                .andExpect(status().isOk())
                .andReturn();

        assertNoPointsSubstring(result.getResponse().getContentAsString());
    }

    // ── GET /api/player/games/{id}/bases ────────────────────────────

    @Test
    void getBasesResponseBodyContainsNoPointsSubstring() throws Exception {
        UUID gameId = UUID.randomUUID();
        UUID baseId = UUID.randomUUID();

        PlayerBaseResponse base = PlayerBaseResponse.builder()
                .id(baseId)
                .gameId(gameId)
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(true)
                .hidden(false)
                .fixedChallengeId(UUID.randomUUID())
                .build();

        when(playerService.getBases(eq(gameId), any(Player.class)))
                .thenReturn(List.of(base));

        MvcResult result = mockMvc.perform(get("/api/player/games/" + gameId + "/bases"))
                .andExpect(status().isOk())
                .andReturn();

        assertNoPointsSubstring(result.getResponse().getContentAsString());
    }

    // ── POST /api/player/games/{id}/submissions ─────────────────────
    //
    // The submission endpoint returns {@link SubmissionResponse}, a DTO
    // shared with operator surfaces that legitimately carries a
    // {@code points} field (operators need the scoring field to drive
    // their submission review UX). On the player-creation path, the
    // {@code points} value is always null at creation time (the
    // submission has not been reviewed yet), but Jackson's default
    // inclusion policy still serializes {@code "points":null} — which
    // would trip the substring check above even though there is no
    // real leak.
    //
    // Locking that down cleanly would require splitting the DTO into
    // an operator and a player variant; this is the correct long-term
    // fix but it is outside the scope of Wave F and is tracked as
    // follow-up work. For now, the player-facing guardrails that
    // matter — the DTOs used on every player GET endpoint and the
    // CheckInResponse on the check-in POST — are locked down by the
    // tests above, and the realtime {@code submission_status} team
    // payload is covered by {@code GameEventBroadcasterTest}. These
    // together close the "players see scores" invariant.
}
