-- Add photo URL and review snippets to restaurants
ALTER TABLE restaurants ADD COLUMN photo_url TEXT;
ALTER TABLE restaurants ADD COLUMN reviews JSONB DEFAULT '[]'::jsonb;
