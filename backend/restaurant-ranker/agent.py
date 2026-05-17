"""
Restaurant Ranker Agent - finds and ranks top-5 restaurants for a dish in a city.
Uses Google Maps Places API (New) for all location queries.
"""

import os
import math
import logging
from typing import Any, List, Optional
from dataclasses import dataclass

import httpx

from agents import function_tool, RunContextWrapper
from agents.extensions.models.litellm_model import LitellmModel

logger = logging.getLogger()

PLACES_BASE = "https://places.googleapis.com/v1"


@dataclass
class RestaurantRankerContext:
    job_id: str
    dish_id: str
    dish_name: str
    city: str
    country: str
    db: Optional[Any] = None
    category_mode: bool = False
    category_type: Optional[str] = None  # 'world_cuisine' | 'occasion' | None
    dietary_preferences: Optional[List[str]] = None
    price_range: Optional[List[str]] = None  # e.g. ['$', '$$']
    latitude: Optional[float] = None   # user GPS (Near me)
    longitude: Optional[float] = None
    radius_km: int = 5                 # Near me radius
    city_lat: Optional[float] = None   # geocoded city centre
    city_lng: Optional[float] = None


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _places_headers(api_key: str, field_mask: str) -> dict:
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": field_mask,
    }


def _resolve_photo_url(api_key: str, photo_name: str, max_width: int = 600) -> Optional[str]:
    """Resolve a Places API (New) photo name to a redirected CDN URL (no key exposed)."""
    url = f"{PLACES_BASE}/{photo_name}/media?maxWidthPx={max_width}&key={api_key}&skipHttpRedirect=false"
    try:
        r = httpx.get(url, follow_redirects=False, timeout=5)
        if r.status_code in (301, 302, 303, 307, 308):
            return r.headers.get("location")
        # Some CDNs serve the image directly
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
            return url
        return None
    except Exception:
        return None


def _geocode_city(api_key: str, city: str, country: str) -> Optional[tuple[float, float]]:
    """Geocode a city name using Places API (New) Autocomplete → first city result."""
    try:
        payload = {
            "input": f"{city}, {country}",
            "includedPrimaryTypes": ["locality"],
            "includeQueryPredictions": False,
        }
        r = httpx.post(
            f"{PLACES_BASE}/places:autocomplete",
            json=payload,
            headers=_places_headers(api_key, "suggestions.placePrediction.placeId"),
            timeout=5,
        )
        r.raise_for_status()
        suggestions = r.json().get("suggestions", [])
        if not suggestions:
            logger.warning(f"Geocode: no suggestions for '{city}, {country}'")
            return None

        place_id = suggestions[0]["placePrediction"]["placeId"]

        # Fetch coordinates via Place Details
        r2 = httpx.get(
            f"{PLACES_BASE}/places/{place_id}",
            headers=_places_headers(api_key, "location"),
            timeout=5,
        )
        r2.raise_for_status()
        loc = r2.json().get("location", {})
        lat, lng = loc.get("latitude"), loc.get("longitude")
        if lat is None or lng is None:
            return None
        logger.info(f"Geocoded '{city}, {country}' → ({lat}, {lng})")
        return float(lat), float(lng)
    except Exception as e:
        logger.warning(f"Geocoding failed for '{city}, {country}': {e}")
        return None


