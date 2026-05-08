-- Migration 002: Add lat/lng columns to restaurants table
-- Safe to run on live data — adds nullable columns, no data loss.

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
