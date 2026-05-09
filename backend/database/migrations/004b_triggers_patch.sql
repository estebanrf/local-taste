-- Migration 004b: Add missing triggers for itineraries and wishlist_items
-- Avoids dollar-quoted DO blocks (not supported by apply_migration.py splitter)

DROP TRIGGER IF EXISTS update_itineraries_updated_at ON itineraries;
CREATE TRIGGER update_itineraries_updated_at
    BEFORE UPDATE ON itineraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wishlist_updated_at ON wishlist_items;
CREATE TRIGGER update_wishlist_updated_at
    BEFORE UPDATE ON wishlist_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
