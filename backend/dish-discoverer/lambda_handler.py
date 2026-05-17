"""
Dish Discoverer Lambda Handler
Researches top-10 must-try dishes for a city and saves them to the database.
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

from src import Database, CityCreate, DishCreate
from templates import DISH_DISCOVERER_INSTRUCTIONS
from agent import create_agent, DishDiscovererContext

logger = logging.getLogger()
logger.setLevel(logging.INFO)

db = Database()


def _save_discovery_results(job_id: str, result_text: str, city: str, country: str, slug: str, city_id: str = None) -> None:
    try:
        raw = result_text.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON found in agent response")
        data = json.loads(raw[start:end])

        logger.info(f"DishDiscoverer: parsed JSON successfully, {len(data.get('dishes', []))} dishes found")

        if not city_id:
            city_obj = CityCreate(
                name=data.get("city", city),
                country=data.get("country", country),
                slug=slug,
                description=data.get("city_description", ""),
            )
            city_id = db.cities.upsert_city(city_obj)
            logger.info(f"DishDiscoverer: upserted city_id={city_id}")

        dishes = data.get("dishes", [])
        for dish_data in dishes[:10]:
            dish = DishCreate(
                city_id=city_id,
                name=dish_data["name"],
                description=dish_data.get("description", ""),
                rank=dish_data.get("rank", 1),
                cuisine_type=dish_data.get("cuisine_type"),
                tags=dish_data.get("tags", []),
                image_query=dish_data.get("image_query"),
            )
            db.dishes.upsert_dish(dish)
            logger.info(f"DishDiscoverer: upserted dish rank={dish_data.get('rank')} name={dish_data['name']}")

        db.jobs.update_dishes(job_id, {"city_id": city_id, "city": city, "country": country, "dishes": dishes})
        db.jobs.update_summary(job_id, {"city_id": city_id, "dishes_saved": len(dishes)})
        logger.info(f"DishDiscoverer: saved {len(dishes)} dishes for {city}")

    except Exception as e:
        logger.error(f"DishDiscoverer: failed to save results: {e}", exc_info=True)
        raise


async def run_dish_discoverer(job_id: str) -> None:
    job = db.jobs.find_by_id(job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")

    payload             = job.get("request_payload", {})
    city                = payload.get("city", "")
    country             = payload.get("country", "")
    slug                = payload.get("slug", f"{city.lower()}-{country.lower()}")
    city_id             = payload.get("city_id")
    dietary_preferences = payload.get("dietary_preferences", [])
    meal_time           = payload.get("meal_time")

    logger.info(f"DishDiscoverer: job_id={job_id} city={city} country={country} city_id={city_id} dietary={dietary_preferences} meal_time={meal_time}")

    model, tools, task, context = create_agent(job_id, city, country, city_id, db, dietary_preferences, meal_time)

    logger.info(f"DishDiscoverer: starting agent run")
    with trace("Dish Discoverer"):
        agent = Agent[DishDiscovererContext](
            name="Dish Discoverer",
            instructions=DISH_DISCOVERER_INSTRUCTIONS,
            model=model,
            tools=tools,
        )
        result = await Runner.run(agent, input=task, context=context, max_turns=10)

    logger.info(f"DishDiscoverer: agent output (first 500 chars): {result.final_output[:500]}")

    _save_discovery_results(
        job_id=job_id,
        result_text=result.final_output,
        city=city,
        country=country,
        slug=slug,
        city_id=city_id,
    )


def lambda_handler(event, context):
    try:
        logger.info(f"DishDiscoverer invoked: {json.dumps(event)[:500]}")
        job_id = event.get("job_id")
        if not job_id:
            return {"statusCode": 400, "body": json.dumps({"error": "No job_id"})}

        asyncio.run(run_dish_discoverer(job_id))
        db.jobs.update_status(job_id, "completed")
        return {"statusCode": 200, "body": json.dumps({"success": True, "job_id": job_id})}

    except Exception as e:
        logger.error(f"DishDiscoverer lambda error: {e}", exc_info=True)
        try:
            db.jobs.update_status(event.get("job_id", ""), "failed", error_message=str(e))
        except Exception:
            pass
        return {"statusCode": 500, "body": json.dumps({"success": False, "error": str(e)})}
