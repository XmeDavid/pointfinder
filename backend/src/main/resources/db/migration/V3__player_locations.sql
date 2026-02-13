-- Player Locations (one per player, upserted on each location update)
-- Replaces team_locations which stored only one location per team (last write wins).
-- ============================================================
CREATE TABLE player_locations (
    player_id   UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
