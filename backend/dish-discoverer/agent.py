"""
Dish Discoverer Agent - returns top-5 must-try dishes for a city from training knowledge.
"""

import os
import logging
from typing import Any, Optional
from dataclasses import dataclass

from agents.extensions.models.litellm_model import LitellmModel

logger = logging.getLogger()


@dataclass
class DishDiscovererContext:
    job_id: str
    city: str
    country: str
    city_id: Optional[str] = None
    db: Optional[Any] = None


def create_agent(job_id: str, city: str, country: str, city_id: Optional[str], db):
    model_id = os.getenv("BEDROCK_MODEL_ID", "eu.amazon.nova-pro-v1:0")
    bedrock_region = os.getenv("BEDROCK_REGION", "eu-west-1")
    os.environ["AWS_REGION_NAME"] = bedrock_region

    logger.info(f"DishDiscoverer agent: model={model_id} region={bedrock_region} city={city} country={country} job_id={job_id}")

    model = LitellmModel(model=f"bedrock/{model_id}")
    context = DishDiscovererContext(job_id=job_id, city=city, country=country, city_id=city_id, db=db)

    task = f"""From your training knowledge, identify the top 5 most iconic must-try food specialities of {city}, {country}.

Return your answer as JSON with exactly 5 dishes ranked 1-5. No descriptions, just 5 dishes names of 3 words each at most."""

    logger.info(f"DishDiscoverer task: {task[:300]}")
    return model, [], task, context
