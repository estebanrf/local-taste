-- Migration 013: Allow passport entries for category items (no dish_id)
-- Mirrors how itinerary_items handles free-text category entries.

ALTER TABLE passport_entries ALTER COLUMN dish_id DROP NOT NULL;

ALTER TABLE passport_entries ADD COLUMN IF NOT EXISTS dish_name VARCHAR(255);
ALTER TABLE passport_entries ADD COLUMN IF NOT EXISTS city_name VARCHAR(255);
ALTER TABLE passport_entries ADD COLUMN IF NOT EXISTS country  VARCHAR(255);

-- Separate unique indexes for dish-based vs category-based entries
DROP INDEX IF EXISTS passport_entries_unique_dish_restaurant;

CREATE UNIQUE INDEX IF NOT EXISTS passport_entries_unique_dish_restaurant
    ON passport_entries (clerk_user_id, dish_id, COALESCE(restaurant_id::text, 'null'))
    WHERE dish_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS passport_entries_unique_category_restaurant
    ON passport_entries (clerk_user_id, dish_name, city_name, COALESCE(restaurant_id::text, 'null'))
    WHERE dish_id IS NULL;
