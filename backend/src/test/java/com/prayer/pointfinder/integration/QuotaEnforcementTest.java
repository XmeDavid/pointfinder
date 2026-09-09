package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.dto.response.UploadSessionResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.IndividualTier;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.SubscriptionStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserSubscription;
import com.prayer.pointfinder.repository.OrgInviteRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import com.prayer.pointfinder.service.EmailService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The quota limits QuotaService could always compute but nothing called: bases
 * per game (one at a time and by the batch on import), operators per game, the
 * per-file size cap on every path that accepts bytes, and the org member limit.
 *
 * <p>Each is driven from a per-account {@code quota_overrides} entry rather
 * than by building 25 bases, so the test states the limit it is testing.
 */
@TestPropertySource(properties = "app.quota.enforcement-enabled=true")
class QuotaEnforcementTest extends IntegrationTestBase {

    @Autowired private UserSubscriptionRepository subscriptionRepository;
    @Autowired private OrganizationRepository orgRepository;
    @Autowired private OrgMembershipRepository membershipRepository;
    @Autowired private OrgInviteRepository orgInviteRepository;

    /** Outbound mail is a side effect, not the thing under test. */
    @MockitoBean private EmailService emailService;

    @BeforeEach
    void resetQuotaState() {
        orgInviteRepository.deleteAll();
        membershipRepository.deleteAll();
        orgRepository.deleteAll();
        subscriptionRepository.deleteAll();
    }

    // ── helpers ──────────────────────────────────────────────────────

