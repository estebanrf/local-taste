"""
Database models and query builders for Local Taste
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, date
from decimal import Decimal
from .client import DataAPIClient
from .schemas import (
    CityCreate, DishCreate, RestaurantCreate,
    PassportEntryCreate, PassportEntryUpdate,
    UserCreate, JobCreate, ItineraryItemCreate,
)


class BaseModel:
    table_name = None

    def __init__(self, db: DataAPIClient):
        self.db = db
        if not self.table_name:
            raise ValueError("table_name must be defined")

    def find_by_id(self, id: Any) -> Optional[Dict]:
        sql = f"SELECT * FROM {self.table_name} WHERE id = :id::uuid"
        return self.db.query_one(sql, [{'name': 'id', 'value': {'stringValue': str(id)}}])

    def find_all(self, limit: int = 100, offset: int = 0) -> List[Dict]:
        sql = f"SELECT * FROM {self.table_name} LIMIT :limit OFFSET :offset"
        return self.db.query(sql, [
            {'name': 'limit', 'value': {'longValue': limit}},
            {'name': 'offset', 'value': {'longValue': offset}},
        ])

    def update(self, id: Any, data: Dict) -> int:
        return self.db.update(self.table_name, data, "id = :id::uuid", {'id': str(id)})

    def delete(self, id: Any) -> int:
        return self.db.delete(self.table_name, "id = :id::uuid", {'id': str(id)})


class Users(BaseModel):
    table_name = 'users'

    def find_by_clerk_id(self, clerk_user_id: str) -> Optional[Dict]:
        sql = "SELECT * FROM users WHERE clerk_user_id = :clerk_id"
        return self.db.query_one(sql, [{'name': 'clerk_id', 'value': {'stringValue': clerk_user_id}}])

    def create_user(self, clerk_user_id: str, display_name: str = None,
                    home_city: str = None, dietary_notes: str = None) -> str:
        data = {k: v for k, v in {
            'clerk_user_id': clerk_user_id,
            'display_name': display_name,
            'home_city': home_city,
            'dietary_notes': dietary_notes,
        }.items() if v is not None}
        return self.db.insert('users', data, returning='clerk_user_id')


class Cities(BaseModel):
    table_name = 'cities'

    def find_by_slug(self, slug: str) -> Optional[Dict]:
        sql = "SELECT * FROM cities WHERE slug = :slug"
        return self.db.query_one(sql, [{'name': 'slug', 'value': {'stringValue': slug}}])

    def search(self, query: str) -> List[Dict]:
        sql = """
            SELECT * FROM cities
            WHERE LOWER(name) LIKE LOWER(:q) OR LOWER(country) LIKE LOWER(:q)
            ORDER BY name LIMIT 20
        """
        return self.db.query(sql, [{'name': 'q', 'value': {'stringValue': f'%{query}%'}}])

    def create_city(self, city: CityCreate) -> str:
        data = city.model_dump(exclude_none=True)
        return self.db.insert('cities', data, returning='id')

    def upsert_city(self, city: CityCreate) -> str:
        """Insert or return existing city by slug"""
        existing = self.find_by_slug(city.slug)
        if existing:
            return existing['id']
        return self.create_city(city)


class Dishes(BaseModel):
    table_name = 'dishes'

    def find_by_city(self, city_id: str) -> List[Dict]:
        sql = "SELECT * FROM dishes WHERE city_id = :city_id::uuid ORDER BY rank"
        return self.db.query(sql, [{'name': 'city_id', 'value': {'stringValue': city_id}}])

    def create_dish(self, dish: DishCreate) -> str:
        data = dish.model_dump(exclude_none=True)
        return self.db.insert('dishes', data, returning='id')

    def delete_by_city(self, city_id: str) -> int:
        return self.db.delete('dishes', "city_id = :city_id::uuid", {'city_id': city_id})


class Restaurants(BaseModel):
    table_name = 'restaurants'

    def find_by_dish(self, dish_id: str) -> List[Dict]:
        sql = "SELECT * FROM restaurants WHERE dish_id = :dish_id::uuid ORDER BY rank"
        return self.db.query(sql, [{'name': 'dish_id', 'value': {'stringValue': dish_id}}])

    def create_restaurant(self, restaurant: RestaurantCreate) -> str:
        data = restaurant.model_dump(exclude_none=True)
        return self.db.insert('restaurants', data, returning='id')

    def delete_by_dish(self, dish_id: str) -> int:
        return self.db.delete('restaurants', "dish_id = :dish_id::uuid", {'dish_id': dish_id})


class PassportEntries(BaseModel):
    table_name = 'passport_entries'

    def find_by_user(self, clerk_user_id: str) -> List[Dict]:
        sql = """
            SELECT pe.*, d.name AS dish_name, d.cuisine_type, d.rank AS dish_rank,
                   c.name AS city_name, c.country,
                   r.name AS restaurant_name
            FROM passport_entries pe
            JOIN dishes d ON pe.dish_id = d.id
            JOIN cities c ON d.city_id = c.id
            LEFT JOIN restaurants r ON pe.restaurant_id = r.id
            WHERE pe.clerk_user_id = :uid
            ORDER BY pe.tasted_at DESC, pe.created_at DESC
        """
        return self.db.query(sql, [{'name': 'uid', 'value': {'stringValue': clerk_user_id}}])

    def find_by_user_and_dish(self, clerk_user_id: str, dish_id: str) -> Optional[Dict]:
        sql = """
            SELECT * FROM passport_entries
            WHERE clerk_user_id = :uid AND dish_id = :dish_id::uuid
        """
        return self.db.query_one(sql, [
            {'name': 'uid', 'value': {'stringValue': clerk_user_id}},
            {'name': 'dish_id', 'value': {'stringValue': dish_id}},
        ])

    def create_entry(self, clerk_user_id: str, entry: PassportEntryCreate) -> str:
        data = {k: v for k, v in {
            'clerk_user_id': clerk_user_id,
            'dish_id': entry.dish_id,
            'restaurant_id': entry.restaurant_id,
            'tasted_at': entry.tasted_at.isoformat() if entry.tasted_at else date.today().isoformat(),
            'rating': entry.rating,
            'notes': entry.notes,
        }.items() if v is not None}
        return self.db.insert('passport_entries', data, returning='id')

    def update_entry(self, entry_id: str, update: PassportEntryUpdate) -> int:
        data = {k: v for k, v in update.model_dump().items() if v is not None}
        if 'tasted_at' in data and hasattr(data['tasted_at'], 'isoformat'):
            data['tasted_at'] = data['tasted_at'].isoformat()
        return self.db.update('passport_entries', data, "id = :id::uuid", {'id': entry_id})

    def stats_for_user(self, clerk_user_id: str) -> Dict:
        sql = """
            SELECT
                COUNT(*)                          AS total_dishes,
                COUNT(DISTINCT d.city_id)         AS cities_visited,
                COUNT(DISTINCT d.cuisine_type)    AS cuisine_types,
                ROUND(AVG(pe.rating), 1)          AS avg_rating
            FROM passport_entries pe
            JOIN dishes d ON pe.dish_id = d.id
            WHERE pe.clerk_user_id = :uid
        """
        result = self.db.query_one(sql, [{'name': 'uid', 'value': {'stringValue': clerk_user_id}}])
        return result or {'total_dishes': 0, 'cities_visited': 0, 'cuisine_types': 0, 'avg_rating': None}


class ItineraryItems(BaseModel):
    table_name = 'itinerary_items'

    def find_by_user(self, clerk_user_id: str) -> List[Dict]:
        sql = """
            SELECT ii.*,
                   d.description  AS dish_description,
                   d.cuisine_type,
                   d.tags,
                   d.rank         AS dish_rank,
                   c.id           AS city_id,
                   (SELECT COUNT(*) FROM passport_entries pe
                    WHERE pe.clerk_user_id = ii.clerk_user_id
                      AND pe.dish_id = ii.dish_id) AS eaten_count,
                   (SELECT r.latitude  FROM restaurants r
                    WHERE r.dish_id = ii.dish_id AND r.latitude  IS NOT NULL LIMIT 1) AS latitude,
                   (SELECT r.longitude FROM restaurants r
                    WHERE r.dish_id = ii.dish_id AND r.longitude IS NOT NULL LIMIT 1) AS longitude
            FROM itinerary_items ii
            LEFT JOIN dishes d ON ii.dish_id = d.id
            LEFT JOIN cities c ON d.city_id = c.id
            WHERE ii.clerk_user_id = :uid
            ORDER BY ii.created_at DESC
        """
        return self.db.query(sql, [{'name': 'uid', 'value': {'stringValue': clerk_user_id}}])

    def find_by_user_and_dish(self, clerk_user_id: str, dish_id: str) -> Optional[Dict]:
        sql = """
            SELECT * FROM itinerary_items
            WHERE clerk_user_id = :uid AND dish_id = :dish_id::uuid
        """
        return self.db.query_one(sql, [
            {'name': 'uid', 'value': {'stringValue': clerk_user_id}},
            {'name': 'dish_id', 'value': {'stringValue': dish_id}},
        ])

    def create_item(self, clerk_user_id: str, item: ItineraryItemCreate, dish_name: str, city_name: str, country: str) -> str:
        data = {
            'clerk_user_id': clerk_user_id,
            'dish_id': item.dish_id,
            'dish_name': dish_name,
            'city_name': city_name,
            'country': country,
        }
        if item.notes:
            data['notes'] = item.notes
        return self.db.insert('itinerary_items', data, returning='id')

    def delete_item(self, item_id: str) -> int:
        return self.db.delete('itinerary_items', "id = :id::uuid", {'id': item_id})


class Jobs(BaseModel):
    table_name = 'jobs'

    def create_job(self, clerk_user_id: str, job_type: str, request_payload: Dict = None) -> str:
        data = {
            'clerk_user_id': clerk_user_id,
            'job_type': job_type,
            'status': 'pending',
            'request_payload': request_payload,
        }
        return self.db.insert('jobs', data, returning='id')

    def update_status(self, job_id: str, status: str, error_message: str = None) -> int:
        data = {'status': status}
        if status == 'running':
            data['started_at'] = datetime.utcnow()
        elif status in ['completed', 'failed']:
            data['completed_at'] = datetime.utcnow()
        if error_message:
            data['error_message'] = error_message
        return self.db.update('jobs', data, "id = :id::uuid", {'id': job_id})

    def update_dishes(self, job_id: str, dishes_payload: Dict) -> int:
        return self.db.update('jobs', {'dishes_payload': dishes_payload}, "id = :id::uuid", {'id': job_id})

    def update_restaurants(self, job_id: str, restaurants_payload: Dict) -> int:
        return self.db.update('jobs', {'restaurants_payload': restaurants_payload}, "id = :id::uuid", {'id': job_id})

    def update_summary(self, job_id: str, summary_payload: Dict) -> int:
        return self.db.update('jobs', {'summary_payload': summary_payload}, "id = :id::uuid", {'id': job_id})

    def find_by_user(self, clerk_user_id: str, limit: int = 50) -> List[Dict]:
        sql = """
            SELECT * FROM jobs WHERE clerk_user_id = :uid
            ORDER BY created_at DESC LIMIT :limit
        """
        return self.db.query(sql, [
            {'name': 'uid', 'value': {'stringValue': clerk_user_id}},
            {'name': 'limit', 'value': {'longValue': limit}},
        ])


class Database:
    def __init__(self, cluster_arn: str = None, secret_arn: str = None,
                 database: str = None, region: str = None):
        self.client = DataAPIClient(cluster_arn, secret_arn, database, region)
        self.users = Users(self.client)
        self.cities = Cities(self.client)
        self.dishes = Dishes(self.client)
        self.restaurants = Restaurants(self.client)
        self.passport = PassportEntries(self.client)
        self.itinerary = ItineraryItems(self.client)
        self.jobs = Jobs(self.client)

    def execute_raw(self, sql: str, parameters: List[Dict] = None) -> Dict:
        return self.client.execute(sql, parameters)

    def query_raw(self, sql: str, parameters: List[Dict] = None) -> List[Dict]:
        return self.client.query(sql, parameters)
