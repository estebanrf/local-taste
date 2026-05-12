-- Migration 010: Unified list type
-- Adds list_type to itineraries so one concept covers wishlist / trip / visited.
-- Migrates existing wishlist_items rows into itinerary + itinerary_items rows of type 'wishlist'.

-- 1. Add list_type column
ALTER TABLE itineraries
    ADD COLUMN IF NOT EXISTS list_type VARCHAR(20) NOT NULL DEFAULT 'trip';

-- 2. Create one 'wishlist' itinerary per user from existing wishlist_items
INSERT INTO itineraries (clerk_user_id, name, list_type, created_at, updated_at)
SELECT DISTINCT clerk_user_id, 'Wishlist', 'wishlist', NOW(), NOW()
FROM wishlist_items
ON CONFLICT DO NOTHING;

-- 3. Migrate wishlist_items into itinerary_items linked to those new itineraries
INSERT INTO itinerary_items (
    clerk_user_id, itinerary_id, dish_id, dish_name, city_name, country,
    notes, restaurant_ids, created_at, updated_at
)
SELECT
    wi.clerk_user_id,
    i.id AS itinerary_id,
    wi.dish_id,
    wi.dish_name,
    wi.city_name,
    wi.country,
    wi.notes,
    wi.restaurant_ids,
    wi.created_at,
    wi.updated_at
FROM wishlist_items wi
JOIN itineraries i
  ON i.clerk_user_id = wi.clerk_user_id
 AND i.list_type = 'wishlist'
ON CONFLICT DO NOTHING;
