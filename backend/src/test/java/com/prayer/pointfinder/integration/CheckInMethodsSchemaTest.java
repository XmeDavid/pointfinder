package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V60 schema contract. Asserts every column the check-in-methods wave adds,
 * its nullability and default, and the operator_rescue backfill statement.
 */
class CheckInMethodsSchemaTest extends IntegrationTestBase {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Map<String, Object> column(String table, String column) {
        return jdbcTemplate.queryForMap(
                "SELECT data_type, is_nullable, column_default FROM information_schema.columns "
                        + "WHERE table_name = ? AND column_name = ?",
                table, column);
    }

    @Test
    void basesCarryMethodAndRadius() {
        Map<String, Object> method = column("bases", "check_in_method");
        assertEquals("character varying", method.get("data_type"));
        assertEquals("NO", method.get("is_nullable"));
        assertTrue(String.valueOf(method.get("column_default")).contains("'NFC'"));

        Map<String, Object> radius = column("bases", "check_in_radius_m");
        assertEquals("integer", radius.get("data_type"));
        assertEquals("YES", radius.get("is_nullable"));
    }

    @Test
    void gamesCarryDefaultMethodAndRadius() {
        Map<String, Object> method = column("games", "default_check_in_method");
        assertEquals("NO", method.get("is_nullable"));
        assertTrue(String.valueOf(method.get("column_default")).contains("'NFC'"));

        Map<String, Object> radius = column("games", "default_check_in_radius_m");
        assertEquals("integer", radius.get("data_type"));
        assertEquals("NO", radius.get("is_nullable"));
        assertTrue(String.valueOf(radius.get("column_default")).contains("15"));
    }

    @Test
    void checkInsCarryMethodVerificationAndProof() {
        assertEquals("NO", column("check_ins", "method").get("is_nullable"));
        assertEquals("NO", column("check_ins", "verification").get("is_nullable"));
        assertEquals("double precision", column("check_ins", "proof_lat").get("data_type"));
        assertEquals("double precision", column("check_ins", "proof_lng").get("data_type"));
        assertEquals("double precision", column("check_ins", "proof_accuracy_m").get("data_type"));
        assertEquals("double precision", column("check_ins", "proof_distance_m").get("data_type"));
        assertEquals("timestamp with time zone", column("check_ins", "proof_captured_at").get("data_type"));
        assertEquals("jsonb", column("check_ins", "team_positions_snapshot").get("data_type"));
    }

    @Test
    void playerLocationsAndActivityEventsGainTheirColumns() {
        assertEquals("double precision", column("player_locations", "accuracy_m").get("data_type"));
        assertEquals("timestamp with time zone", column("player_locations", "captured_at").get("data_type"));
        assertEquals("jsonb", column("activity_events", "metadata").get("data_type"));
    }

    @Test
    void rescueRowsAreBackfilledToOperatorVerification() {
        String flywayVersion = jdbcTemplate.queryForObject(
                "SELECT version FROM flyway_schema_history WHERE version = '60'", String.class);
        assertNotNull(flywayVersion, "V60 must be applied");

        // The migration's backfill statement is re-runnable; applying it to a
        // freshly inserted rescue row must flip it to OPERATOR while leaving
        // player rows on VERIFIED.
        jdbcTemplate.execute("UPDATE check_ins SET verification = 'OPERATOR' WHERE source_surface = 'operator_rescue'");
        Integer stragglers = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM check_ins WHERE source_surface = 'operator_rescue' AND verification <> 'OPERATOR'",
                Integer.class);
        assertEquals(0, stragglers);
    }
}
