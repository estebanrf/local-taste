"""
Restaurant Ranker Lambda Handler
Finds and ranks the top-5 restaurants for a specific dish in a city.
"""

import os
import re
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
from templates import RESTAURANT_RANKER_INSTRUCTIONS, WORLD_CUISINE_RANKER_INSTRUCTIONS, OCCASION_RANKER_INSTRUCTIONS
from agent import create_agent, RestaurantRankerContext

logger = logging.getLogger()
logger.setLevel(logging.INFO)

db = Database()

_COORDS_RE = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")

def _extract_coords(maps_url: str):
    """Extract lat/lng from a Google Maps URL like .../@48.8566,2.3522,17z"""
    if not maps_url:
        return None, None
    m = _COORDS_RE.search(maps_url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def _save_ranking_results(job_id: str, result_text: str, dish_id: str, category_mode: bool = False) -> None:
    try:
        raw = result_text.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON found in agent response")
        data = json.loads(raw[start:end])

        restaurants = data.get("restaurants", [])
        logger.info(f"RestaurantRanker: parsed JSON, {len(restaurants)} restaurants found")

        valid_prices = {"$", "$$", "$$$", "$$$$"}

        def _build_and_save(r: dict, dish_id_val) -> str:
            lat, lng = _extract_coords(r.get("google_maps_url"))
            lat = r.get("latitude") or lat
            lng = r.get("longitude") or lng
            raw_price = r.get("price_level") or None
            raw_reviews = r.get("reviews") or []
            # Normalise reviews to dicts with author/rating/text keys
            clean_reviews = []
            for rev in raw_reviews[:5]:
                if isinstance(rev, dict) and rev.get("text"):
                    clean_reviews.append({
                        "author": rev.get("author", ""),
                        "rating": rev.get("rating"),
                        "text": str(rev.get("text", ""))[:300],
                    })
            rest = RestaurantCreate(
                dish_id=dish_id_val or None,
                name=r["name"],
                address=r.get("address"),
                google_maps_url=r.get("google_maps_url") or None,
                google_rating=r.get("google_rating"),
                review_count=r.get("review_count"),
                price_level=raw_price if raw_price in valid_prices else None,
                rank=r.get("rank", 1),
                rank_rationale=r.get("rank_rationale", ""),
                highlights=r.get("highlights", []),
                latitude=lat,
                longitude=lng,
                photo_url=r.get("photo_url") or None,
                reviews=clean_reviews,
            )
            saved_id = db.restaurants.create_restaurant(rest)
            logger.info(f"RestaurantRanker: saved restaurant rank={r.get('rank')} name={r['name']} photo={'yes' if rest.photo_url else 'no'} reviews={len(clean_reviews)}")
            return saved_id

        if dish_id and not category_mode:
            db.restaurants.delete_by_dish(dish_id)
            for r in restaurants[:5]:
                _build_and_save(r, dish_id)
            restaurants = db.restaurants.find_by_dish(dish_id)
        else:
            # Category mode — persist to DB so restaurant_ids remain valid across sessions
            saved_ids = [_build_and_save(r, None) for r in restaurants[:5]]
            restaurants = db.restaurants.find_by_ids(saved_ids)

        db.jobs.update_restaurants(job_id, {"dish_id": dish_id, "restaurants": restaurants})
        logger.info(f"RestaurantRanker: done, {len(restaurants)} restaurants (category_mode={category_mode})")

    except Exception as e:
        logger.error(f"RestaurantRanker: failed to save: {e}", exc_info=True)
        raise


async def run_restaurant_ranker(job_id: str) -> None:
    job = db.jobs.find_by_id(job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")

    payload              = job.get("request_payload", {})
    dish_id              = payload.get("dish_id", "")
    dish_name            = payload.get("dish_name", "")
    city                 = payload.get("city", "")
    country              = payload.get("country", "")
    category_mode        = payload.get("category_mode", False)
    category_type        = payload.get("category_type")  # 'world_cuisine' | 'occasion' | None
    dietary_preferences  = payload.get("dietary_preferences") or []
    price_range          = payload.get("price_range") or []
    latitude             = payload.get("latitude")
    longitude            = payload.get("longitude")

    logger.info(f"RestaurantRanker: job_id={job_id} dish_name={dish_name} city={city} country={country} category_mode={category_mode} category_type={category_type} dietary={dietary_preferences} price_range={price_range} coords={latitude},{longitude}")

    model, tools, task, context = create_agent(
        job_id, dish_id, dish_name, city, country, db,
        category_mode=category_mode,
        category_type=category_type,
        dietary_preferences=dietary_preferences,
        price_range=price_range,
        latitude=latitude,
        longitude=longitude,
    )

    if category_type == "world_cuisine":
        instructions = WORLD_CUISINE_RANKER_INSTRUCTIONS
    elif category_type == "occasion":
        instructions = OCCASION_RANKER_INSTRUCTIONS
    else:
        instructions = RESTAURANT_RANKER_INSTRUCTIONS
    max_turns = 5

    with trace("Restaurant Ranker"):
        agent = Agent[RestaurantRankerContext](
            name="Restaurant Ranker",
            instructions=instructions,
            model=model,
            tools=tools,
        )
        result = await Runner.run(agent, input=task, context=context, max_turns=max_turns)

    logger.info(f"RestaurantRanker: agent output (first 500 chars): {result.final_output[:500]}")

    _save_ranking_results(
        job_id=job_id,
        result_text=result.final_output,
        dish_id=dish_id,
        category_mode=category_mode,
    )


def lambda_handler(event, context):
    try:
        logger.info(f"RestaurantRanker invoked: {json.dumps(event)[:500]}")
        job_id = event.get("job_id")
        if not job_id:
            return {"statusCode": 400, "body": json.dumps({"error": "No job_id"})}

        asyncio.run(run_restaurant_ranker(job_id))
        db.jobs.update_status(job_id, "completed")
        return {"statusCode": 200, "body": json.dumps({"success": True, "job_id": job_id})}

    except Exception as e:
        logger.error(f"RestaurantRanker lambda error: {e}", exc_info=True)
        try:
            db.jobs.update_status(event.get("job_id", ""), "failed", error_message=str(e))
        except Exception:
            pass
        return {"statusCode": 500, "body": json.dumps({"success": False, "error": str(e)})}
