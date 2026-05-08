#!/usr/bin/env python3
"""
Full integration test for Restaurant Ranker via Lambda invocation.
Requires the lt-ranker Lambda to be deployed and a dish to exist in the DB.
"""

import json
import time
import boto3
from dotenv import load_dotenv

load_dotenv(override=True)

from src import Database


def test_restaurant_ranker_lambda():
    db = Database()
    lambda_client = boto3.client("lambda")

    city = db.cities.find_by_slug("tokyo-japan")
    if not city:
        print("No city found. Run the dish-discoverer first.")
        return

    dishes = db.dishes.find_by_city(city["id"])
    if not dishes:
        print("No dishes found. Run the dish-discoverer first.")
        return

    dish = dishes[0]
    print(f"Testing with dish: {dish['name']}")

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
    print(f"Created job: {job_id}")

    response = lambda_client.invoke(
        FunctionName="lt-ranker",
        InvocationType="RequestResponse",
        Payload=json.dumps({"job_id": str(job_id)}),
    )

    result = json.loads(response["Payload"].read())
    print(f"Lambda response: {json.dumps(result, indent=2)}")

    time.sleep(2)
    job = db.jobs.find_by_id(str(job_id))
    restaurants = job.get("restaurants_payload", {}).get("restaurants", [])
    print(f"\nRestaurants saved: {len(restaurants)}")
    for r in restaurants:
        print(f"  {r.get('rank')}. {r.get('name')} — ★{r.get('google_rating', 'N/A')}")


if __name__ == "__main__":
    test_restaurant_ranker_lambda()
