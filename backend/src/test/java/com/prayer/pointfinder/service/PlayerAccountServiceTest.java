package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerAccountLinkRequest;
import com.prayer.pointfinder.dto.request.PlayerRecoverRequest;
import com.prayer.pointfinder.dto.response.PlayerAccountResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A claim links the guest row in place and never mints a new one; a recover
 * returns that same row for another device. Conflicts are typed, never merged.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlayerAccountServiceTest {

    @Mock private PlayerRepository playerRepository;
    @Mock private UserRepository userRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private GameRepository gameRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private AuthService authService;
    @Mock private PlayerJoinService playerJoinService;
    @Mock private com.prayer.pointfinder.repository.ActivityEventRepository activityEventRepository;

    @InjectMocks private PlayerAccountService service;

    private Game game;
    private Team falcons;
    private Team owls;
    private Player guest;
    private User ana;

    @BeforeEach
    void setUp() {
        game = Game.builder().id(UUID.randomUUID()).name("Camp").description("").status(GameStatus.live).tileSource("osm-classic").build();
        falcons = Team.builder().id(UUID.randomUUID()).game(game).name("Falcons").joinCode("FALC01").color("#111111").build();
        owls = Team.builder().id(UUID.randomUUID()).game(game).name("Owls").joinCode("OWLS01").color("#222222").build();
        guest = Player.builder().id(UUID.randomUUID()).team(falcons).game(game).deviceId("device-a").displayName("Ana").build();
        ana = User.builder().id(UUID.randomUUID()).email("ana@example.com").name("Ana").passwordHash("hash").role(UserRole.participant).emailVerified(true).build();

        when(playerRepository.findById(guest.getId())).thenReturn(Optional.of(guest));
        when(playerRepository.save(any(Player.class))).thenAnswer(inv -> inv.getArgument(0));
        when(playerRepository.saveAndFlush(any(Player.class))).thenAnswer(inv -> inv.getArgument(0));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> { User u = inv.getArgument(0); if (u.getId() == null) u.setId(UUID.randomUUID()); return u; });
        when(userRepository.findByEmailIgnoreCase("ana@example.com")).thenReturn(Optional.of(ana));
        when(passwordEncoder.matches("Secret123", "hash")).thenReturn(true);
        when(passwordEncoder.encode(anyString())).thenReturn("encoded");
        when(loginAttemptService.isBlocked(anyString())).thenReturn(false);
        when(teamRepository.findByJoinCode("FALC01")).thenReturn(Optional.of(falcons));
        when(tokenProvider.generatePlayerToken(any(), any(), any())).thenReturn("jwt-recovered");
    }

    private static PlayerAccountLinkRequest login(String email, String password) {
        PlayerAccountLinkRequest r = new PlayerAccountLinkRequest();
        r.setEmail(email); r.setPassword(password); r.setCreateAccount(false);
        return r;
    }

    private static PlayerAccountLinkRequest signup(String email, String name, String password) {
        PlayerAccountLinkRequest r = new PlayerAccountLinkRequest();
        r.setEmail(email); r.setName(name); r.setPassword(password); r.setCreateAccount(true);
        return r;
    }

    private Player authPlayer() {
        return Player.builder().id(guest.getId()).build();
    }

    // ── account ──────────────────────────────────────────────────────

    @Test
    void guestAccountIsUnlinked() {
        PlayerAccountResponse account = service.account(authPlayer());
        assertFalse(account.linked());
        assertNull(account.email());
    }

    // ── link by signing in ───────────────────────────────────────────

    @Test
    void linkBySignInAttachesTheGuestRowInPlace() {
        PlayerAccountResponse account = service.link(authPlayer(), login("ana@example.com", "Secret123"), null);

        assertTrue(account.linked());
        assertEquals("ana@example.com", account.email());
        assertSame(ana, guest.getUser(), "the existing row is linked, no new row");
        verify(loginAttemptService).recordSuccess("ana@example.com");
        verify(authService, never()).createParticipant(any(), any(), any(), any());
    }

    @Test
    void linkBySignInIsIdempotentForTheSameAccount() {
        guest.setUser(ana);
        PlayerAccountResponse account = service.link(authPlayer(), login("ana@example.com", "Secret123"), null);
        assertTrue(account.linked());
        verify(playerRepository, never()).saveAndFlush(any());
    }

    @Test
    void linkRefusesWhenAlreadyLinkedToAnotherAccount() {
        guest.setUser(User.builder().id(UUID.randomUUID()).email("bob@example.com").build());
        ConflictException ex = assertThrows(ConflictException.class,
                () -> service.link(authPlayer(), login("ana@example.com", "Secret123"), null));
        assertEquals(ErrorCode.PLAYER_ALREADY_LINKED, ex.getErrorCode());
    }

    @Test
    void linkRefusesWhenTheAccountAlreadyPlaysThisGame() {
        Player onOtherDevice = Player.builder().id(UUID.randomUUID()).team(owls).game(game).user(ana).deviceId("device-z").displayName("Ana").build();
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(onOtherDevice));

        ConflictException ex = assertThrows(ConflictException.class,
                () -> service.link(authPlayer(), login("ana@example.com", "Secret123"), null));

        assertEquals(ErrorCode.ACCOUNT_ALREADY_IN_GAME, ex.getErrorCode());
        assertEquals(owls.getId().toString(), ex.getErrors().get("teamId"));
        assertEquals("Owls", ex.getErrors().get("teamName"));
        assertEquals("false", ex.getErrors().get("sameTeam"));
        assertNull(guest.getUser(), "the guest row stays a guest");
    }

    @Test
    void linkRejectsBadCredentialsAndCountsTheFailure() {
        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> service.link(authPlayer(), login("ana@example.com", "wrong"), null));
        assertEquals(ErrorCode.INVALID_CREDENTIALS, ex.getErrorCode());
        verify(loginAttemptService).recordFailure("ana@example.com");
        assertNull(guest.getUser());
    }

    @Test
    void linkHonoursTheLoginLockout() {
        when(loginAttemptService.isBlocked("ana@example.com")).thenReturn(true);
        assertThrows(BadRequestException.class,
                () -> service.link(authPlayer(), login("ana@example.com", "Secret123"), null));
        verify(passwordEncoder, never()).matches(any(), any());
    }

    // ── link by creating an account ──────────────────────────────────

    @Test
    void linkBySignupCreatesTheParticipantThroughAuthAndLinksIt() {
        User nia = User.builder().id(UUID.randomUUID()).email("new@example.com").name("Nia").role(UserRole.participant).emailVerified(false).build();
        when(authService.createParticipant("new@example.com", "Nia", "Secret123", "app.example.test")).thenReturn(nia);

        PlayerAccountResponse account = service.link(authPlayer(), signup("new@example.com", "Nia", "Secret123"), "app.example.test");

        assertTrue(account.linked());
        assertFalse(account.emailVerified());
        assertSame(nia, guest.getUser());
    }

    @Test
    void linkBySignupPassesATakenEmailRefusalThrough() {
        when(authService.createParticipant(any(), any(), any(), any()))
                .thenThrow(new BadRequestException("Email already registered", ErrorCode.EMAIL_ALREADY_TAKEN));
        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> service.link(authPlayer(), signup("ana@example.com", "Ana", "Secret123"), null));
        assertEquals(ErrorCode.EMAIL_ALREADY_TAKEN, ex.getErrorCode());
        assertNull(guest.getUser());
    }

    @Test
    void linkBySignupRefusesAnAlreadyLinkedRowBeforeCreatingAnything() {
        guest.setUser(ana);
        assertThrows(ConflictException.class,
                () -> service.link(authPlayer(), signup("new@example.com", "Nia", "Secret123"), null));
        verify(authService, never()).createParticipant(any(), any(), any(), any());
    }

    // ── recover ──────────────────────────────────────────────────────

    private static PlayerRecoverRequest recover(String joinCode, String deviceId) {
        PlayerRecoverRequest r = new PlayerRecoverRequest();
        r.setEmail("ana@example.com"); r.setPassword("Secret123"); r.setDeviceId(deviceId); r.setJoinCode(joinCode);
        return r;
    }

    @Test
    void recoverReturnsTheSameParticipationForTheNewDevice() {
        guest.setUser(ana);
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(guest));

        PlayerAuthResponse auth = service.recover(recover("FALC01", "device-b"));

        assertEquals(guest.getId(), auth.player().id());
        assertEquals("device-b", auth.player().deviceId());
        assertEquals(falcons.getId(), auth.team().id());
        assertEquals("jwt-recovered", auth.token());
        verify(tokenProvider).generatePlayerToken(guest.getId(), falcons.getId(), game.getId());
    }

    @Test
    void recoverFindsTheGameThroughAnyTeamCodeOfThatGame() {
        // Ana plays for the Falcons but scanned an Owls code: she still gets her own team back.
        guest.setUser(ana);
        when(teamRepository.findByJoinCode("OWLS01")).thenReturn(Optional.of(owls));
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(guest));

        assertEquals(falcons.getId(), service.recover(recover("OWLS01", "device-b")).team().id());
    }

    @Test
    void recoverAcceptsTheGameIdTheAppSendsWhenSwitchingPhones() {
        guest.setUser(ana);
        when(gameRepository.findById(game.getId())).thenReturn(Optional.of(game));
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(guest));
        PlayerRecoverRequest byGame = recover(null, "device-b");
        byGame.setGameId(game.getId());

        assertEquals(guest.getId(), service.recover(byGame).player().id());
        verify(teamRepository, never()).findByJoinCode(any());
    }

    @Test
    void recoverRetiresTheGuestRowThatPhoneHadInThisGame() {
        // Ana joined the Owls as a guest on phone B, then recovers her Falcons participation there.
        guest.setUser(ana);
        Player ghost = Player.builder().id(UUID.randomUUID()).team(owls).game(game).deviceId("device-b").displayName("Ana again").build();
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(guest));
        when(playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc("device-b", game.getId())).thenReturn(Optional.of(ghost));

        PlayerAuthResponse auth = service.recover(recover("FALC01", "device-b"));

        assertEquals(guest.getId(), auth.player().id());
        // The ghost keeps its data (check-ins cascade from it) but can never be resolved by a phone again.
        verify(playerRepository, never()).delete(any(Player.class));
        assertTrue(ghost.getDeviceId().startsWith(PlayerAccountService.RETIRED_DEVICE_PREFIX));
        ArgumentCaptor<com.prayer.pointfinder.entity.ActivityEvent> audit = ArgumentCaptor.forClass(com.prayer.pointfinder.entity.ActivityEvent.class);
        verify(activityEventRepository).save(audit.capture());
        assertEquals(com.prayer.pointfinder.entity.ActivityEventType.team_switch, audit.getValue().getType());
        assertEquals(ghost.getId().toString(), audit.getValue().getMetadata().get("retiredPlayerId"));
    }

    @Test
    void recoverNeverTakesOverAnotherAccountsRowOnThatPhone() {
        guest.setUser(ana);
        User bob = User.builder().id(UUID.randomUUID()).email("bob@example.com").build();
        Player bobsRow = Player.builder().id(UUID.randomUUID()).team(owls).game(game).user(bob).deviceId("device-b").displayName("Bob").build();
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(guest));
        when(playerRepository.findFirstByDeviceIdAndTeamGameIdOrderByCreatedAtDesc("device-b", game.getId())).thenReturn(Optional.of(bobsRow));

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.recover(recover("FALC01", "device-b")));
        assertEquals(ErrorCode.DEVICE_ALREADY_IN_DIFFERENT_TEAM, ex.getErrorCode());
        verify(playerRepository, never()).delete(any(Player.class));
        assertEquals("device-a", guest.getDeviceId());
    }

    @Test
    void recoverRefusesAnAccountThatNeverJoined() {
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.empty());
        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.recover(recover("FALC01", "device-b")));
        assertEquals(ErrorCode.NO_PARTICIPATION_FOUND, ex.getErrorCode());
    }

    @Test
    void recoverRefusesAnEndedGameLikeJoinDoes() {
        game.setStatus(GameStatus.ended);
        assertThrows(BadRequestException.class, () -> service.recover(recover("FALC01", "device-b")));
        verify(playerRepository, never()).findByUserIdAndGameId(any(), any());
    }

    @Test
    void recoverRejectsBadCredentialsBeforeTouchingTheGame() {
        PlayerRecoverRequest bad = recover("FALC01", "device-b");
        bad.setPassword("wrong");
        assertEquals(ErrorCode.INVALID_CREDENTIALS, assertThrows(BadRequestException.class, () -> service.recover(bad)).getErrorCode());
        verify(teamRepository, never()).findByJoinCode(any());
    }

    // ── signed-in phone ──────────────────────────────────────────────

    private void sessionToken(String token, User user) {
        when(tokenProvider.validateToken(token)).thenReturn(true);
        when(tokenProvider.getTokenType(token)).thenReturn("user");
        when(tokenProvider.getUserIdFromToken(token)).thenReturn(user.getId());
        when(tokenProvider.getTokenVersion(token)).thenReturn(0);
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
    }

    @Test
    void linkByAccountSessionNeedsNoPassword() {
        sessionToken("access-ana", ana);
        PlayerAccountLinkRequest r = new PlayerAccountLinkRequest();
        r.setAccountAccessToken("access-ana");

        PlayerAccountResponse account = service.link(authPlayer(), r, null);

        assertTrue(account.linked());
        assertSame(ana, guest.getUser());
        verify(passwordEncoder, never()).matches(any(), any());
    }

    @Test
    void linkByAccountSessionRejectsAPlayerTokenOrAStaleOne() {
        when(tokenProvider.validateToken("player-jwt")).thenReturn(true);
        when(tokenProvider.getTokenType("player-jwt")).thenReturn("player");
        PlayerAccountLinkRequest r = new PlayerAccountLinkRequest();
        r.setAccountAccessToken("player-jwt");
        assertEquals(ErrorCode.INVALID_CREDENTIALS, assertThrows(BadRequestException.class, () -> service.link(authPlayer(), r, null)).getErrorCode());

        ana.setTokenVersion(3);
        sessionToken("old-access", ana);
        r.setAccountAccessToken("old-access");
        assertEquals(ErrorCode.INVALID_CREDENTIALS, assertThrows(BadRequestException.class, () -> service.link(authPlayer(), r, null)).getErrorCode());
        assertNull(guest.getUser());
    }

    @Test
    void unlinkMakesTheRowAGuestAgain() {
        guest.setUser(ana);
        PlayerAccountResponse account = service.unlink(authPlayer());
        assertFalse(account.linked());
        assertNull(guest.getUser());
        verify(playerRepository).save(guest);
    }

    @Test
    void joinForAccountRecoversWhenTheAccountAlreadyPlaysThatGame() {
        guest.setUser(ana);
        when(userRepository.findById(ana.getId())).thenReturn(Optional.of(ana));
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(guest));

        PlayerAuthResponse auth = service.joinForAccount(ana, "FALC01", "Ana", "device-b");

        assertEquals(guest.getId(), auth.player().id());
        assertEquals("device-b", guest.getDeviceId());
        verify(playerJoinService, never()).joinTeam(any());
    }

    @Test
    void joinForAccountJoinsAsAGuestWouldAndLinksTheNewRow() {
        when(userRepository.findById(ana.getId())).thenReturn(Optional.of(ana));
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.empty());
        Player fresh = Player.builder().id(UUID.randomUUID()).team(falcons).game(game).deviceId("device-b").displayName("Ana").build();
        when(playerJoinService.joinTeam(any())).thenReturn(PlayerAuthResponse.of("jwt-new", fresh, falcons, game));
        when(playerRepository.findById(fresh.getId())).thenReturn(Optional.of(fresh));

        PlayerAuthResponse auth = service.joinForAccount(ana, "FALC01", "Ana", "device-b");

        assertEquals(fresh.getId(), auth.player().id());
        assertSame(ana, fresh.getUser(), "the new row is linked at once");
        ArgumentCaptor<com.prayer.pointfinder.dto.request.PlayerJoinRequest> join = ArgumentCaptor.forClass(com.prayer.pointfinder.dto.request.PlayerJoinRequest.class);
        verify(playerJoinService).joinTeam(join.capture());
        assertEquals("FALC01", join.getValue().getJoinCode());
        assertEquals("device-b", join.getValue().getDeviceId());
    }

    @Test
    void joinForAccountNeverTakesOverAnotherAccountsRowOnThatPhone() {
        when(userRepository.findById(ana.getId())).thenReturn(Optional.of(ana));
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.empty());
        User bob = User.builder().id(UUID.randomUUID()).email("bob@example.com").build();
        Player bobs = Player.builder().id(UUID.randomUUID()).team(falcons).game(game).user(bob).deviceId("device-b").displayName("Bob").build();
        when(playerJoinService.joinTeam(any())).thenReturn(PlayerAuthResponse.of("jwt", bobs, falcons, game));
        when(playerRepository.findById(bobs.getId())).thenReturn(Optional.of(bobs));

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.joinForAccount(ana, "FALC01", "Ana", "device-b"));
        assertEquals(ErrorCode.DEVICE_ALREADY_IN_DIFFERENT_TEAM, ex.getErrorCode());
        assertSame(bob, bobs.getUser());
    }

    @Test
    void recoverForAccountUsesTheSessionNotAPassword() {
        guest.setUser(ana);
        when(userRepository.findById(ana.getId())).thenReturn(Optional.of(ana));
        when(gameRepository.findById(game.getId())).thenReturn(Optional.of(game));
        when(playerRepository.findByUserIdAndGameId(ana.getId(), game.getId())).thenReturn(Optional.of(guest));

        assertEquals(guest.getId(), service.recoverForAccount(ana, game.getId(), "device-b").player().id());
        verify(passwordEncoder, never()).matches(any(), any());
    }
}
