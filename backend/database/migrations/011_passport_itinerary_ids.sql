-- Migration 011: Add itinerary_ids to passport_entries
-- Links a tasting event to the trip(s) it was logged from.
-- Stored as jsonb (consistent with restaurant_ids on other tables).
ALTER TABLE passport_entries
    ADD COLUMN IF NOT EXISTS itinerary_ids jsonb NOT NULL DEFAULT '[]';
