#!/usr/bin/env python3
"""
Full integration test for Dish Discoverer via Lambda invocation.
Requires the lt-discoverer Lambda to be deployed.
"""

import json
import time
import boto3
from dotenv import load_dotenv

load_dotenv(override=True)

from src import Database


def test_dish_discoverer_lambda():
    db = Database()
    lambda_client = boto3.client("lambda")

    job_id = db.jobs.create_job(
        clerk_user_id="test_user_001",
        job_type="city_discovery",
        request_payload={"city": "Tokyo", "country": "Japan", "slug": "tokyo-japan"},
    )
    print(f"Created job: {job_id}")

    response = lambda_client.invoke(
        FunctionName="lt-discoverer",
        InvocationType="RequestResponse",
        Payload=json.dumps({"job_id": str(job_id)}),
    )

    result = json.loads(response["Payload"].read())
    print(f"Lambda response: {json.dumps(result, indent=2)}")

    time.sleep(2)
    job = db.jobs.find_by_id(str(job_id))
    dishes = job.get("dishes_payload", {}).get("dishes", [])
    print(f"\nDishes saved: {len(dishes)}")
    for d in dishes:
        print(f"  {d.get('rank')}. {d.get('name')}")


if __name__ == "__main__":
    test_dish_discoverer_lambda()
