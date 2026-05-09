#!/usr/bin/env python3
"""
Database Reset Script - drops all tables, recreates schema, and loads seed data.
"""

import sys
import subprocess
import argparse
from src.client import DataAPIClient
from src.models import Database


def drop_all_tables(db: DataAPIClient):
    print("Dropping existing tables...")
    tables = [
        "wishlist_items",
        "itinerary_items",
        "itineraries",
        "passport_entries",
        "restaurants",
        "dishes",
        "cities",
        "jobs",
        "users",
    ]
    for table in tables:
        try:
            db.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
            print(f"  Dropped {table}")
        except Exception as e:
            print(f"  Error dropping {table}: {e}")

    try:
        db.execute("DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE")
    except Exception:
        pass


def create_test_user(db: Database):
    print("\nCreating test user...")
    existing = db.users.find_by_clerk_id("test_user_001")
    if existing:
        print("  Test user already exists")
        return
    db.users.create_user(
        clerk_user_id="test_user_001",
        display_name="Test User",
    )
    print("  Created test_user_001")


def main():
    parser = argparse.ArgumentParser(description="Reset Local Taste database")
    parser.add_argument("--with-test-data", action="store_true", help="Create a test user")
    parser.add_argument("--skip-drop", action="store_true", help="Skip dropping tables")
    args = parser.parse_args()

    print("Database Reset")
    print("=" * 50)

    db_client = DataAPIClient()
    db = Database()

    if not args.skip_drop:
        drop_all_tables(db_client)

        print("\nRunning migrations...")
        result = subprocess.run(["uv", "run", "run_migrations.py"], capture_output=True, text=True)
        if result.returncode != 0:
            print("Migration failed!")
            print(result.stderr)
            sys.exit(1)
        print("Migrations complete")

    if args.with_test_data:
        create_test_user(db)

    print("\nVerification...")
    for table in ["users", "cities", "dishes", "restaurants", "passport_entries", "jobs"]:
        result = db_client.query(f"SELECT COUNT(*) as count FROM {table}")
        count = result[0]["count"] if result else 0
        print(f"  {table}: {count} records")

    print("\nDone!")


if __name__ == "__main__":
    main()