    private <T> ResponseEntity<T> as(User user, HttpMethod method, String path, Object body, Class<T> type) {
        return restTemplate.exchange(path, method,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), type);
    }

    private <T> ResponseEntity<T> asPlayer(Player player, HttpMethod method, String path, Object body, Class<T> type) {
        return restTemplate.exchange(path, method,
                new HttpEntity<>(body, headersWithAuth(playerAuthHeader(player))), type);
    }

    private User operator(String prefix) {
        return createOperator(prefix + "-" + UUID.randomUUID() + "@test.com", "password");
    }

    /** Gives the operator a free plan carrying exactly the overrides named. */
    private void withOverrides(User user, Map<String, Object> overrides) {
        UserSubscription sub = subscriptionRepository.findByUserId(user.getId())
                .orElseGet(() -> UserSubscription.builder()
                        .user(user)
                        .tier(IndividualTier.free)
                        .status(SubscriptionStatus.active)
                        .build());
        sub.setQuotaOverrides(overrides);
        subscriptionRepository.save(sub);
    }

    private Map<String, Object> baseBody(String name) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("description", "");
        body.put("lat", 47.0);
        body.put("lng", 8.0);
        return body;
    }

    // ── bases per game: one at a time ────────────────────────────────

    @Test
    void aBaseUnderTheLimitIsCreatedAndTheOneOverItIsNot() {
        User owner = operator("bases");
        withOverrides(owner, Map.of("max_bases_per_game", 2));
        Game game = createGame(owner, "Two-base game", GameStatus.setup);
        String path = "/api/games/" + game.getId() + "/bases";

        assertEquals(HttpStatus.CREATED, as(owner, HttpMethod.POST, path, baseBody("One"), BaseResponse.class)
                .getStatusCode());
        assertEquals(HttpStatus.CREATED, as(owner, HttpMethod.POST, path, baseBody("Two"), BaseResponse.class)
                .getStatusCode());

        ResponseEntity<String> third = as(owner, HttpMethod.POST, path, baseBody("Three"), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, third.getStatusCode());
        assertTrue(third.getBody().contains("QUOTA_BASES_PER_GAME_EXCEEDED"), third.getBody());
        assertEquals(2, baseRepository.findByGameId(game.getId()).size());
    }

    // ── bases per game: the imported batch ───────────────────────────

    @Test
    void anImportIsWeighedAsAWholeBeforeAnythingIsWritten() {
        User owner = operator("import");
        withOverrides(owner, Map.of("max_bases_per_game", 3));
        Game source = createGame(owner, "Source", GameStatus.setup);
        createBase(source, "A");
        createBase(source, "B");
        createBase(source, "C");

        ResponseEntity<GameExportDto> exported =
                as(owner, HttpMethod.GET, "/api/games/" + source.getId() + "/export", null, GameExportDto.class);
        assertEquals(HttpStatus.OK, exported.getStatusCode());
        GameExportDto data = exported.getBody();
        assertNotNull(data);

        // Three bases against a limit of three: it fits.
        long gamesBefore = gameRepository.count();
        assertEquals(HttpStatus.CREATED,
                as(owner, HttpMethod.POST, "/api/games/import", Map.of("gameData", data), GameResponse.class)
                        .getStatusCode());
        assertEquals(gamesBefore + 1, gameRepository.count());

        // Drop the limit under the batch: one clear refusal, and no game left
        // half-built behind it.
        withOverrides(owner, Map.of("max_bases_per_game", 2));
        long gamesNow = gameRepository.count();
        ResponseEntity<String> refused =
                as(owner, HttpMethod.POST, "/api/games/import", Map.of("gameData", data), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_BASES_PER_GAME_EXCEEDED"), refused.getBody());
        assertEquals(gamesNow, gameRepository.count(), "a refused import leaves no game behind");
    }

    // ── operators per game ───────────────────────────────────────────

    @Test
    void anOperatorInviteIsRefusedOnceTheGameIsFull() {
        User owner = operator("ops");
        User second = operator("ops-second");
        // The creator is already an operator, so a limit of two leaves one seat.
        withOverrides(owner, Map.of("max_operators_per_game", 2));
        Game game = createGame(owner, "Two-operator game", GameStatus.setup);

        Map<String, Object> invite = Map.of("email", second.getEmail(), "gameId", game.getId().toString());
        assertEquals(HttpStatus.CREATED,
                as(owner, HttpMethod.POST, "/api/invites", invite, String.class).getStatusCode());

        // One seat, already promised: a limit of one refuses the next invite.
        withOverrides(owner, Map.of("max_operators_per_game", 1));
        User third = operator("ops-third");
        ResponseEntity<String> refused = as(owner, HttpMethod.POST, "/api/invites",
                Map.of("email", third.getEmail(), "gameId", game.getId().toString()), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_OPERATORS_PER_GAME_EXCEEDED"), refused.getBody());
    }

    @Test
    void acceptingAnInviteIntoAFullGameIsRefused() {
        User owner = operator("accept");
        User second = operator("accept-second");
        withOverrides(owner, Map.of("max_operators_per_game", 2));
        Game game = createGame(owner, "Filling up", GameStatus.setup);

        ResponseEntity<Map> created = as(owner, HttpMethod.POST, "/api/invites",
                Map.of("email", second.getEmail(), "gameId", game.getId().toString()), Map.class);
        assertEquals(HttpStatus.CREATED, created.getStatusCode());
        String inviteId = String.valueOf(created.getBody().get("id"));

        // The seat is taken between the invite and the acceptance.
        withOverrides(owner, Map.of("max_operators_per_game", 1));
        ResponseEntity<String> refused =
                as(second, HttpMethod.POST, "/api/invites/" + inviteId + "/accept", null, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_OPERATORS_PER_GAME_EXCEEDED"), refused.getBody());

        // Restore the seat and the same invite goes through.
        withOverrides(owner, Map.of("max_operators_per_game", 2));
        assertEquals(HttpStatus.NO_CONTENT,
                as(second, HttpMethod.POST, "/api/invites/" + inviteId + "/accept", null, Void.class)
                        .getStatusCode());
    }

    // ── file size ────────────────────────────────────────────────────

    /** A live game with one team and one player, owned by {@code owner}. */
    private Player livePlayerFor(User owner, String label) {
        Game game = createGame(owner, label, GameStatus.live);
        Team team = createTeam(game, "Team", "JOIN" + label.hashCode());
        return createPlayer(team, "Player", "device-" + UUID.randomUUID());
    }

    private Map<String, Object> sessionBody(long totalSizeBytes) {
        Map<String, Object> body = new HashMap<>();
        body.put("originalFileName", "clip.mp4");
        body.put("contentType", "video/mp4");
        body.put("totalSizeBytes", totalSizeBytes);
        body.put("chunkSizeBytes", 1024);
        return body;
    }

    @Test
    void aChunkedUploadSessionIsRefusedWhenTheFileIsBiggerThanThePlanAllows() {
        User owner = operator("filesize");
        withOverrides(owner, Map.of("max_file_size_bytes", 4096));
        Player player = livePlayerFor(owner, "Upload");
        String path = "/api/player/games/" + player.getTeam().getGame().getId() + "/uploads/sessions";

        // Under the cap: the session opens.
        ResponseEntity<UploadSessionResponse> ok =
                asPlayer(player, HttpMethod.POST, path, sessionBody(2048), UploadSessionResponse.class);
        assertEquals(HttpStatus.CREATED, ok.getStatusCode());

        // Over it: refused before a single chunk is asked for.
        ResponseEntity<String> refused =
                asPlayer(player, HttpMethod.POST, path, sessionBody(8192), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_FILE_SIZE_EXCEEDED"), refused.getBody());
    }

    @Test
    void aDirectMediaSubmissionIsRefusedWhenTheFileIsBiggerThanThePlanAllows() {
        User owner = operator("direct");
        withOverrides(owner, Map.of("max_file_size_bytes", 16));
        Player player = livePlayerFor(owner, "Direct");
        Game game = player.getTeam().getGame();
        var base = createBase(game, "Base");
        var challenge = createChallenge(game, "Challenge",
                com.prayer.pointfinder.entity.AnswerType.file, 10);

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", playerAuthHeader(player));
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("file", new ByteArrayResource(new byte[512]) {
            @Override
            public String getFilename() {
                return "photo.jpg";
            }
        });
        parts.add("baseId", base.getId().toString());
        parts.add("challengeId", challenge.getId().toString());

        ResponseEntity<String> refused = restTemplate.exchange(
                "/api/player/games/" + game.getId() + "/submissions/upload",
                HttpMethod.POST, new HttpEntity<>(parts, headers), String.class);

        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_FILE_SIZE_EXCEEDED"), refused.getBody());
        assertTrue(submissionRepository.findAll().isEmpty(), "nothing is stored for a refused upload");
    }

    @Test
    void aSmallDirectMediaSubmissionGetsPastTheFileSizeGate() {
        User owner = operator("direct-ok");
        withOverrides(owner, Map.of("max_file_size_bytes", 1024));
        Player player = livePlayerFor(owner, "DirectOk");
        Game game = player.getTeam().getGame();
        var base = createBase(game, "Base");
        var challenge = createChallenge(game, "Challenge",
                com.prayer.pointfinder.entity.AnswerType.file, 10);

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", playerAuthHeader(player));
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("file", new ByteArrayResource(new byte[64]) {
            @Override
            public String getFilename() {
                return "photo.jpg";
            }
        });
        parts.add("baseId", base.getId().toString());
        parts.add("challengeId", challenge.getId().toString());

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/player/games/" + game.getId() + "/submissions/upload",
                HttpMethod.POST, new HttpEntity<>(parts, headers), String.class);

        // The upload still fails on content sniffing — 64 zero bytes are not a
        // JPEG — but the plan's size cap is no longer what stops it.
        assertFalse(String.valueOf(response.getBody()).contains("QUOTA_FILE_SIZE_EXCEEDED"),
                String.valueOf(response.getBody()));
    }

    // ── org members ──────────────────────────────────────────────────

    @Test
    void anOrgInviteIsRefusedWithACodeOnceTheMemberLimitIsReached() {
        User owner = operator("members");
        ResponseEntity<OrgResponse> org =
                as(owner, HttpMethod.POST, "/api/orgs", Map.of("name", "Small Club"), OrgResponse.class);
        assertEquals(HttpStatus.CREATED, org.getStatusCode());
        UUID orgId = org.getBody().id();

        User invitee = operator("members-invitee");
        String invitePath = "/api/orgs/" + orgId + "/invites";

        // A free org allows three members and holds one: there is room.
        assertEquals(HttpStatus.CREATED,
                as(owner, HttpMethod.POST, invitePath, Map.of("email", invitee.getEmail()), String.class)
                        .getStatusCode());

        // Squeeze the deal down to the one member it already has.
        var organization = orgRepository.findById(orgId).orElseThrow();
        organization.setQuotaOverrides(Map.of("max_members", 1));
        orgRepository.saveAndFlush(organization);

        User another = operator("members-another");
        ResponseEntity<String> refused =
                as(owner, HttpMethod.POST, invitePath, Map.of("email", another.getEmail()), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_ORG_MEMBERS_EXCEEDED"), refused.getBody());
    }

    @Test
    void theMemberLimitHoldsEvenWithEnforcementOffBecauseItIsASeatCount() {
        // Documented in docs/business-logic.md: the member and storage limits
        // are what a club deal actually buys, so they do not answer to
        // app.quota.enforcement-enabled. This test pins the code on the
        // rejection; the always-on half is asserted by the property this class
        // sets being irrelevant to the branch under test.
        User owner = operator("seats");
        ResponseEntity<OrgResponse> org =
                as(owner, HttpMethod.POST, "/api/orgs", Map.of("name", "Seat Club"), OrgResponse.class);
        UUID orgId = org.getBody().id();

        var organization = orgRepository.findById(orgId).orElseThrow();
        organization.setQuotaOverrides(Map.of("max_members", 1));
        orgRepository.saveAndFlush(organization);

        User another = operator("seats-another");
        ResponseEntity<String> refused = as(owner, HttpMethod.POST, "/api/orgs/" + orgId + "/invites",
                Map.of("email", another.getEmail()), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_ORG_MEMBERS_EXCEEDED"), refused.getBody());
        assertFalse(orgInviteRepository.existsByOrganizationIdAndEmailAndStatus(
                orgId, another.getEmail(), com.prayer.pointfinder.entity.InviteStatus.pending));
    }
}
