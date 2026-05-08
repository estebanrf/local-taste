#!/usr/bin/env python3
"""
Local test for Restaurant Ranker agent.
Requires a dish to already exist in the DB — run dish-discoverer first.
"""

import json
from dotenv import load_dotenv

load_dotenv(override=True)

from src import Database
from lambda_handler import lambda_handler


def test_restaurant_ranker():
    db = Database()

    # Find a dish to test with
    city = db.cities.find_by_slug("tokyo-japan")
    if not city:
        print("No city found with slug 'tokyo-japan'. Run dish-discoverer test first.")
        return

    dishes = db.dishes.find_by_city(city["id"])
    if not dishes:
        print("No dishes found for Tokyo. Run dish-discoverer test first.")
        return

    dish = dishes[0]
    print(f"Testing with dish: {dish['name']} (id={dish['id']})")

    job_id = db.jobs.create_job(
        clerk_user_id="test_user_001",
        job_type="restaurant_ranking",
        request_payload={
            "dish_id": dish["id"],
            "dish_name": dish["name"],
            "city": city["name"],
            "country": city["country"],
        },
    )
    print(f"Created test job: {job_id}")

    result = lambda_handler({"job_id": str(job_id)}, None)
    print(f"Status: {result['statusCode']}")

    body = json.loads(result["body"])
    if result["statusCode"] == 200:
        job = db.jobs.find_by_id(str(job_id))
        restaurants_payload = job.get("restaurants_payload", {})
        restaurants = restaurants_payload.get("restaurants", [])
        print(f"Restaurants saved: {len(restaurants)}")
        for r in restaurants:
            rating = r.get("google_rating", "N/A")
            print(f"  {r.get('rank')}. {r.get('name')} — ★{rating}")
    else:
        print(f"Error: {body.get('error')}")


if __name__ == "__main__":
    test_restaurant_ranker()
