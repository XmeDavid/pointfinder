package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** V62 schema contract: the two nullable practice-game columns on games. */
class PracticeGameSchemaTest extends IntegrationTestBase {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Map<String, Object> column(String name) {
        return jdbcTemplate.queryForMap(
                "SELECT data_type, is_nullable FROM information_schema.columns "
                        + "WHERE table_name = 'games' AND column_name = ?",
                name);
    }

    @Test
    void gamesCarryNullablePracticeColumns() {
        assertEquals("YES", column("tutorial_scenario").get("is_nullable"));
        assertEquals("character varying", column("tutorial_scenario").get("data_type"));
        assertEquals("YES", column("tutorial_expires_at").get("is_nullable"));
        assertEquals("timestamp with time zone", column("tutorial_expires_at").get("data_type"));
    }
}
