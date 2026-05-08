-- Migration 003: Culinary travel itinerary
-- Safe to run on live data — adds a new table only.

CREATE TABLE IF NOT EXISTS itinerary_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id   VARCHAR(255) REFERENCES users(clerk_user_id) ON DELETE CASCADE,
    dish_id         UUID REFERENCES dishes(id) ON DELETE SET NULL,
    dish_name       VARCHAR(255) NOT NULL,   -- snapshot so item survives dish purge
    city_name       VARCHAR(255) NOT NULL,
    country         VARCHAR(255) NOT NULL,
    notes           TEXT,

    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    UNIQUE(clerk_user_id, dish_id)           -- one pin per dish per user
);

CREATE INDEX IF NOT EXISTS idx_itinerary_user ON itinerary_items(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_dish ON itinerary_items(dish_id);

CREATE TRIGGER update_itinerary_updated_at
    BEFORE UPDATE ON itinerary_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
