-- Migration 007: Stable dish identity — upsert key on (city_id, lower(name))
-- Replaces the (city_id, rank) unique constraint so re-discovery preserves UUIDs.
-- rank is no longer unique (two discoveries might temporarily assign the same rank).

ALTER TABLE dishes DROP CONSTRAINT IF EXISTS dishes_city_id_rank_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dishes_city_name
    ON dishes (city_id, lower(name));
