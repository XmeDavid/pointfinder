package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.PlayerAccountLinkRequest;
import com.prayer.pointfinder.dto.request.PlayerRecoverRequest;
import com.prayer.pointfinder.dto.response.PlayerAccountResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.EmailChangeToken;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ConflictException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.EmailChangeTokenRepository;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.TeamRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
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
    @Mock private UserSubscriptionRepository userSubRepository;
    @Mock private EmailChangeTokenRepository emailChangeTokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private JwtTokenProvider tokenProvider;
    @Mock private EmailService emailService;
    @Mock private AuthService authService;

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
        when(emailChangeTokenRepository.save(any(EmailChangeToken.class))).thenAnswer(inv -> inv.getArgument(0));
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
        verify(emailService, never()).sendParticipantVerification(any(), any(), any());
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
    void linkBySignupCreatesAnUnverifiedParticipantAndMailsTheLink() {
        when(userRepository.existsByEmailIgnoreCase("new@example.com")).thenReturn(false);

        PlayerAccountResponse account = service.link(authPlayer(), signup("new@example.com", "Nia", "Secret123"), "app.example.test");

        assertTrue(account.linked());
        assertFalse(account.emailVerified());
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertEquals(UserRole.participant, saved.getValue().getRole());
        assertEquals(Boolean.FALSE, saved.getValue().getEmailVerified());
        assertEquals("encoded", saved.getValue().getPasswordHash());
        verify(authService).validatePassword("Secret123");
        verify(userSubRepository).save(any());
        ArgumentCaptor<EmailChangeToken> token = ArgumentCaptor.forClass(EmailChangeToken.class);
        verify(emailChangeTokenRepository).save(token.capture());
        assertEquals("new@example.com", token.getValue().getNewEmail());
        verify(emailService).sendParticipantVerification(eq("new@example.com"), eq(token.getValue().getToken()), eq("app.example.test"));
        assertSame(saved.getValue(), guest.getUser());
    }

    @Test
    void linkBySignupRefusesATakenEmail() {
        when(userRepository.existsByEmailIgnoreCase("ana@example.com")).thenReturn(true);
        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> service.link(authPlayer(), signup("ana@example.com", "Ana", "Secret123"), null));
        assertEquals(ErrorCode.EMAIL_ALREADY_TAKEN, ex.getErrorCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void linkBySignupRefusesAnAlreadyLinkedRowBeforeCreatingAnything() {
        guest.setUser(ana);
        assertThrows(ConflictException.class,
                () -> service.link(authPlayer(), signup("new@example.com", "Nia", "Secret123"), null));
        verify(userRepository, never()).save(any());
        verify(emailService, never()).sendParticipantVerification(any(), any(), any());
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
}
