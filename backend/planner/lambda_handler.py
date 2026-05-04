"""
Local Taste Planner - Lambda handler for SQS-triggered orchestration.
Dispatches to DishDiscoverer or RestaurantRanker depending on job_type.
"""

import os
import json
import asyncio
import logging
from typing import Dict, Any

from agents import Agent, Runner, trace

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

from src import Database
from templates import CITY_DISCOVERY_INSTRUCTIONS, RESTAURANT_RANKING_INSTRUCTIONS
from agent import create_agent, PlannerContext

logger = logging.getLogger()
logger.setLevel(logging.INFO)

db = Database()


async def run_orchestrator(job_id: str, job_type: str) -> None:
    db.jobs.update_status(job_id, "running")
    try:
        model, tools, task, context = create_agent(job_id, job_type, db)

        instructions = (
            CITY_DISCOVERY_INSTRUCTIONS
            if job_type == "city_discovery"
            else RESTAURANT_RANKING_INSTRUCTIONS
        )

        with trace("Local Taste Planner"):
            agent = Agent[PlannerContext](
                name="Local Taste Planner",
                instructions=instructions,
                model=model,
                tools=tools,
            )
            await Runner.run(agent, input=task, context=context, max_turns=10)

        db.jobs.update_status(job_id, "completed")
        logger.info(f"Planner: job {job_id} completed")

    except Exception as e:
        logger.error(f"Planner: error in orchestration: {e}", exc_info=True)
        db.jobs.update_status(job_id, "failed", error_message=str(e))
        raise


def lambda_handler(event, context):
    try:
        logger.info(f"Planner invoked: {json.dumps(event)[:500]}")

        # Unpack SQS record or direct invocation
        if "Records" in event and event["Records"]:
            body = event["Records"][0]["body"]
            if isinstance(body, str) and body.startswith("{"):
                body = json.loads(body)
            elif isinstance(body, str):
                body = {"job_id": body}
        else:
            body = event

        job_id  = body.get("job_id")
        job_type = body.get("job_type", "city_discovery")

        if not job_id:
            return {"statusCode": 400, "body": json.dumps({"error": "No job_id"})}

        logger.info(f"Planner: starting {job_type} for job {job_id}")
        asyncio.run(run_orchestrator(job_id, job_type))

        return {"statusCode": 200, "body": json.dumps({"success": True, "job_id": job_id})}

    except Exception as e:
        logger.error(f"Planner lambda error: {e}", exc_info=True)
        return {"statusCode": 500, "body": json.dumps({"success": False, "error": str(e)})}
