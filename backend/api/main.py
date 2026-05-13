"""
FastAPI backend for Local Taste - food passport platform
"""

import os
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError
import boto3
from mangum import Mangum
from dotenv import load_dotenv
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer, HTTPAuthorizationCredentials

from src import Database
from src.schemas import (
    UserUpdate,
    PassportEntryCreate,
    PassportEntryUpdate,
    ItineraryCreate,
    ItineraryItemCreate,
    JobType, JobStatus, CategoryType,
)

load_dotenv(override=True)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Local Taste API",
    description="Backend API for food discovery and passport tracking",
    version="1.0.0",
)

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    logger.warning(f"Validation error: {exc}")
    return JSONResponse(status_code=422, content={"detail": "Invalid input data."})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    friendly = {
        401: "Your session has expired. Please sign in again.",
        403: "You don't have permission to access this resource.",
        404: "The requested resource was not found.",
        429: "Too many requests. Please try again later.",
        500: "An internal error occurred. Please try again later.",
    }
    return JSONResponse(status_code=exc.status_code,
                        content={"detail": friendly.get(exc.status_code, exc.detail)})


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred."})


db = Database()
_aws_region = os.getenv('DEFAULT_AWS_REGION', 'eu-west-1')
lambda_client = boto3.client('lambda', region_name=_aws_region)
DISH_DISCOVERER_FUNCTION   = os.getenv('DISH_DISCOVERER_FUNCTION',   'lt-discoverer')
RESTAURANT_RANKER_FUNCTION = os.getenv('RESTAURANT_RANKER_FUNCTION', 'lt-ranker')

clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_guard = ClerkHTTPBearer(clerk_config)


async def get_current_user_id(creds: HTTPAuthorizationCredentials = Depends(clerk_guard)) -> str:
    user_id = creds.decoded["sub"]
    logger.info(f"Authenticated user: {user_id}")
    return user_id


# ── Request / response models ──────────────────────────────────────────────────

class UserResponse(BaseModel):
    user: Dict[str, Any]
    created: bool


class DiscoverRequest(BaseModel):
    city: str = Field(description="City name, e.g. 'Tokyo'")
    country: str = Field(description="Country name, e.g. 'Japan'")
    dietary_preferences: Optional[List[str]] = Field(default_factory=list)
    meal_time: Optional[str] = None


class DiscoverResponse(BaseModel):
    job_id: str
    message: str
    city_id: Optional[str] = None


class RankRestaurantsRequest(BaseModel):
    dish_id: str = Field(description="UUID of the dish to find restaurants for")
    dish_name: str = Field(description="Name of the dish")
    city: str = Field(description="City name for search context")
    country: str = Field(description="Country name for search context")
    dietary_preferences: Optional[List[str]] = Field(default_factory=list)
    price_range: Optional[List[str]] = Field(default_factory=list, description="Preferred price tiers e.g. ['$', '$$']")


class RankByCategoryRequest(BaseModel):
    category: str = Field(description="Food category, e.g. 'Japanese'")
    category_type: CategoryType = Field(description="'world_cuisine' or 'occasion'")
    city: str = Field(description="City name for search context (may be empty for near-me searches)")
    country: str = Field(description="Country name for search context (may be empty for near-me searches)")
    dietary_preferences: Optional[List[str]] = Field(default_factory=list)
    price_range: Optional[List[str]] = Field(default_factory=list, description="Preferred price tiers e.g. ['$', '$$']")
    latitude: Optional[float] = Field(default=None, description="User latitude for near-me search")
    longitude: Optional[float] = Field(default=None, description="User longitude for near-me search")


class RankRestaurantsResponse(BaseModel):
    job_id: str
    message: str


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# ── User ───────────────────────────────────────────────────────────────────────

