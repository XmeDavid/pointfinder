package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.dto.response.QuotaResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.IndividualTier;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserSubscription;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.TestPropertySource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Location check-in is a paid feature: the free tier builds NFC and QR
 * bases only. The gate sits where a base becomes a location base (create,
 * update, game default, import) and again at go-live, so a plan downgrade
 * cannot leave a live game the plan does not cover.
 */
@TestPropertySource(properties = "app.quota.enforcement-enabled=true")
class LocationCheckInEntitlementTest extends IntegrationTestBase {

    @Autowired
    private BaseService baseService;
    @Autowired
    private GameService gameService;
    @Autowired
    private GameReadinessValidator readinessValidator;
    @Autowired
    private QuotaService quotaService;
    @Autowired
    private UserSubscriptionRepository userSubscriptionRepository;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private User signedInOperator(String key, IndividualTier tier, Map<String, Object> overrides) {
        User operator = createOperator("loc-entitlement-" + key + "@test.com", "password");
        userSubscriptionRepository.save(UserSubscription.builder()
                .user(operator)
                .tier(tier)
                .quotaOverrides(overrides)
                .build());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        return operator;
    }

    private CreateBaseRequest locationBase(String name) {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName(name);
        request.setLat(41.1);
        request.setLng(-8.6);
        request.setCheckInMethod("LOCATION");
        request.setCheckInRadiusM(20);
        return request;
    }

    private static ErrorCode codeOf(BadRequestException error) {
        return error.getErrorCode();
    }

    @Test
    void freeTierCannotCreateALocationBase() {
        User operator = signedInOperator("free-create", IndividualTier.free, null);
        Game game = createGame(operator, "Free game", GameStatus.setup);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> baseService.createBase(game.getId(), locationBase("Clearing")));
        assertEquals(ErrorCode.QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED, codeOf(error));
    }

    @Test
    void freeTierStillBuildsNfcAndQrBases() {
        User operator = signedInOperator("free-nfc-qr", IndividualTier.free, null);
        Game game = createGame(operator, "Free game", GameStatus.setup);

        CreateBaseRequest nfc = locationBase("Tag");
        nfc.setCheckInMethod("NFC");
        CreateBaseRequest qr = locationBase("Kiosk");
        qr.setCheckInMethod("QR");

        assertEquals("NFC", baseService.createBase(game.getId(), nfc).checkInMethod());
        assertEquals("QR", baseService.createBase(game.getId(), qr).checkInMethod());
    }

    @Test
    void freeTierCannotSwitchAnExistingBaseToLocation() {
        User operator = signedInOperator("free-switch", IndividualTier.free, null);
        Game game = createGame(operator, "Free game", GameStatus.setup);
        Base existing = createBase(game, "Tag");

        UpdateBaseRequest update = new UpdateBaseRequest();
        update.setName("Tag");
        update.setLat(41.1);
        update.setLng(-8.6);
        update.setCheckInMethod("LOCATION");

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> baseService.updateBase(game.getId(), existing.getId(), update));
        assertEquals(ErrorCode.QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED, codeOf(error));
    }

    @Test
    void freeTierCannotMakeLocationTheGameDefault() {
        User operator = signedInOperator("free-default", IndividualTier.free, null);
        Game game = createGame(operator, "Free game", GameStatus.setup);

        UpdateGameRequest update = new UpdateGameRequest();
        update.setDefaultCheckInMethod("LOCATION");

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> gameService.updateGame(game.getId(), update));
        assertEquals(ErrorCode.QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED, codeOf(error));
    }

    @Test
    void proTierCreatesLocationBases() {
        User operator = signedInOperator("pro", IndividualTier.pro, null);
        Game game = createGame(operator, "Pro game", GameStatus.setup);

        BaseResponse created = baseService.createBase(game.getId(), locationBase("Clearing"));
        assertEquals("LOCATION", created.checkInMethod());
    }

    @Test
    void anAdminOverrideGrantsLocationToAFreeAccount() {
        User operator = signedInOperator("override", IndividualTier.free,
                Map.of(QuotaService.LOCATION_CHECK_IN_KEY, true));
        Game game = createGame(operator, "Granted game", GameStatus.setup);

        assertDoesNotThrow(() -> baseService.createBase(game.getId(), locationBase("Clearing")));
    }

    @Test
    void goLiveIsBlockedWhenAFreeGameStillHoldsALocationBase() {
        User operator = signedInOperator("free-golive", IndividualTier.free, null);
        Game game = createGame(operator, "Downgraded game", GameStatus.setup);
        createTeam(game, "Team", "LOCENT");
        createChallenge(game, "Challenge", AnswerType.text, 10);
        // Written while the plan covered it; the plan has since lapsed.
        baseRepository.save(Base.builder()
                .game(game).name("Clearing").description("")
                .lat(41.1).lng(-8.6).nfcLinked(false)
                .checkInMethod(CheckInMethod.LOCATION).checkInRadiusM(20)
                .build());

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> readinessValidator.validateGoLivePrerequisites(game));
        assertEquals(ErrorCode.QUOTA_LOCATION_CHECK_IN_NOT_ALLOWED, codeOf(error));
    }

    @Test
    void quotaResponseTellsTheClientWhetherLocationIsIncluded() {
        signedInOperator("free-quota", IndividualTier.free, null);
        QuotaResponse free = quotaService.getPersonalQuota();
        assertFalse(free.limits().locationCheckIn());

        signedInOperator("pro-quota", IndividualTier.pro, null);
        QuotaResponse pro = quotaService.getPersonalQuota();
        assertTrue(pro.limits().locationCheckIn());
    }
}
