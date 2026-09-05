package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Operator-side base editing for check-in methods: the game default seeds new
 * bases, an explicit method overrides it, the radius is clamped, and a
 * location base can never be saved at the null island.
 */
class BaseCheckInMethodServiceTest extends IntegrationTestBase {

    @Autowired
    private BaseService baseService;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private Game gameWithDefault(String key, CheckInMethod method, int radiusM) {
        User operator = createOperator("basemethod-" + key + "@test.com", "password");
        Game game = createGame(operator, "Base Method " + key, GameStatus.setup);
        game.setDefaultCheckInMethod(method);
        game.setDefaultCheckInRadiusM(radiusM);
        game = gameRepository.save(game);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        return game;
    }

    private CreateBaseRequest create(String name, Double lat, Double lng) {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName(name);
        request.setLat(lat);
        request.setLng(lng);
        return request;
    }

    @Test
    void newBasesInheritTheGameDefaultMethod() {
        Game game = gameWithDefault("inherit", CheckInMethod.QR, 25);

        BaseResponse created = baseService.createBase(game.getId(), create("Kiosk", 41.1, -8.6));

        assertEquals("QR", created.checkInMethod());
        assertNull(created.checkInRadiusM(), "no override means inherit");
    }

    @Test
    void anExplicitMethodAndRadiusWinOverTheDefault() {
        Game game = gameWithDefault("explicit", CheckInMethod.NFC, 15);
        CreateBaseRequest request = create("Clearing", 41.1, -8.6);
        request.setCheckInMethod("location");
        request.setCheckInRadiusM(45);

        BaseResponse created = baseService.createBase(game.getId(), request);

        assertEquals("LOCATION", created.checkInMethod());
        assertEquals(45, created.checkInRadiusM());
    }

    @Test
    void radiusIsClampedIntoTheSupportedBand() {
        Game game = gameWithDefault("clamp", CheckInMethod.LOCATION, 15);
        CreateBaseRequest tooSmall = create("Tiny", 41.1, -8.6);
        tooSmall.setCheckInRadiusM(1);
        CreateBaseRequest tooBig = create("Huge", 41.1, -8.6);
        tooBig.setCheckInRadiusM(9000);

        assertEquals(5, baseService.createBase(game.getId(), tooSmall).checkInRadiusM());
        assertEquals(200, baseService.createBase(game.getId(), tooBig).checkInRadiusM());
    }

    @Test
    void aLocationBaseCannotBeSavedAtNullIsland() {
        Game game = gameWithDefault("zero", CheckInMethod.LOCATION, 15);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> baseService.createBase(game.getId(), create("Nowhere", 0.0, 0.0)));

        assertEquals(true, error.getMessage().toLowerCase().contains("coordinates"));
    }

    @Test
    void anNfcBaseAtZeroZeroIsStillAllowed() {
        Game game = gameWithDefault("zeronfc", CheckInMethod.NFC, 15);

        BaseResponse created = baseService.createBase(game.getId(), create("Indoors", 0.0, 0.0));

        assertEquals("NFC", created.checkInMethod());
    }

    @Test
    void switchingAnExistingBaseToLocationAtZeroZeroIsRejected() {
        Game game = gameWithDefault("switch", CheckInMethod.NFC, 15);
        BaseResponse created = baseService.createBase(game.getId(), create("Indoors", 0.0, 0.0));

        UpdateBaseRequest update = new UpdateBaseRequest();
        update.setName("Indoors");
        update.setLat(0.0);
        update.setLng(0.0);
        update.setCheckInMethod("LOCATION");

        assertThrows(BadRequestException.class,
                () -> baseService.updateBase(game.getId(), created.id(), update));
    }

    @Test
    void sendingTheMethodWithABlankRadiusClearsTheOverride() {
        Game game = gameWithDefault("clear", CheckInMethod.LOCATION, 15);
        CreateBaseRequest request = create("Clearing", 41.1, -8.6);
        request.setCheckInRadiusM(45);
        BaseResponse created = baseService.createBase(game.getId(), request);
        assertEquals(45, created.checkInRadiusM());

        UpdateBaseRequest update = new UpdateBaseRequest();
        update.setName("Clearing");
        update.setLat(41.1);
        update.setLng(-8.6);
        update.setCheckInMethod("LOCATION");
        update.setCheckInRadiusM(null);

        assertNull(baseService.updateBase(game.getId(), created.id(), update).checkInRadiusM(),
                "the editor sends null for a blank field, which must inherit the game default again");
    }

    @Test
    void anUnknownMethodStringIsRejected() {
        Game game = gameWithDefault("unknown", CheckInMethod.NFC, 15);
        CreateBaseRequest request = create("Odd", 41.1, -8.6);
        request.setCheckInMethod("beacon");

        assertThrows(BadRequestException.class, () -> baseService.createBase(game.getId(), request));
    }

    @Test
    void updateLeavesTheMethodAloneWhenTheFieldIsOmitted() {
        Game game = gameWithDefault("keep", CheckInMethod.QR, 15);
        BaseResponse created = baseService.createBase(game.getId(), create("Kiosk", 41.1, -8.6));

        UpdateBaseRequest update = new UpdateBaseRequest();
        update.setName("Kiosk renamed");
        update.setLat(41.1);
        update.setLng(-8.6);

        assertEquals("QR", baseService.updateBase(game.getId(), created.id(), update).checkInMethod());
    }
}
