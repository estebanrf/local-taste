"""
Local Taste Planner - Lambda handler.
Simple router: inspects job_type and directly invokes the right agent Lambda.
No AI needed here — routing is deterministic.
"""

import os
import json
import boto3
import logging
from typing import Dict, Any

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

from src import Database

logger = logging.getLogger()
logger.setLevel(logging.INFO)

db = Database()

lambda_client = boto3.client("lambda", region_name=os.getenv("DEFAULT_AWS_REGION", "us-east-1"))

DISH_DISCOVERER_FUNCTION   = os.getenv("DISH_DISCOVERER_FUNCTION",   "localtaste-dish-discoverer")
RESTAURANT_RANKER_FUNCTION = os.getenv("RESTAURANT_RANKER_FUNCTION", "localtaste-restaurant-ranker")


def invoke_lambda(function_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    logger.info(f"Invoking {function_name} with payload: {json.dumps(payload)[:300]}")
    response = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload),
    )
    result = json.loads(response["Payload"].read())
    logger.info(f"{function_name} returned: {json.dumps(result)[:300]}")
    return result


def lambda_handler(event, context):
    try:
        logger.info(f"Planner invoked: {json.dumps(event)[:500]}")

        # Unpack SQS record or direct invocation
        if "Records" in event and event["Records"]:
            body = event["Records"][0]["body"]
            body = json.loads(body) if isinstance(body, str) else body
        else:
            body = event

        job_id   = body.get("job_id")
        job_type = body.get("job_type", "city_discovery")

        if not job_id:
            logger.error("No job_id in event")
            return {"statusCode": 400, "body": json.dumps({"error": "No job_id"})}

        logger.info(f"Planner: routing {job_type} for job {job_id}")
        db.jobs.update_status(job_id, "running")

        if job_type == "city_discovery":
            result = invoke_lambda(DISH_DISCOVERER_FUNCTION, {"job_id": job_id, **body})
        elif job_type == "restaurant_ranking":
            result = invoke_lambda(RESTAURANT_RANKER_FUNCTION, {"job_id": job_id, **body})
        else:
            logger.error(f"Unknown job_type: {job_type}")
            db.jobs.update_status(job_id, "failed", error_message=f"Unknown job_type: {job_type}")
            return {"statusCode": 400, "body": json.dumps({"error": f"Unknown job_type: {job_type}"})}

        # Check if the sub-agent reported an error
        status_code = result.get("statusCode", 200)
        if status_code != 200:
            body_out = result.get("body", "{}")
            err = json.loads(body_out) if isinstance(body_out, str) else body_out
            error_msg = err.get("error", f"Agent returned status {status_code}")
            logger.error(f"Sub-agent failed: {error_msg}")
            db.jobs.update_status(job_id, "failed", error_message=error_msg)
            return {"statusCode": 500, "body": json.dumps({"success": False, "error": error_msg})}

        logger.info(f"Planner: job {job_id} completed successfully")
        return {"statusCode": 200, "body": json.dumps({"success": True, "job_id": job_id})}

    except Exception as e:
        logger.error(f"Planner error: {e}", exc_info=True)
        if job_id:
            try:
                db.jobs.update_status(job_id, "failed", error_message=str(e))
            except Exception:
                pass
        return {"statusCode": 500, "body": json.dumps({"success": False, "error": str(e)})}
