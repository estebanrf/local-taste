"""
Dish Discoverer Agent - returns top-5 must-try dishes for a city from training knowledge.
"""

import os
import logging
from typing import Any, List, Optional
from dataclasses import dataclass, field

from agents.extensions.models.litellm_model import LitellmModel

logger = logging.getLogger()


@dataclass
class DishDiscovererContext:
    job_id: str
    city: str
    country: str
    city_id: Optional[str] = None
    db: Optional[Any] = None
    dietary_preferences: List[str] = field(default_factory=list)


def create_agent(job_id: str, city: str, country: str, city_id: Optional[str], db, dietary_preferences: Optional[List[str]] = None):
    model_id = os.getenv("BEDROCK_MODEL_ID", "eu.amazon.nova-pro-v1:0")
    bedrock_region = os.getenv("BEDROCK_REGION", "eu-west-1")
    os.environ["AWS_REGION_NAME"] = bedrock_region

    dietary_preferences = dietary_preferences or []
    logger.info(f"DishDiscoverer agent: model={model_id} region={bedrock_region} city={city} country={country} dietary={dietary_preferences} job_id={job_id}")

    model = LitellmModel(model=f"bedrock/{model_id}")
    context = DishDiscovererContext(job_id=job_id, city=city, country=country, city_id=city_id, db=db, dietary_preferences=dietary_preferences)

    task = f"""From your training knowledge, identify the top 5 most iconic must-try food specialities of {city}, {country}."""

    if dietary_preferences:
        prefs = ", ".join(dietary_preferences)
        task += f"""

The user has the following dietary requirements: {prefs}.
Prioritise dishes that are suitable for these requirements, or clearly note in the description if a dish can be adapted. Avoid recommending dishes that fundamentally conflict with these requirements."""

    task += """

Return your answer as JSON with exactly 5 dishes ranked 1-5, following the schema in your instructions (name, description, rank, cuisine_type, tags, image_query)."""

    logger.info(f"DishDiscoverer task: {task[:400]}")
    return model, [], task, context
