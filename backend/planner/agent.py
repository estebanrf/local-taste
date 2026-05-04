"""
Local Taste Planner - orchestrates food discovery agents.
"""

import os
import json
import boto3
import logging
from typing import Dict, Any
from dataclasses import dataclass

from agents import function_tool, RunContextWrapper
from agents.extensions.models.litellm_model import LitellmModel

logger = logging.getLogger()

lambda_client = boto3.client("lambda")

DISH_DISCOVERER_FUNCTION  = os.getenv("DISH_DISCOVERER_FUNCTION",  "localtaste-dish-discoverer")
RESTAURANT_RANKER_FUNCTION = os.getenv("RESTAURANT_RANKER_FUNCTION", "localtaste-restaurant-ranker")
MOCK_LAMBDAS = os.getenv("MOCK_LAMBDAS", "false").lower() == "true"


@dataclass
class PlannerContext:
    job_id: str


async def _invoke(name: str, function_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if MOCK_LAMBDAS:
        logger.info(f"[MOCK] Would invoke {name}: {json.dumps(payload)[:200]}")
        return {"success": True, "mock": True}
    try:
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload),
        )
        result = json.loads(response["Payload"].read())
        if isinstance(result, dict) and "statusCode" in result and "body" in result:
            body = result["body"]
            result = json.loads(body) if isinstance(body, str) else body
        return result
    except Exception as e:
        logger.error(f"Error invoking {name}: {e}")
        return {"error": str(e)}


@function_tool
async def invoke_dish_discoverer(wrapper: RunContextWrapper[PlannerContext]) -> str:
    """Invoke the Dish Discoverer agent to find top-5 must-try dishes for the city."""
    result = await _invoke("DishDiscoverer", DISH_DISCOVERER_FUNCTION, {"job_id": wrapper.context.job_id})
    if "error" in result:
        return f"Dish discoverer failed: {result['error']}"
    return "Dish discoverer completed — top 5 dishes saved."


@function_tool
async def invoke_restaurant_ranker(wrapper: RunContextWrapper[PlannerContext]) -> str:
    """Invoke the Restaurant Ranker agent to find and rank the best restaurants for the dish."""
    result = await _invoke("RestaurantRanker", RESTAURANT_RANKER_FUNCTION, {"job_id": wrapper.context.job_id})
    if "error" in result:
        return f"Restaurant ranker failed: {result['error']}"
    return "Restaurant ranker completed — top 5 restaurants saved."


def create_agent(job_id: str, job_type: str, db):
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
    bedrock_region = os.getenv("BEDROCK_REGION", "us-east-1")
    os.environ["AWS_REGION_NAME"] = bedrock_region

    model = LitellmModel(model=f"bedrock/{model_id}")
    context = PlannerContext(job_id=job_id)

    if job_type == "city_discovery":
        tools = [invoke_dish_discoverer]
        task = f"Job {job_id}: city_discovery. Call invoke_dish_discoverer."
    else:
        tools = [invoke_restaurant_ranker]
        task = f"Job {job_id}: restaurant_ranking. Call invoke_restaurant_ranker."

    return model, tools, task, context
