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
    category_type: Optional[str] = None  # 'world_cuisine' | 'occasion' | None
    dietary_preferences: Optional[List[str]] = None
    price_range: Optional[List[str]] = None  # e.g. ['$', '$$']
    latitude: Optional[float] = None   # user GPS (Near me)
    longitude: Optional[float] = None
    radius_km: int = 5                 # Near me radius
    city_lat: Optional[float] = None   # geocoded city centre
    city_lng: Optional[float] = None


def _resolve_photo_url(api_key: str, photo_reference: str, max_width: int = 600) -> Optional[str]:
    """Follow the Places photo redirect and return the final CDN URL (no API key exposed)."""
    import urllib.request
    url = (
        f"https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth={max_width}&photoreference={photo_reference}&key={api_key}"
    )
    try:
        req = urllib.request.Request(url, method="GET")
        # Don't follow redirects — we want the Location header
        import urllib.error
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                return e.headers.get("Location")
            return None
        # Some environments follow redirects automatically and land on the image
        return url  # fallback: return original (key still present but won't reach frontend)
    except Exception:
        return None


@function_tool
async def search_places(wrapper: RunContextWrapper[RestaurantRankerContext], query: str) -> str:
    """
    Search for restaurants using the Google Maps Places API, enriched with
    review snippets and a photo URL from Places Details.

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
        ctx = wrapper.context
        kwargs: dict = {"query": query, "type": "restaurant"}
        if ctx.latitude is not None and ctx.longitude is not None:
            # Near me — use GPS with user-chosen radius
            kwargs["location"] = (ctx.latitude, ctx.longitude)
            kwargs["radius"] = ctx.radius_km * 1000
        elif ctx.city_lat is not None and ctx.city_lng is not None:
            # Typed city — bias to city centre with 30 km metropolitan radius
            kwargs["location"] = (ctx.city_lat, ctx.city_lng)
            kwargs["radius"] = 30_000
        logger.info(f"Google Maps Places search: {query} (location={kwargs.get('location')}, radius={kwargs.get('radius')})")
        response = gmaps.places(**kwargs)
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

            # Fetch Places Details for reviews and photo
            photo_url = None
            review_lines = []
            if place_id:
                try:
                    details = gmaps.place(
                        place_id=place_id,
                        fields=["review", "photo"],
                        language="en",
                    ).get("result", {})

                    # Photo — resolve redirect to get key-free CDN URL
                    photos = details.get("photos", [])
                    if photos:
                        ref = photos[0].get("photo_reference", "")
                        if ref:
                            photo_url = _resolve_photo_url(api_key, ref)

                    # Reviews
                    for rev in details.get("reviews", [])[:5]:
                        author = rev.get("author_name", "")
                        rev_rating = rev.get("rating", "")
                        text = rev.get("text", "").replace("\n", " ").strip()
                        if text:
                            review_lines.append(f'  - {author} ({rev_rating}★): "{text[:300]}"')
                except Exception as e:
                    logger.warning(f"Places Details failed for {place_id}: {e}")

            block = (
                f"**{name}**\n"
                f"Address: {address}\n"
                f"Rating: {rating} ({review_count} reviews)\n"
                f"Price: {price_str}\n"
                f"Latitude: {lat}\n"
                f"Longitude: {lng}\n"
                f"Maps: {maps_url}\n"
                f"Photo: {photo_url or 'none'}"
            )
            if review_lines:
                block += "\nReviews:\n" + "\n".join(review_lines)

            lines.append(block)

        logger.info(f"Google Maps search for '{query}' returned {len(results)} results with details")
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

    # Geocode city to coordinates so Places searches are always location-biased
    city_lat: Optional[float] = None
    city_lng: Optional[float] = None
    if latitude is None and city:
        api_key = os.getenv("GOOGLE_MAPS_API_KEY")
        if api_key:
            try:
                import googlemaps as _gmaps
                _client = _gmaps.Client(key=api_key)
                geo = _client.find_place(
                    input=f"{city}, {country}",
                    input_type="textquery",
                    fields=["geometry"],
                )
                candidates = geo.get("candidates", [])
                if candidates:
                    loc = candidates[0].get("geometry", {}).get("location", {})
                    city_lat = loc.get("lat")
                    city_lng = loc.get("lng")
                    logger.info(f"Geocoded '{city}, {country}' → ({city_lat}, {city_lng})")
                else:
                    logger.warning(f"Geocoding found no candidates for '{city}, {country}'")
            except Exception as e:
                logger.warning(f"Geocoding failed for '{city}, {country}': {e}")

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
