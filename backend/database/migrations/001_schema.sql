-- Local Taste Database Schema
-- Version: 001
-- Description: Food passport platform - city dish discovery and restaurant ranking

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Minimal users table (Clerk handles auth)
CREATE TABLE IF NOT EXISTS users (
    clerk_user_id VARCHAR(255) PRIMARY KEY,
    display_name  VARCHAR(255),
    home_city     VARCHAR(255),   -- optional: user's home city for personalisation
    dietary_notes TEXT,           -- optional: allergies, preferences, etc.

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cached city research (shared across all users, re-used to save AI calls)
CREATE TABLE IF NOT EXISTS cities (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,       -- "Tokyo"
    country     VARCHAR(255) NOT NULL,       -- "Japan"
    slug        VARCHAR(255) NOT NULL,       -- "tokyo-japan"  (used for lookups)
    description TEXT,                        -- short intro blurb
    last_researched_at TIMESTAMP,

    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),

    UNIQUE(slug)
);

-- Top dishes per city (populated by DishDiscoverer agent)
CREATE TABLE IF NOT EXISTS dishes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id     UUID REFERENCES cities(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,       -- "Ramen"
    description TEXT,                        -- what it is, why it's iconic
    rank        INTEGER NOT NULL,            -- 1-5
    cuisine_type VARCHAR(100),               -- "Japanese", "Italian", etc.
    tags        JSONB DEFAULT '[]',          -- ["noodle","soup","umami"]
    image_query VARCHAR(255),                -- suggested search term for images

    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),

    UNIQUE(city_id, rank)
);

-- Restaurants per dish (populated by RestaurantRanker agent)
CREATE TABLE IF NOT EXISTS restaurants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id         UUID REFERENCES dishes(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    address         TEXT,
    google_maps_url TEXT,
    google_rating   DECIMAL(3,1),            -- e.g. 4.7
    review_count    INTEGER,
    price_level     VARCHAR(10),             -- "$", "$$", "$$$", "$$$$"
    rank            INTEGER NOT NULL,        -- 1-5  (AI-computed composite rank)
    rank_rationale  TEXT,                    -- why this rank
    highlights      JSONB DEFAULT '[]',      -- ["authentic","queue worth it"]
    latitude        DOUBLE PRECISION,        -- extracted from Maps URL or geocoded
    longitude       DOUBLE PRECISION,
    last_updated_at TIMESTAMP,

    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    UNIQUE(dish_id, rank)
);

-- Per-user food passport entries
CREATE TABLE IF NOT EXISTS passport_entries (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id VARCHAR(255) REFERENCES users(clerk_user_id) ON DELETE CASCADE,
    dish_id       UUID REFERENCES dishes(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
    tasted_at     DATE DEFAULT CURRENT_DATE,
    rating        INTEGER,                   -- user's personal 1-5 rating
    notes         TEXT,                      -- free-text personal notes

    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),

    UNIQUE(clerk_user_id, dish_id)           -- one entry per dish per user
);

-- Async jobs (city discovery + restaurant ranking)
CREATE TABLE IF NOT EXISTS jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id   VARCHAR(255) REFERENCES users(clerk_user_id) ON DELETE CASCADE,
    job_type        VARCHAR(50) NOT NULL,    -- 'city_discovery' | 'restaurant_ranking'
    status          VARCHAR(20) DEFAULT 'pending', -- pending/running/completed/failed
    request_payload JSONB,                   -- {city, country} or {dish_id, dish_name, city}

    -- Separate payload fields per agent (no merging)
    dishes_payload      JSONB,               -- DishDiscoverer: top-5 dishes JSON
    restaurants_payload JSONB,               -- RestaurantRanker: ranked restaurants JSON
    summary_payload     JSONB,               -- Planner metadata

    error_message TEXT,

    created_at   TIMESTAMP DEFAULT NOW(),
    started_at   TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT NOW()
);

-- Culinary travel itinerary (one pin per dish per user)
CREATE TABLE IF NOT EXISTS itinerary_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id   VARCHAR(255) REFERENCES users(clerk_user_id) ON DELETE CASCADE,
    dish_id         UUID REFERENCES dishes(id) ON DELETE SET NULL,
    dish_name       VARCHAR(255) NOT NULL,
    city_name       VARCHAR(255) NOT NULL,
    country         VARCHAR(255) NOT NULL,
    notes           TEXT,

    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    UNIQUE(clerk_user_id, dish_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cities_slug          ON cities(slug);
CREATE INDEX IF NOT EXISTS idx_dishes_city          ON dishes(city_id);
CREATE INDEX IF NOT EXISTS idx_dishes_rank          ON dishes(city_id, rank);
CREATE INDEX IF NOT EXISTS idx_restaurants_dish     ON restaurants(dish_id);
CREATE INDEX IF NOT EXISTS idx_passport_user        ON passport_entries(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_passport_dish        ON passport_entries(dish_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user            ON jobs(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status          ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_itinerary_user       ON itinerary_items(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_dish       ON itinerary_items(dish_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cities_updated_at       BEFORE UPDATE ON cities       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dishes_updated_at       BEFORE UPDATE ON dishes       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_restaurants_updated_at  BEFORE UPDATE ON restaurants  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_passport_updated_at     BEFORE UPDATE ON passport_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at         BEFORE UPDATE ON jobs         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_itinerary_updated_at    BEFORE UPDATE ON itinerary_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
