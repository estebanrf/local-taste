-- Add opening_hours to restaurants
ALTER TABLE restaurants ADD COLUMN opening_hours JSONB DEFAULT '[]'::jsonb;
