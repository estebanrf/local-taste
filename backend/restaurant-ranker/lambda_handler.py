"""
Restaurant Ranker Lambda Handler
Finds and ranks the top-5 restaurants for a specific dish in a city.
"""

import os
import json
import asyncio
import logging

from agents import Agent, Runner, trace

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

from src import Database, RestaurantCreate
from templates import RESTAURANT_RANKER_INSTRUCTIONS
from agent import create_agent, RestaurantRankerContext

logger = logging.getLogger()
logger.setLevel(logging.INFO)

db = Database()


def _save_ranking_results(job_id: str, result_text: str, dish_id: str) -> None:
    try:
        raw = result_text.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON found in agent response")
        data = json.loads(raw[start:end])

        db.restaurants.delete_by_dish(dish_id)

        restaurants = data.get("restaurants", [])
        for r in restaurants[:5]:
            rest = RestaurantCreate(
                dish_id=dish_id,
                name=r["name"],
                address=r.get("address"),
                google_maps_url=r.get("google_maps_url"),
                google_rating=r.get("google_rating"),
                review_count=r.get("review_count"),
                price_level=r.get("price_level"),
                rank=r.get("rank", 1),
                rank_rationale=r.get("rank_rationale", ""),
                highlights=r.get("highlights", []),
            )
            db.restaurants.create_restaurant(rest)

        db.jobs.update_restaurants(job_id, {"dish_id": dish_id, "restaurants": restaurants})
        logger.info(f"RestaurantRanker: saved {len(restaurants)} restaurants for dish {dish_id}")

    except Exception as e:
        logger.error(f"RestaurantRanker: failed to save: {e}", exc_info=True)
        raise


async def run_restaurant_ranker(job_id: str) -> None:
    job = db.jobs.find_by_id(job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")

    payload   = job.get("request_payload", {})
    dish_id   = payload.get("dish_id", "")
    dish_name = payload.get("dish_name", "")
    city      = payload.get("city", "")
    country   = payload.get("country", "")

    model, tools, task, context = create_agent(job_id, dish_id, dish_name, city, country, db)

    with trace("Restaurant Ranker"):
        agent = Agent[RestaurantRankerContext](
            name="Restaurant Ranker",
            instructions=RESTAURANT_RANKER_INSTRUCTIONS,
            model=model,
            tools=tools,
        )
        result = await Runner.run(agent, input=task, context=context, max_turns=10)

    _save_ranking_results(job_id=job_id, result_text=result.final_output, dish_id=dish_id)


def lambda_handler(event, context):
    try:
        logger.info(f"RestaurantRanker invoked: {json.dumps(event)[:500]}")
        job_id = event.get("job_id")
        if not job_id:
            return {"statusCode": 400, "body": json.dumps({"error": "No job_id"})}

        asyncio.run(run_restaurant_ranker(job_id))
        return {"statusCode": 200, "body": json.dumps({"success": True, "job_id": job_id})}

    except Exception as e:
        logger.error(f"RestaurantRanker lambda error: {e}", exc_info=True)
        try:
            db.jobs.update_status(event.get("job_id", ""), "failed", error_message=str(e))
        except Exception:
            pass
        return {"statusCode": 500, "body": json.dumps({"success": False, "error": str(e)})}
