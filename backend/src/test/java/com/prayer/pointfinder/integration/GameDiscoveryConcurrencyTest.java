package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.GamePublicationRequest;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GamePublication;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.GamePublicationRepository;
import com.prayer.pointfinder.service.ExploreService;
import com.prayer.pointfinder.service.GamePublicationService;
import com.prayer.pointfinder.service.TeamService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Publication mutations and Explore joins take the game row's write lock
 * before reading listing state. Each test holds that lock in one transaction
 * that has already changed the state but not committed, then runs the
 * competing call on another thread: the call must wait for the commit and act
 * on what was committed, never on what it could have read earlier.
 */
class GameDiscoveryConcurrencyTest extends IntegrationTestBase {

    private static final long HOLD_MS = 700;

    @Autowired private GamePublicationService publicationService;
    @Autowired private ExploreService exploreService;
    @Autowired private TeamService teamService;
    @Autowired private GamePublicationRepository publicationRepository;
    @Autowired private PlatformTransactionManager txManager;
    @Autowired private EntityManager entityManager;

    private ExecutorService pool;
    private User owner;
    private User participant;
    private Game game;
    private Team falcons;

    @BeforeEach
    void setUpListing() {
        pool = Executors.newFixedThreadPool(2);
        String tag = UUID.randomUUID().toString().substring(0, 8);
        owner = createOperator("owner-" + tag + "@test.com", "Password1");
        participant = userRepository.save(User.builder().email("ana-" + tag + "@test.com").name("Ana")
                .passwordHash(passwordEncoder.encode("Secret123")).role(UserRole.participant).build());
        game = createGame(owner, "Race " + tag, GameStatus.live);
        falcons = createTeam(game, "Falcons", "FALC" + tag.substring(0, 4).toUpperCase());
        as(owner);
        publicationService.save(game.getId(), request("Listed", falcons.getId()));
        publicationService.publish(game.getId());
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
        SecurityContextHolder.clearContext();
    }

    private static GamePublicationRequest request(String marker, UUID admissionTeamId) {
        GamePublicationRequest r = new GamePublicationRequest();
        // The request title is ignored (the listing title is the game name), so the
        // marker that proves which save won lives in the summary.
        r.setTitle(marker); r.setSummary(marker); r.setPlace("Place"); r.setCategory("coast");
        r.setAdmissionTeamId(admissionTeamId);
        return r;
    }

