-- Add category_type to itinerary_items to distinguish world_cuisine from occasion searches
-- Null for local dish items; 'world_cuisine' or 'occasion' for category items
ALTER TABLE itinerary_items ADD COLUMN category_type TEXT;
