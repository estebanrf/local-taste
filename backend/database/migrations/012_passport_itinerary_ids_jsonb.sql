-- Migration 012: Convert passport_entries.itinerary_ids from uuid[] to jsonb
-- Consistent with how restaurant_ids is stored on other tables.
ALTER TABLE passport_entries
    ALTER COLUMN itinerary_ids TYPE jsonb USING to_jsonb(itinerary_ids);