@app.get("/api/user", response_model=UserResponse)
async def get_or_create_user(
    clerk_user_id: str = Depends(get_current_user_id),
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
    try:
        user = db.users.find_by_clerk_id(clerk_user_id)
        if user:
            return UserResponse(user=user, created=False)

        token_data = creds.decoded
        display_name = token_data.get('name') or token_data.get('email', '').split('@')[0] or "Foodie"

        db.users.db.insert('users', {
            'clerk_user_id': clerk_user_id,
            'display_name': display_name,
        }, returning='clerk_user_id')

        created_user = db.users.find_by_clerk_id(clerk_user_id)
        logger.info(f"Created new user: {clerk_user_id}")
        return UserResponse(user=created_user, created=True)
    except Exception as e:
        logger.error(f"Error in get_or_create_user: {e}")
        raise HTTPException(status_code=500, detail="Failed to load user profile")


@app.put("/api/user")
async def update_user(user_update: UserUpdate, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        user = db.users.find_by_clerk_id(clerk_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        data = user_update.model_dump(exclude_unset=True)
        db.users.db.update('users', data, "clerk_user_id = :clerk_user_id", {'clerk_user_id': clerk_user_id})
        return db.users.find_by_clerk_id(clerk_user_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── City discovery ─────────────────────────────────────────────────────────────

@app.post("/api/discover", response_model=DiscoverResponse)
async def discover_city(request: DiscoverRequest, clerk_user_id: str = Depends(get_current_user_id)):
    """
    Trigger a city food discovery job. Returns job_id immediately.
    Frontend polls /api/jobs/{job_id} for results.
    If the city is already cached (slug exists), returns cached data immediately.
    """
    try:
        logger.info(f"[discover] user={clerk_user_id} city={request.city} country={request.country}")

        user = db.users.find_by_clerk_id(clerk_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        logger.info(f"[discover] user found ok")

        slug = f"{request.city.lower().replace(' ', '-')}-{request.country.lower().replace(' ', '-')}"
        city = db.cities.find_by_slug(slug)
        logger.info(f"[discover] slug={slug} cached_city={'yes' if city else 'no'}")

        dietary = request.dietary_preferences or []
        job_id = db.jobs.create_job(
            clerk_user_id=clerk_user_id,
            job_type="city_discovery",
            request_payload={"city": request.city, "country": request.country, "slug": slug, "city_id": city['id'] if city else None, "dietary_preferences": dietary, "meal_time": request.meal_time},
        )
        logger.info(f"[discover] job created: {job_id} dietary={dietary}")

        lambda_client.invoke(
            FunctionName=DISH_DISCOVERER_FUNCTION,
            InvocationType="Event",
            Payload=json.dumps({
                "job_id": str(job_id),
                "city": request.city,
                "country": request.country,
                "slug": slug,
                "city_id": city['id'] if city else None,
                "dietary_preferences": dietary,
            }),
        )
        logger.info(f"[discover] invoked dish-discoverer async: {job_id}")

        return DiscoverResponse(
            job_id=str(job_id),
            message="City discovery started. Poll /api/jobs/{job_id} for results.",
            city_id=city['id'] if city else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[discover] FAILED at step above: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cities/{city_id}/dishes")
async def get_city_dishes(city_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    """Return top-5 dishes for a city with passport status for the current user"""
    try:
        city = db.cities.find_by_id(city_id)
        if not city:
            raise HTTPException(status_code=404, detail="City not found")

        dishes = db.dishes.find_by_city(city_id)

        # Annotate each dish with the user's passport entry if it exists
        passport_dish_ids = {
            e['dish_id'] for e in db.passport.find_by_user(clerk_user_id)
        }
        for dish in dishes:
            dish['in_passport'] = dish['id'] in passport_dish_ids

        return {"city": city, "dishes": dishes}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching dishes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Restaurant ranking ────────────────────────────────────────────────────────

@app.post("/api/rank-restaurants", response_model=RankRestaurantsResponse)
async def rank_restaurants(request: RankRestaurantsRequest, clerk_user_id: str = Depends(get_current_user_id)):
    """
    Trigger a restaurant ranking job for a specific dish in a city.
    """
    try:
        dish = db.dishes.find_by_id(request.dish_id)
        if not dish:
            raise HTTPException(status_code=404, detail="Dish not found")

        # If restaurants already cached, return instantly via completed job stub
        existing = db.restaurants.find_by_dish(request.dish_id)
        if existing:
            logger.info(f"rank_restaurants: cache hit for dish_id={request.dish_id} ({len(existing)} restaurants)")
            job_id = db.jobs.create_job(
                clerk_user_id=clerk_user_id,
                job_type="restaurant_ranking",
                request_payload=request.model_dump(),
            )
            db.jobs.update_status(str(job_id), "completed")
            db.jobs.update_restaurants(str(job_id), {"restaurants": existing, "cached": True})
            return RankRestaurantsResponse(job_id=str(job_id), message="Returning cached restaurants.")

        job_id = db.jobs.create_job(
            clerk_user_id=clerk_user_id,
            job_type="restaurant_ranking",
            request_payload=request.model_dump(),
        )

        lambda_client.invoke(
            FunctionName=RESTAURANT_RANKER_FUNCTION,
            InvocationType="Event",
            Payload=json.dumps({
                "job_id": str(job_id),
                **request.model_dump(),
            }),
        )
        logger.info(f"Invoked restaurant-ranker async: {job_id} price_range={request.price_range}")

        return RankRestaurantsResponse(job_id=str(job_id), message="Restaurant ranking started.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in rank_restaurants: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/rank-by-category", response_model=RankRestaurantsResponse)
async def rank_by_category(request: RankByCategoryRequest, clerk_user_id: str = Depends(get_current_user_id)):
    """
    Trigger a restaurant ranking job for a food category (e.g. Pizza) in a city,
    bypassing the dish discovery step.
    """
    try:
        logger.info(f"rank_by_category: category={request.category} category_type={request.category_type} city={request.city} country={request.country} dietary={request.dietary_preferences}")

        payload = {
            "dish_id": "",
            "dish_name": request.category,
            "city": request.city,
            "country": request.country,
            "category_mode": True,
            "category_type": request.category_type,
            "dietary_preferences": request.dietary_preferences or [],
            "price_range": request.price_range or [],
            "latitude": request.latitude,
            "longitude": request.longitude,
        }
        job_id = db.jobs.create_job(
            clerk_user_id=clerk_user_id,
            job_type="restaurant_ranking",
            request_payload=payload,
        )

        lambda_client.invoke(
            FunctionName=RESTAURANT_RANKER_FUNCTION,
            InvocationType="Event",
            Payload=json.dumps({"job_id": str(job_id), **payload}),
        )
        logger.info(f"Invoked restaurant-ranker (category mode) async: {job_id}")
        return RankRestaurantsResponse(job_id=str(job_id), message="Category restaurant ranking started.")
    except Exception as e:
        logger.error(f"Error in rank_by_category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dishes/{dish_id}/restaurants")
async def get_dish_restaurants(dish_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        dish = db.dishes.find_by_id(dish_id)
        if not dish:
            raise HTTPException(status_code=404, detail="Dish not found")

        restaurants = db.restaurants.find_by_dish(dish_id)
        return {"dish": dish, "restaurants": restaurants}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching restaurants: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/restaurants/by-ids")
async def get_restaurants_by_ids(body: dict, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        ids = body.get("ids") or []
        if not ids:
            return {"restaurants": []}
        restaurants = db.restaurants.find_by_ids(ids)
        return {"restaurants": restaurants}
    except Exception as e:
        logger.error(f"Error fetching restaurants by ids: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Food Passport ──────────────────────────────────────────────────────────────

@app.get("/api/passport")
async def get_passport(clerk_user_id: str = Depends(get_current_user_id)):
    try:
        entries = db.passport.find_by_user(clerk_user_id)
        stats = db.passport.stats_for_user(clerk_user_id)
        return {"entries": entries, "stats": stats}
    except Exception as e:
        logger.error(f"Error fetching passport: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/passport")
async def add_passport_entry(entry: PassportEntryCreate, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        if entry.dish_id:
            # Dish-based entry: verify dish exists
            dish = db.dishes.find_by_id(entry.dish_id)
            if not dish:
                raise HTTPException(status_code=404, detail="Dish not found")
            existing = db.passport.find_by_user_dish_and_restaurant(clerk_user_id, entry.dish_id, entry.restaurant_id)
        else:
            # Category-based entry: dish_name + city_name required
            if not entry.dish_name or not entry.city_name:
                raise HTTPException(status_code=400, detail="dish_name and city_name required for category entries")
            existing = db.passport.find_by_user_category_and_restaurant(clerk_user_id, entry.dish_name, entry.city_name, entry.restaurant_id)

        if existing:
            if entry.itinerary_ids:
                db.passport.append_itinerary_ids(existing['id'], entry.itinerary_ids)
            return {"id": existing['id'], "already_exists": True}

        entry_id = db.passport.create_entry(clerk_user_id, entry)
        return {"id": str(entry_id), "ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding passport entry: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/passport/{entry_id}")
async def update_passport_entry(
    entry_id: str,
    update: PassportEntryUpdate,
    clerk_user_id: str = Depends(get_current_user_id),
):
    try:
        entry = db.passport.find_by_id(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Passport entry not found")
        if entry.get('clerk_user_id') != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        db.passport.update_entry(entry_id, update)
        return db.passport.find_by_id(entry_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating passport entry: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/passport/{entry_id}")
async def delete_passport_entry(entry_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        entry = db.passport.find_by_id(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Passport entry not found")
        if entry.get('clerk_user_id') != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        db.passport.delete(entry_id)
        return {"message": "Passport entry removed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting passport entry: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Named itineraries ─────────────────────────────────────────────────────────

@app.get("/api/itineraries")
async def list_itineraries(clerk_user_id: str = Depends(get_current_user_id)):
    try:
        return {"itineraries": db.itineraries.find_by_user(clerk_user_id)}
    except Exception as e:
        logger.error(f"Error listing itineraries: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/itineraries")
async def create_itinerary(body: ItineraryCreate, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        itinerary_id = db.itineraries.create_itinerary(clerk_user_id, body.name.strip())
        logger.info(f"Created itinerary id={itinerary_id} user={clerk_user_id}")
        return {"id": str(itinerary_id), "name": body.name.strip()}
    except Exception as e:
        logger.error(f"Error creating itinerary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/itineraries/{itinerary_id}")
async def delete_itinerary(itinerary_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        row = db.itineraries.find_by_id(itinerary_id)
        if not row:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        if row.get("clerk_user_id") != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        db.itineraries.delete_itinerary(itinerary_id)
        return {"message": "Itinerary deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting itinerary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/itineraries/{itinerary_id}/items")
async def get_itinerary_items(itinerary_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        row = db.itineraries.find_by_id(itinerary_id)
        if not row:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        if row.get("clerk_user_id") != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        items = db.itinerary.find_by_itinerary(itinerary_id)
        return {"itinerary": row, "items": items}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching itinerary items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/itineraries/{itinerary_id}/items")
async def add_item_to_itinerary(
    itinerary_id: str,
    item: ItineraryItemCreate,
    clerk_user_id: str = Depends(get_current_user_id),
):
    try:
        row = db.itineraries.find_by_id(itinerary_id)
        if not row:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        if row.get("clerk_user_id") != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        if item.dish_id:
            dish = db.dishes.find_by_id(item.dish_id)
            if not dish:
                raise HTTPException(status_code=404, detail="Dish not found")
            city = db.cities.find_by_id(dish["city_id"])
            if not city:
                raise HTTPException(status_code=404, detail="City not found")
            dish_name = dish["name"]
            city_name = city["name"]
            country = city["country"]
            existing = db.itinerary.find_by_itinerary_and_dish(itinerary_id, item.dish_id)
            if existing:
                if item.restaurant_id:
                    db.itinerary.append_restaurant(existing["id"], item.restaurant_id)
                return {"id": existing["id"], "ok": True, "already_exists": True}
        else:
            if not item.dish_name or not item.city_name or not item.country:
                raise HTTPException(status_code=400, detail="dish_name, city_name, and country required")
            dish_name = item.dish_name
            city_name = item.city_name
            country = item.country
            existing = db.itinerary.find_by_itinerary_and_category(itinerary_id, dish_name, city_name)
            if existing:
                if item.restaurant_id:
                    db.itinerary.append_restaurant(existing["id"], item.restaurant_id)
                return {"id": existing["id"], "ok": True, "already_exists": True}
            # category_type is stored on create (world_cuisine or occasion)

        item.itinerary_id = itinerary_id
        item_id = db.itinerary.create_item(clerk_user_id=clerk_user_id, item=item, dish_name=dish_name, city_name=city_name, country=country)
        logger.info(f"Itinerary {itinerary_id}: added {dish_name} user={clerk_user_id}")
        return {"id": str(item_id), "ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding itinerary item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Itinerary items (legacy flat endpoint kept for backwards compat) ───────────

@app.get("/api/itinerary")
async def get_itinerary(clerk_user_id: str = Depends(get_current_user_id)):
    try:
        items = db.itinerary.find_by_user(clerk_user_id)
        return {"items": items}
    except Exception as e:
        logger.error(f"Error fetching itinerary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/itinerary/{item_id}")
async def delete_itinerary_item(item_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        item = db.itinerary.find_by_id(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Itinerary item not found")
        if item.get("clerk_user_id") != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        db.itinerary.delete_item(item_id)
        return {"message": "Removed from itinerary"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting itinerary item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/itinerary-items/{item_id}/restaurants/{restaurant_id}")
async def remove_itinerary_restaurant(item_id: str, restaurant_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        item = db.itinerary.find_by_id(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Itinerary item not found")
        if item.get("clerk_user_id") != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        db.itinerary.remove_restaurant(item_id, restaurant_id)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing restaurant from itinerary item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Jobs ───────────────────────────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        job = db.jobs.find_by_id(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.get('clerk_user_id') != clerk_user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        return job
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/jobs")
async def list_jobs(clerk_user_id: str = Depends(get_current_user_id)):
    try:
        jobs = db.jobs.find_by_user(clerk_user_id, limit=50)
        jobs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return {"jobs": jobs}
    except Exception as e:
        logger.error(f"Error listing jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Lambda handler ─────────────────────────────────────────────────────────────

handler = Mangum(app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
