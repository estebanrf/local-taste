-- Migration 005: Track specific saved restaurants on wishlist_items
-- Replaces single restaurant_id with a restaurant_ids JSONB array.
-- itinerary_items keeps its single restaurant_id (one pin = one place).

ALTER TABLE wishlist_items
    DROP COLUMN IF EXISTS restaurant_id,
    ADD COLUMN IF NOT EXISTS restaurant_ids JSONB NOT NULL DEFAULT '[]';

ALTER TABLE itinerary_items
    ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;
