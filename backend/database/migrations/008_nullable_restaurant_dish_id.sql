-- Migration 008: Allow restaurants without a dish_id (category-mode restaurants)
ALTER TABLE restaurants
    ALTER COLUMN dish_id DROP NOT NULL;
