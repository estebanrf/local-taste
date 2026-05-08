#!/usr/bin/env python3
"""
Full end-to-end test — invokes lt-discoverer then lt-ranker via Lambda.
Requires both Lambdas to be deployed and a real DB connection.
"""

import json
import time
import boto3
from dotenv import load_dotenv

load_dotenv(override=True)

from database.src import Database


def poll_job(db: Database, job_id: str, timeout: int = 120) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = db.jobs.find_by_id(job_id)
        if job and job["status"] in ("completed", "failed"):
            return job
        time.sleep(3)
    raise TimeoutError(f"Job {job_id} did not complete within {timeout}s")


def main():
    db = Database()
    lambda_client = boto3.client("lambda")

    city = "Tokyo"
    country = "Japan"
    slug = "tokyo-japan"
    test_user = "test_user_001"

    # ── Step 1: Dish Discovery ────────────────────────────────────────────────
    print(f"Step 1: Discover dishes for {city}, {country}")
    job_id = db.jobs.create_job(
        clerk_user_id=test_user,
        job_type="city_discovery",
        request_payload={"city": city, "country": country, "slug": slug},
    )
    print(f"  Job: {job_id}")

    lambda_client.invoke(
        FunctionName="lt-discoverer",
        InvocationType="Event",
        Payload=json.dumps({"job_id": str(job_id)}),
    )

    job = poll_job(db, str(job_id))
    if job["status"] != "completed":
        print(f"  FAILED: {job.get('error_message')}")
        return

    city_obj = db.cities.find_by_slug(slug)
    dishes = db.dishes.find_by_city(city_obj["id"]) if city_obj else []
    print(f"  Dishes saved: {len(dishes)}")
    for d in dishes:
        print(f"    {d['rank']}. {d['name']}")

    if not dishes:
        print("No dishes — stopping.")
        return

    # ── Step 2: Restaurant Ranking ────────────────────────────────────────────
    dish = dishes[0]
    print(f"\nStep 2: Rank restaurants for '{dish['name']}'")
    job_id2 = db.jobs.create_job(
        clerk_user_id=test_user,
        job_type="restaurant_ranking",
        request_payload={
            "dish_id": dish["id"],
            "dish_name": dish["name"],
            "city": city,
            "country": country,
        },
    )
    print(f"  Job: {job_id2}")

    lambda_client.invoke(
        FunctionName="lt-ranker",
        InvocationType="Event",
        Payload=json.dumps({"job_id": str(job_id2)}),
    )

    job2 = poll_job(db, str(job_id2))
    if job2["status"] != "completed":
        print(f"  FAILED: {job2.get('error_message')}")
        return

    restaurants = job2.get("restaurants_payload", {}).get("restaurants", [])
    print(f"  Restaurants saved: {len(restaurants)}")
    for r in restaurants:
        print(f"    {r['rank']}. {r['name']} — ★{r.get('google_rating', 'N/A')}")

    print("\nDone!")


if __name__ == "__main__":
    main()
