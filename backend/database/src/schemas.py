"""
Pydantic schemas for Local Taste - food passport platform
Serve as both database validation and LLM structured output schemas
"""

from typing import List, Literal, Optional, Dict, Union
from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import date, datetime


JobType = Literal["city_discovery", "restaurant_ranking"]
JobStatus = Literal["pending", "running", "completed", "failed"]
PriceLevel = Literal["$", "$$", "$$$", "$$$$"]
CategoryType = Literal["world_cuisine", "occasion"]


# ── City ──────────────────────────────────────────────────────────────────────

class CityCreate(BaseModel):
    name: str = Field(description="City name, e.g. 'Tokyo'")
    country: str = Field(description="Country name, e.g. 'Japan'")
    slug: str = Field(description="URL-safe identifier, e.g. 'tokyo-japan'")
    description: Optional[str] = Field(None, description="Short intro blurb about the city's food scene")


# ── Dish ──────────────────────────────────────────────────────────────────────

class DishCreate(BaseModel):
    city_id: str = Field(description="UUID of the parent city")
    name: str = Field(description="Dish name, e.g. 'Ramen'")
    description: str = Field(description="What the dish is and why it is iconic to this city")
    rank: int = Field(ge=1, le=10, description="Rank 1-10, where 1 is the most must-try")
    cuisine_type: Optional[str] = Field(None, description="Cuisine style, e.g. 'Japanese'")
    tags: List[str] = Field(default_factory=list, description="Flavour/style tags e.g. ['noodle','spicy']")
    image_query: Optional[str] = Field(None, description="Suggested image search term")


class DishResponse(DishCreate):
    id: str
    created_at: datetime
    updated_at: datetime


# ── Restaurant ────────────────────────────────────────────────────────────────

class RestaurantCreate(BaseModel):
    dish_id: Optional[str] = Field(None, description="UUID of the dish this restaurant serves (None for category restaurants)")
    name: str = Field(description="Restaurant name")
    address: Optional[str] = Field(None, description="Full street address")
    google_maps_url: Optional[str] = Field(None, description="Google Maps link")
    google_rating: Optional[Decimal] = Field(None, ge=0, le=5, description="Google Maps star rating")
    review_count: Optional[int] = Field(None, ge=0, description="Number of Google reviews")
    price_level: Optional[PriceLevel] = Field(None, description="Price tier: $, $$, $$$, $$$$")
    rank: int = Field(ge=1, le=5, description="AI-computed composite rank 1-5")
    rank_rationale: Optional[str] = Field(None, description="Explanation of the composite rank")
    highlights: List[str] = Field(default_factory=list, description="Short highlights e.g. ['authentic','local favourite']")
    latitude: Optional[float] = Field(None, description="Latitude extracted from Maps URL or geocoded")
    longitude: Optional[float] = Field(None, description="Longitude extracted from Maps URL or geocoded")
    photo_url: Optional[str] = Field(None, description="CDN photo URL resolved from Google Places photo reference")


class RestaurantResponse(RestaurantCreate):
    id: str
    created_at: datetime
    updated_at: datetime


# ── Passport entry ────────────────────────────────────────────────────────────

class PassportEntryCreate(BaseModel):
    dish_id: Optional[str] = Field(None, description="UUID of the dish tasted (None for category items)")
    dish_name: Optional[str] = Field(None, description="Free-text dish name for category items")
    city_name: Optional[str] = Field(None, description="City name for category items")
    country: Optional[str] = Field(None, description="Country for category items")
    restaurant_id: Optional[str] = Field(None, description="UUID of the restaurant (optional)")
    tasted_at: Optional[date] = Field(default_factory=date.today, description="Date tasted")
    rating: Optional[int] = Field(None, ge=1, le=5, description="Personal rating 1-5")
    notes: Optional[str] = Field(None, description="Personal notes or memories")
    itinerary_ids: List[str] = Field(default_factory=list, description="Itinerary UUIDs this entry was logged from")


class PassportEntryUpdate(BaseModel):
    restaurant_id: Optional[str] = None
    tasted_at: Optional[date] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None


class PassportEntryResponse(PassportEntryCreate):
    id: str
    clerk_user_id: str
    created_at: datetime


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    clerk_user_id: str
    display_name: Optional[str] = None
    home_city: Optional[str] = None
    dietary_notes: Optional[str] = None


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    home_city: Optional[str] = None
    dietary_notes: Optional[str] = None


# ── Itinerary ─────────────────────────────────────────────────────────────────


class ItineraryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ItineraryItemCreate(BaseModel):
    dish_id: Optional[str] = None
    dish_name: Optional[str] = None
    city_name: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None
    itinerary_id: Optional[str] = None
    restaurant_id: Optional[str] = None
    category_type: Optional[CategoryType] = None


# ── Jobs ──────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    clerk_user_id: str
    job_type: JobType
    request_payload: Optional[Dict] = None


class JobUpdate(BaseModel):
    status: JobStatus
    error_message: Optional[str] = None


# ── LLM structured outputs ────────────────────────────────────────────────────

class DishItem(BaseModel):
    """Single dish entry returned by DishDiscoverer agent as structured output"""
    name: str
    description: str
    rank: int = Field(ge=1, le=10)
    cuisine_type: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    image_query: Optional[str] = None


class DishDiscoveryResult(BaseModel):
    """Full structured output from DishDiscoverer agent"""
    city: str
    country: str
    city_description: str
    dishes: List[DishItem] = Field(description="Exactly 10 must-try dishes ranked 1-10")


class RestaurantItem(BaseModel):
    """Single restaurant entry returned by RestaurantRanker agent"""
    name: str
    address: Optional[str] = None
    google_maps_url: Optional[str] = None
    google_rating: Optional[float] = None
    review_count: Optional[int] = None
    price_level: Optional[str] = None
    rank: int = Field(ge=1, le=5)
    rank_rationale: str
    highlights: List[str] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    open_now: Optional[bool] = None


class RestaurantRankingResult(BaseModel):
    """Full structured output from RestaurantRanker agent"""
    dish_name: str
    city: str
    restaurants: List[RestaurantItem] = Field(description="Top 5 restaurants ranked 1-5")
