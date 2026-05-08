"""
Restaurant Ranker Agent - finds and ranks top-5 restaurants for a dish in a city.
Uses Tavily to search for real restaurant data.
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
async def search_web(wrapper: RunContextWrapper[RestaurantRankerContext], query: str) -> str:
    """
    Search the web for restaurant information using Tavily.

    Args:
        query: The search query, e.g. "best ramen restaurants Tokyo Japan Google Maps rating"
    Returns:
        Search results as text
    """
    from tavily import TavilyClient

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        logger.warning("TAVILY_API_KEY not set")
        return "Search unavailable: TAVILY_API_KEY not configured."

    try:
        client = TavilyClient(api_key=api_key)
        response = client.search(query=query, max_results=5)
        results = response.get("results", [])
        text = "\n\n".join(
            f"**{r.get('title', '')}**\n{r.get('url', '')}\n{r.get('content', '')}"
            for r in results
        )
        logger.info(f"Tavily search for '{query}' returned {len(results)} results")
        return text or "No results found."
    except Exception as e:
        logger.warning(f"Tavily search failed: {e}")
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
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
    bedrock_region = os.getenv("BEDROCK_REGION", "us-east-1")
    os.environ["AWS_REGION_NAME"] = bedrock_region

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

    return model, [search_web], task, context
