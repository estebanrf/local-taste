-- Migration 005: Add restaurant_id to itinerary_items and wishlist_items
-- Allows saving a specific restaurant alongside a dish.

ALTER TABLE itinerary_items
    ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;

ALTER TABLE wishlist_items
    ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;