    private static void as(User user) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name().toUpperCase()))));
    }

    /** Runs {@code change} on the locked game inside an open transaction, releases the latch, holds, then commits. */
    private Future<?> holdLockedChange(User actor, Runnable change, CountDownLatch changed) {
        return pool.submit(() -> {
            as(actor);
            new TransactionTemplate(txManager).execute(status -> {
                gameRepository.findByIdForUpdate(game.getId()).orElseThrow();
                change.run();
                entityManager.flush();
                changed.countDown();
                try { Thread.sleep(HOLD_MS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                return null;
            });
            return null;
        });
    }

    private <T> T afterChange(CountDownLatch changed, User actor, java.util.concurrent.Callable<T> call) throws Exception {
        assertTrue(changed.await(10, TimeUnit.SECONDS));
        Future<T> f = pool.submit(() -> { as(actor); return call.call(); });
        return f.get(20, TimeUnit.SECONDS);
    }

    @Test
    void saveWaitsForUnpublishAndDoesNotRestoreTheListing() throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        Future<?> unpublishing = holdLockedChange(owner, () -> publicationService.unpublish(game.getId()), changed);

        long started = System.nanoTime();
        var saved = afterChange(changed, owner, () -> publicationService.save(game.getId(), request("Renamed", falcons.getId())));
        long waitedMs = (System.nanoTime() - started) / 1_000_000;
        unpublishing.get(10, TimeUnit.SECONDS);

        assertFalse(saved.listed(), "save read the listing after the unpublish committed");
        GamePublication row = publicationRepository.findById(game.getId()).orElseThrow();
        assertNull(row.getPublishedAt());
        assertEquals("Renamed", row.getSummary());
        assertEquals(game.getName(), row.getTitle());
        assertTrue(waitedMs >= HOLD_MS / 2, "save should have waited on the game row lock, waited " + waitedMs + "ms");
    }

    @Test
    void joinWaitsForEndAndCreatesNoParticipation() throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        Future<?> ending = holdLockedChange(owner, () -> {
            Game locked = gameRepository.findById(game.getId()).orElseThrow();
            locked.setStatus(GameStatus.ended);
            gameRepository.save(locked);
        }, changed);

        ResourceNotFoundException refused = assertThrows(ResourceNotFoundException.class, () ->
                afterChangeUnwrapped(changed, participant, () -> exploreService.join(participant, game.getId(), "Ana", "phone-z")));
        ending.get(10, TimeUnit.SECONDS);

        assertTrue(refused.getMessage().contains("Listing"), refused.getMessage());
        assertEquals(0, playerRepository.findByUserIdOrderByCreatedAtDesc(participant.getId()).size());
        assertEquals(GameStatus.ended, gameRepository.findById(game.getId()).orElseThrow().getStatus());
    }

    @Test
    void joinWaitsForAdmissionClosureAndIsRefused() throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        Future<?> closing = holdLockedChange(owner, () -> publicationService.save(game.getId(), request("Listed", null)), changed);

        BadRequestException refused = assertThrows(BadRequestException.class, () ->
                afterChangeUnwrapped(changed, participant, () -> exploreService.join(participant, game.getId(), "Ana", "phone-z")));
        closing.get(10, TimeUnit.SECONDS);

        assertEquals(ErrorCode.PUBLICATION_ADMISSION_CLOSED, refused.getErrorCode());
        assertEquals(0, playerRepository.findByUserIdOrderByCreatedAtDesc(participant.getId()).size());
        assertNull(publicationRepository.findById(game.getId()).orElseThrow().getAdmissionTeam());
    }

    /**
     * Deleting the admission team runs the real {@link TeamService#deleteTeam}
     * (team row, FK-cascaded publication update, state-version bump) inside the
     * held transaction. A join that arrives meanwhile must queue on the game
     * row rather than take it and then block on the team's FK, which is the
     * opposite-order deadlock this guards against.
     */
    @Test
    void joinWaitsForAdmissionTeamDeletionWithoutDeadlock() throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        Future<?> deleting = holdLockedChange(owner, () -> teamService.deleteTeam(game.getId(), falcons.getId()), changed);

        BadRequestException refused = assertThrows(BadRequestException.class, () ->
                afterChangeUnwrapped(changed, participant, () -> exploreService.join(participant, game.getId(), "Ana", "phone-z")));
        deleting.get(10, TimeUnit.SECONDS);

        assertEquals(ErrorCode.PUBLICATION_ADMISSION_CLOSED, refused.getErrorCode());
        assertTrue(teamRepository.findById(falcons.getId()).isEmpty());
        assertNull(publicationRepository.findById(game.getId()).orElseThrow().getAdmissionTeam());
        assertTrue(publicationRepository.findById(game.getId()).orElseThrow().isListed());
        assertEquals(0, playerRepository.findByUserIdOrderByCreatedAtDesc(participant.getId()).size());
    }

    @Test
    void saveWaitsForAdmissionTeamDeletionAndRejectsTheGoneTeam() throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        Future<?> deleting = holdLockedChange(owner, () -> teamService.deleteTeam(game.getId(), falcons.getId()), changed);

        BadRequestException refused = assertThrows(BadRequestException.class, () ->
                afterChangeUnwrapped(changed, owner, () -> publicationService.save(game.getId(), request("Renamed", falcons.getId()))));
        deleting.get(10, TimeUnit.SECONDS);

        assertEquals(ErrorCode.PUBLICATION_TEAM_INVALID, refused.getErrorCode());
        GamePublication row = publicationRepository.findById(game.getId()).orElseThrow();
        assertNull(row.getAdmissionTeam());
        assertEquals("Listed", row.getSummary());
    }

    /** Same as {@link #afterChange} but rethrows the worker's own exception type. */
    private <T> T afterChangeUnwrapped(CountDownLatch changed, User actor, java.util.concurrent.Callable<T> call) throws Exception {
        try {
            return afterChange(changed, actor, call);
        } catch (java.util.concurrent.ExecutionException e) {
            if (e.getCause() instanceof Exception cause) throw cause;
            throw e;
        }
    }
}
