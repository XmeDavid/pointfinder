package com.prayer.pointfinder.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.response.AuditEntryDto;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.AuditExportService.AuditExportQuery;
import com.prayer.pointfinder.service.AuditExportService.AuditExportResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * An incident review of a claimed check-in needs the proof itself, not just
 * "team X checked in". The export therefore carries the method, the strength
 * of the proof, and the raw fix and teammate snapshot as one JSON column.
 */
class AuditExportCheckInProofTest extends IntegrationTestBase {

    @Autowired
    private AuditExportService auditExportService;

    @Autowired
    private PlayerService playerService;

    /** The Spring-configured mapper, so Instant fields round-trip. */
    @Autowired
    private ObjectMapper mapper;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private Game setUpGeoCheckIn(String key) {
        User operator = createOperator("auditproof-" + key + "@test.com", "password");
        Game game = createGame(operator, "Audit Proof Game " + key, GameStatus.live);
        Team team = createTeam(game, "Wolves", ("AU" + key + "0001").substring(0, 6));
        Player player = createPlayer(team, "Scout", "device-auditproof-" + key);
        Base base = createBase(game, "Clearing");
        base.setLat(41.100000);
        base.setLng(-8.600000);
        base.setCheckInMethod(CheckInMethod.LOCATION);
        base.setCheckInRadiusM(20);
        base = baseRepository.save(base);

        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(41.100000 + 5.0 / 111_195.0);
        request.setLng(-8.600000);
        request.setAccuracy(7.0);
        request.setCapturedAt(Instant.now());
        request.setClaimed(false);
        playerService.checkIn(game.getId(), base.getId(), player, request);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        return game;
    }

    @Test
    void jsonExportCarriesTheProof() throws Exception {
        Game game = setUpGeoCheckIn("j");

        AuditExportResult result = auditExportService.export(new AuditExportQuery(
                game.getId(), "json", null, null, null, null, null, null, null, null));

        List<AuditEntryDto> entries = mapper.readValue(result.body(), new TypeReference<>() {});
        AuditEntryDto checkIn = entries.stream()
                .filter(e -> "check_in".equals(e.type())).findFirst().orElseThrow();

        assertEquals("LOCATION", checkIn.details().checkInMethod());
        assertEquals("VERIFIED", checkIn.details().checkInVerification());
        assertNotNull(checkIn.details().checkInProof());
        assertTrue(checkIn.details().checkInProof().contains("accuracyM"));
    }

    @Test
    void csvExportAppendsTheThreeColumnsAfterArchived() {
        Game game = setUpGeoCheckIn("c");

        AuditExportResult result = auditExportService.export(new AuditExportQuery(
                game.getId(), "csv", null, null, null, null, null, null, null, null));

        String[] lines = result.body().split("\r\n");
        String header = lines[0];
        assertTrue(header.endsWith("archived,check_in_method,check_in_verification,check_in_proof"), header);
        assertTrue(result.body().contains("LOCATION"), result.body());
        assertTrue(result.body().contains("VERIFIED"), result.body());
    }
}
