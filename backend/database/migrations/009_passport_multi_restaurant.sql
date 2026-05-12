-- Allow multiple passport entries per dish (one per restaurant visited)
-- Drop the old unique constraint that only allowed one entry per dish per user
ALTER TABLE passport_entries DROP CONSTRAINT IF EXISTS passport_entries_clerk_user_id_dish_id_key;

-- New constraint: one entry per user+dish+restaurant combination
-- restaurant_id can be NULL (dish eaten without a specific restaurant)
-- but only one NULL entry per dish per user
CREATE UNIQUE INDEX IF NOT EXISTS passport_entries_unique_dish_restaurant
    ON passport_entries (clerk_user_id, dish_id, COALESCE(restaurant_id::text, 'null'));
