package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * V61 schema contract: the composite primary key, the nullability of every
 * column, and the cascade that removes a deleted operator's tutorial rows.
 */
class TutorialProgressSchemaTest extends IntegrationTestBase {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Map<String, Object> column(String name) {
        return jdbcTemplate.queryForMap(
                "SELECT data_type, is_nullable FROM information_schema.columns "
                        + "WHERE table_name = 'user_tutorial_progress' AND column_name = ?",
                name);
    }

    @Test
    void tableCarriesEveryColumnWithTheRightNullability() {
        assertEquals("NO", column("user_id").get("is_nullable"));
        assertEquals("uuid", column("user_id").get("data_type"));

        assertEquals("NO", column("scenario_id").get("is_nullable"));
        assertEquals("character varying", column("scenario_id").get("data_type"));

        assertEquals("NO", column("status").get("is_nullable"));
        assertEquals("character varying", column("status").get("data_type"));

        assertEquals("YES", column("current_step").get("is_nullable"));
        assertEquals("YES", column("game_id").get("is_nullable"));
        assertEquals("uuid", column("game_id").get("data_type"));

        assertEquals("NO", column("started_at").get("is_nullable"));
        assertEquals("YES", column("completed_at").get("is_nullable"));
        assertEquals("NO", column("updated_at").get("is_nullable"));
    }

    @Test
    void primaryKeyIsUserPlusScenario() {
        List<String> pkColumns = jdbcTemplate.queryForList(
                "SELECT a.attname FROM pg_index i "
                        + "JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) "
                        + "WHERE i.indrelid = 'user_tutorial_progress'::regclass AND i.indisprimary "
                        + "ORDER BY a.attname",
                String.class);

        assertEquals(List.of("scenario_id", "user_id"), pkColumns);
    }

    @Test
    void deletingTheUserRemovesTheirTutorialRows() {
        var user = createOperator("schema-cascade@test.com", "password");
        jdbcTemplate.update(
                "INSERT INTO user_tutorial_progress (user_id, scenario_id, status) VALUES (?, ?, ?)",
                user.getId(), "first-game", "IN_PROGRESS");

        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM user_tutorial_progress WHERE user_id = ?", Integer.class, user.getId()));

        jdbcTemplate.update("DELETE FROM users WHERE id = ?", user.getId());

        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM user_tutorial_progress WHERE user_id = ?", Integer.class, user.getId()));
    }

    @Test
    void startedAtAndUpdatedAtDefaultToNow() {
        var user = createOperator("schema-defaults@test.com", "password");
        jdbcTemplate.update(
                "INSERT INTO user_tutorial_progress (user_id, scenario_id, status) VALUES (?, ?, ?)",
                user.getId(), "fixed-route", "SKIPPED");

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT started_at, updated_at FROM user_tutorial_progress WHERE user_id = ?", user.getId());

        assertNotNull(row.get("started_at"));
        assertNotNull(row.get("updated_at"));
    }
}
