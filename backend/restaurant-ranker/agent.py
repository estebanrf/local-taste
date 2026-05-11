"""
Restaurant Ranker Agent - finds and ranks top-5 restaurants for a dish in a city.
Uses Google Maps Places API to search for real restaurant data.
"""

import os
import logging
from typing import Any, List, Optional
from dataclasses import dataclass

from agents import function_tool, RunContextWrapper
from agents.extensions.models.litellm_model import LitellmModel

logger = logging.getLogger()


@dataclass
class RestaurantRankerContext:
    job_id: str
    dish_id: str
    dish_name: str
    city: str
    country: str
    db: Optional[Any] = None
    category_mode: bool = False
    dietary_preferences: Optional[List[str]] = None


@function_tool
async def search_places(wrapper: RunContextWrapper[RestaurantRankerContext], query: str) -> str:
    """
    Search for restaurants using the Google Maps Places API.

    Args:
        query: The search query, e.g. "best ramen restaurants Tokyo Japan"
    Returns:
        Structured restaurant data as text
    """
    import googlemaps

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_MAPS_API_KEY not set")
        return "Search unavailable: GOOGLE_MAPS_API_KEY not configured."

    try:
        gmaps = googlemaps.Client(key=api_key)
        logger.info(f"Google Maps Places search: {query}")
        response = gmaps.places(query=query, type="restaurant")
        results = response.get("results", [])[:5]

        lines = []
        for r in results:
            name = r.get("name", "")
            address = r.get("formatted_address", "")
            rating = r.get("rating", "")
            review_count = r.get("user_ratings_total", "")
            price_level = r.get("price_level")
            place_id = r.get("place_id", "")
            location = r.get("geometry", {}).get("location", {})
            lat = location.get("lat")
            lng = location.get("lng")
            if place_id:
                maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            else:
                import urllib.parse
                query_str = urllib.parse.quote_plus(f"{name} {address}".strip())
                maps_url = f"https://www.google.com/maps/search/?q={query_str}"
            price_str = "$" * price_level if isinstance(price_level, int) and price_level > 0 else "unknown"
            lines.append(
                f"**{name}**\n"
                f"Address: {address}\n"
                f"Rating: {rating} ({review_count} reviews)\n"
                f"Price: {price_str}\n"
                f"Latitude: {lat}\n"
                f"Longitude: {lng}\n"
                f"Maps: {maps_url}"
            )

        logger.info(f"Google Maps search for '{query}' returned {len(results)} results")
        return "\n\n".join(lines) or "No results found."
    except Exception as e:
        logger.warning(f"Google Maps search failed: {e}")
        return f"Search failed: {e}"


def create_agent(
    job_id: str,
    dish_id: str,
    dish_name: str,
    city: str,
    country: str,
    db,
    category_mode: bool = False,
    dietary_preferences: Optional[List[str]] = None,
):
    model_id = os.getenv("BEDROCK_MODEL_ID", "eu.amazon.nova-pro-v1:0")
    bedrock_region = os.getenv("BEDROCK_REGION", "eu-west-1")
    os.environ["AWS_REGION_NAME"] = bedrock_region

    logger.info(f"RestaurantRanker agent: model={model_id} region={bedrock_region} category_mode={category_mode} dietary={dietary_preferences} job_id={job_id}")

    model = LitellmModel(model=f"bedrock/{model_id}")
    context = RestaurantRankerContext(
        job_id=job_id, dish_id=dish_id, dish_name=dish_name,
        city=city, country=country, db=db,
        category_mode=category_mode,
        dietary_preferences=dietary_preferences or [],
    )

    if category_mode:
        search_hint = f'"{dish_name} restaurants {city} {country} best rated"'
        task = f'Find and rank the top 5 {dish_name} restaurants in {city}, {country}.\n\nSearch: {search_hint}\n'
    else:
        search_hint = f'"{dish_name} {city} {country} Google Maps rating reviews"'
        task = f'Find and rank the top 5 restaurants for {dish_name} in {city}, {country}.\n\nSearch: {search_hint}\n'

    if dietary_preferences:
        prefs = ", ".join(dietary_preferences)
        task += f'\nUser dietary requirements: {prefs}. Prioritise restaurants that clearly accommodate these and note it in highlights[].'

    task += '\n\nCompile your final JSON with exactly 5 restaurants. Use real data from search results.'

    logger.info(f"RestaurantRanker task: {task[:400]}")
    return model, [search_places], task, context
