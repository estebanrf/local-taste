#!/usr/bin/env python3
"""
Local test for Dish Discoverer agent.
Creates a real job in the DB and invokes the lambda handler directly.
"""

import json
from dotenv import load_dotenv

load_dotenv(override=True)

from src import Database
from lambda_handler import lambda_handler


def test_dish_discoverer():
    db = Database()

    job_id = db.jobs.create_job(
        clerk_user_id="test_user_001",
        job_type="city_discovery",
        request_payload={"city": "Tokyo", "country": "Japan", "slug": "tokyo-japan"},
    )
    print(f"Created test job: {job_id}")

    result = lambda_handler({"job_id": str(job_id)}, None)
    print(f"Status: {result['statusCode']}")

    body = json.loads(result["body"])
    if result["statusCode"] == 200:
        job = db.jobs.find_by_id(str(job_id))
        dishes_payload = job.get("dishes_payload", {})
        dishes = dishes_payload.get("dishes", [])
        print(f"Dishes saved: {len(dishes)}")
        for d in dishes:
            print(f"  {d.get('rank')}. {d.get('name')} ({d.get('cuisine_type')})")
    else:
        print(f"Error: {body.get('error')}")


if __name__ == "__main__":
    test_dish_discoverer()
