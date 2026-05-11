-- Migration 006: Replace single restaurant_id on itinerary_items with restaurant_ids JSONB array
-- Mirrors the same change done to wishlist_items in migration 005.

ALTER TABLE itinerary_items
    DROP COLUMN IF EXISTS restaurant_id;

ALTER TABLE itinerary_items
    ADD COLUMN IF NOT EXISTS restaurant_ids JSONB NOT NULL DEFAULT '[]';