@function_tool
async def search_places(wrapper: RunContextWrapper[RestaurantRankerContext], query: str) -> str:
    """
    Search for restaurants using the Google Maps Places API (New), enriched with
    review snippets and a photo URL from Place Details.

    Args:
        query: The search query, e.g. "best ramen restaurants Tokyo Japan"
    Returns:
        Structured restaurant data as text
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_MAPS_API_KEY not set")
        return "Search unavailable: GOOGLE_MAPS_API_KEY not configured."

    ctx = wrapper.context

    try:
        # ── Text Search ────────────────────────────────────────────────────────
        payload: dict = {
            "textQuery": query,
            "includedType": "restaurant",
            "languageCode": "en",
        }

        if ctx.latitude is not None and ctx.longitude is not None:
            # Near me — strict circle
            payload["locationBias"] = {
                "circle": {
                    "center": {"latitude": ctx.latitude, "longitude": ctx.longitude},
                    "radius": float(ctx.radius_km * 1000),
                }
            }
        elif ctx.city_lat is not None and ctx.city_lng is not None:
            # Typed city — 30 km metropolitan bias
            payload["locationBias"] = {
                "circle": {
                    "center": {"latitude": ctx.city_lat, "longitude": ctx.city_lng},
                    "radius": 30_000.0,
                }
            }

        field_mask = (
            "places.id,places.displayName,places.formattedAddress,"
            "places.rating,places.userRatingCount,places.priceLevel,"
            "places.location,places.googleMapsUri,places.photos,"
            "places.currentOpeningHours.openNow,"
            "places.currentOpeningHours.weekdayDescriptions"
        )

        r = httpx.post(
            f"{PLACES_BASE}/places:searchText",
            json=payload,
            headers=_places_headers(api_key, field_mask),
            timeout=15,
        )
        r.raise_for_status()
        all_results = r.json().get("places", [])

        logger.info(
            f"Places Text Search: '{query}' → {len(all_results)} results "
            f"(bias={'nearme' if ctx.latitude else 'city' if ctx.city_lat else 'none'})"
        )

        # Hard-filter by actual distance when Near me is active
        if ctx.latitude is not None and ctx.longitude is not None:
            before = len(all_results)
            all_results = [
                p for p in all_results
                if (loc := p.get("location", {}))
                and _haversine_km(ctx.latitude, ctx.longitude, loc["latitude"], loc["longitude"]) <= ctx.radius_km
            ]
            logger.info(f"Radius hard-filter {ctx.radius_km}km: {before} → {len(all_results)} results")
            if not all_results:
                return f"NO_RESULTS_IN_RADIUS:{ctx.radius_km}"

        results = all_results[:10]

        # ── Enrich each result with Details (reviews + resolved photo) ─────────
        lines = []
        for p in results:
            place_id  = p.get("id", "")
            name      = p.get("displayName", {}).get("text", "")
            address   = p.get("formattedAddress", "")
            rating    = p.get("rating", "")
            rev_count = p.get("userRatingCount", "")
            price_raw = p.get("priceLevel", "")
            loc       = p.get("location", {})
            lat       = loc.get("latitude")
            lng       = loc.get("longitude")
            maps_url  = p.get("googleMapsUri", "")
            hours_obj   = p.get("currentOpeningHours", {})
            open_now_raw = hours_obj.get("openNow")
            open_now  = "yes" if open_now_raw is True else ("no" if open_now_raw is False else "unknown")
            weekday_descriptions = hours_obj.get("weekdayDescriptions", [])

            # price_level mapping: PRICE_LEVEL_FREE/INEXPENSIVE/MODERATE/EXPENSIVE/VERY_EXPENSIVE
            price_map = {
                "PRICE_LEVEL_FREE": "$",
                "PRICE_LEVEL_INEXPENSIVE": "$",
                "PRICE_LEVEL_MODERATE": "$$",
                "PRICE_LEVEL_EXPENSIVE": "$$$",
                "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
            }
            price_str = price_map.get(str(price_raw), "unknown")

            # Photo
            photo_url = None
            photos = p.get("photos", [])
            if photos and place_id:
                photo_name = photos[0].get("name", "")
                if photo_name:
                    photo_url = _resolve_photo_url(api_key, photo_name)

            # Reviews via Place Details
            review_lines: list[str] = []
            if place_id:
                try:
                    r2 = httpx.get(
                        f"{PLACES_BASE}/places/{place_id}",
                        headers=_places_headers(api_key, "reviews"),
                        timeout=10,
                    )
                    r2.raise_for_status()
                    for rev in r2.json().get("reviews", [])[:5]:
                        author = rev.get("authorAttribution", {}).get("displayName", "")
                        rev_rating = rev.get("rating", "")
                        text = rev.get("text", {}).get("text", "").replace("\n", " ").strip()
                        if text:
                            review_lines.append(f'  - {author} ({rev_rating}★): "{text[:300]}"')
                except Exception as e:
                    logger.warning(f"Place Details failed for {place_id}: {e}")

            hours_lines = "\n".join(f"  {h}" for h in weekday_descriptions) if weekday_descriptions else "  Not available"
            block = (
                f"**{name}**\n"
                f"Address: {address}\n"
                f"Rating: {rating} ({rev_count} reviews)\n"
                f"Price: {price_str}\n"
                f"Open now: {open_now}\n"
                f"Opening hours:\n{hours_lines}\n"
                f"Latitude: {lat}\n"
                f"Longitude: {lng}\n"
                f"Maps: {maps_url}\n"
                f"Photo: {photo_url or 'none'}"
            )
            if review_lines:
                block += "\nReviews:\n" + "\n".join(review_lines)
            lines.append(block)

        open_count = sum(1 for p in results if p.get("currentOpeningHours", {}).get("openNow") is True)
        logger.info(f"search_places: returning {len(lines)} enriched results ({open_count} open now)")
        return "\n\n".join(lines) or "No results found."

    except httpx.HTTPStatusError as e:
        logger.warning(f"Places API HTTP error: {e.response.status_code} {e.response.text[:300]}")
        return f"Search failed: HTTP {e.response.status_code}"
    except Exception as e:
        logger.warning(f"Places search failed: {e}")
        return f"Search failed: {e}"


def create_agent(
    job_id: str,
    dish_id: str,
    dish_name: str,
    city: str,
    country: str,
    db,
    category_mode: bool = False,
    category_type: Optional[str] = None,
    dietary_preferences: Optional[List[str]] = None,
    price_range: Optional[List[str]] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: int = 5,
):
    model_id = os.getenv("BEDROCK_MODEL_ID", "eu.amazon.nova-pro-v1:0")
    bedrock_region = os.getenv("BEDROCK_REGION", "eu-west-1")
    os.environ["AWS_REGION_NAME"] = bedrock_region

    logger.info(f"RestaurantRanker agent: model={model_id} region={bedrock_region} category_mode={category_mode} dietary={dietary_preferences} job_id={job_id}")

    # Geocode city centre for location bias when no GPS coords provided
    city_lat: Optional[float] = None
    city_lng: Optional[float] = None
    if latitude is None and city:
        api_key = os.getenv("GOOGLE_MAPS_API_KEY")
        if api_key:
            result = _geocode_city(api_key, city, country)
            if result:
                city_lat, city_lng = result

    model = LitellmModel(model=f"bedrock/{model_id}")
    context = RestaurantRankerContext(
        job_id=job_id, dish_id=dish_id, dish_name=dish_name,
        city=city, country=country, db=db,
        category_mode=category_mode,
        category_type=category_type,
        dietary_preferences=dietary_preferences or [],
        price_range=price_range or [],
        latitude=latitude,
        longitude=longitude,
        radius_km=radius_km,
        city_lat=city_lat,
        city_lng=city_lng,
    )

    near_me = latitude is not None and longitude is not None
    location_str = "near the user's current location" if near_me else f"in {city}, {country}"
    search_suffix = "" if near_me else f" {city}"

    if category_mode and category_type == "world_cuisine":
        task = (
            f'Find and rank the top 5 {dish_name} restaurants {location_str}.\n\n'
            f'Search: "best {dish_name} restaurants{search_suffix}"'
        )
    elif category_mode and category_type == "occasion":
        task = (
            f'Find and rank the top 5 venues for "{dish_name}" {location_str}.\n\n'
            f'Search: "{dish_name}{search_suffix}"'
        )
    else:
        task = (
            f'Find and rank the top 5 restaurants for {dish_name} {location_str}.\n\n'
            f'Search: "{dish_name} best restaurants{search_suffix}"'
        )

    if dietary_preferences:
        prefs = ", ".join(dietary_preferences)
        task += f'\nUser dietary requirements: {prefs}. Prioritise restaurants that clearly accommodate these and note it in highlights[].'

    if price_range:
        tiers = ", ".join(price_range)
        task += f'\nUser price preference: {tiers}. Strongly prefer restaurants whose price level matches. If none match exactly, include the closest alternatives but note the price in rank_rationale.'

    task += '\n\nCompile your final JSON with exactly 5 restaurants. Use real data from search results.'

    logger.info(f"RestaurantRanker task: {task[:400]}")
    return model, [search_places], task, context
