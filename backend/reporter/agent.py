"""
Dish Discoverer Agent - researches and returns top-5 must-try dishes for a city.
Uses web search via Bedrock/Nova to find food specialities.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

from agents import function_tool, RunContextWrapper
from agents.extensions.models.litellm_model import LitellmModel

logger = logging.getLogger()


@dataclass
class DishDiscovererContext:
    job_id: str
    city: str
    country: str
    city_id: Optional[str] = None
    db: Optional[Any] = None


@function_tool
async def search_web(wrapper: RunContextWrapper[DishDiscovererContext], query: str) -> str:
    """
    Search the web for information about a city's food scene.

    Args:
        query: The search query, e.g. "must try food Tokyo Japan"
    Returns:
        Summarised search results as text
    """
    import boto3

    try:
        bedrock_region = os.getenv("BEDROCK_REGION", "us-east-1")
        bedrock = boto3.client("bedrock-agent-runtime", region_name=bedrock_region)

        # Use Bedrock Knowledge Base or fall back to a direct model call
        # For now we use a simple Bedrock Converse call to get web-grounded info
        model_id = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
        client = boto3.client("bedrock-runtime", region_name=bedrock_region)

        response = client.converse(
            modelId=model_id,
            messages=[{
                "role": "user",
                "content": [{"text": f"Search the web and tell me: {query}\n\nProvide factual, specific information based on real knowledge about this topic. Be concise."}],
            }],
        )
        text = response["output"]["message"]["content"][0]["text"]
        logger.info(f"Web search for '{query}' returned {len(text)} chars")
        return text

    except Exception as e:
        logger.warning(f"Web search failed: {e}")
        return f"Search unavailable. Please use your training knowledge to answer: {query}"


def create_agent(job_id: str, city: str, country: str, city_id: Optional[str], db):
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
    bedrock_region = os.getenv("BEDROCK_REGION", "us-east-1")
    os.environ["AWS_REGION_NAME"] = bedrock_region

    model = LitellmModel(model=f"bedrock/{model_id}")
    context = DishDiscovererContext(job_id=job_id, city=city, country=country, city_id=city_id, db=db)

    task = f"""Research the top 5 must-try food specialities of {city}, {country}.

Search for:
1. "must try food {city} {country}"
2. "{city} iconic dishes specialities"
3. "{city} street food local favourites"

Then compile your final JSON answer with exactly 5 dishes ranked 1-5."""

    return model, [search_web], task, context
