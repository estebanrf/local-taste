-- Migration 004: Named itineraries + wishlist
-- Adds named trip support and a per-user wishlist

-- 1. Named itineraries table
CREATE TABLE IF NOT EXISTS itineraries (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id VARCHAR(255) REFERENCES users(clerk_user_id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itineraries_user ON itineraries(clerk_user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_itineraries_updated_at') THEN
    CREATE TRIGGER update_itineraries_updated_at
      BEFORE UPDATE ON itineraries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- 2. Wishlist items table
CREATE TABLE IF NOT EXISTS wishlist_items (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id VARCHAR(255) REFERENCES users(clerk_user_id) ON DELETE CASCADE,
    dish_id       UUID REFERENCES dishes(id) ON DELETE SET NULL,
    dish_name     VARCHAR(255) NOT NULL,
    city_name     VARCHAR(255) NOT NULL,
    country       VARCHAR(255) NOT NULL,
    notes         TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(clerk_user_id, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(clerk_user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_wishlist_updated_at') THEN
    CREATE TRIGGER update_wishlist_updated_at
      BEFORE UPDATE ON wishlist_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- 3. Add itinerary_id FK to itinerary_items (nullable during migration/backfill)
ALTER TABLE itinerary_items
    ADD COLUMN IF NOT EXISTS itinerary_id UUID REFERENCES itineraries(id) ON DELETE CASCADE;


-- 4. Backfill: create a "My Trip" itinerary for each user who already has items
WITH new_trips AS (
    INSERT INTO itineraries (clerk_user_id, name)
    SELECT DISTINCT clerk_user_id, 'My Trip'
    FROM itinerary_items
    WHERE itinerary_id IS NULL
    RETURNING id, clerk_user_id
)
UPDATE itinerary_items ii
SET itinerary_id = nt.id
FROM new_trips nt
WHERE ii.clerk_user_id = nt.clerk_user_id
  AND ii.itinerary_id IS NULL;


-- 5. Drop the old per-user per-dish uniqueness constraint, add per-itinerary constraint
ALTER TABLE itinerary_items
    DROP CONSTRAINT IF EXISTS itinerary_items_clerk_user_id_dish_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_items_trip_dish
    ON itinerary_items(itinerary_id, dish_id)
    WHERE itinerary_id IS NOT NULL AND dish_id IS NOT NULL;
