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
    ItineraryCreate,
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

    def upsert_dish(self, dish: 'DishCreate') -> str:
        sql = """
            INSERT INTO dishes (city_id, name, description, rank, cuisine_type, tags, image_query)
            VALUES (:city_id::uuid, :name, :description, :rank, :cuisine_type, :tags::jsonb, :image_query)
            ON CONFLICT (city_id, lower(name))
            DO UPDATE SET
                rank         = EXCLUDED.rank,
                description  = EXCLUDED.description,
                cuisine_type = EXCLUDED.cuisine_type,
                tags         = EXCLUDED.tags,
                image_query  = EXCLUDED.image_query,
                updated_at   = NOW()
            RETURNING id
        """
        import json
        result = self.db.query_one(sql, [
            {'name': 'city_id',      'value': {'stringValue': str(dish.city_id)}},
            {'name': 'name',         'value': {'stringValue': dish.name}},
            {'name': 'description',  'value': {'stringValue': dish.description or ''}},
            {'name': 'rank',         'value': {'longValue': dish.rank}},
            {'name': 'cuisine_type', 'value': {'stringValue': dish.cuisine_type or ''}},
            {'name': 'tags',         'value': {'stringValue': json.dumps(dish.tags or [])}},
            {'name': 'image_query',  'value': {'stringValue': dish.image_query or ''}},
        ])
        return result['id']


class Restaurants(BaseModel):
    table_name = 'restaurants'

    def find_by_dish(self, dish_id: str) -> List[Dict]:
        sql = "SELECT * FROM restaurants WHERE dish_id = :dish_id::uuid ORDER BY rank"
        return self.db.query(sql, [{'name': 'dish_id', 'value': {'stringValue': dish_id}}])

    def find_by_ids(self, ids: List[str]) -> List[Dict]:
        if not ids:
            return []
        # Build one param per id — Data API doesn't support array binding
        placeholders = ", ".join(f":id{i}::uuid" for i in range(len(ids)))
        sql = f"SELECT * FROM restaurants WHERE id IN ({placeholders}) ORDER BY rank"
        params = [{'name': f'id{i}', 'value': {'stringValue': id_}} for i, id_ in enumerate(ids)]
        return self.db.query(sql, params)

    def create_restaurant(self, restaurant: 'RestaurantCreate') -> str:
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

    def find_by_user_and_dish(self, clerk_user_id: str, dish_id: str) -> List[Dict]:
        sql = """
            SELECT * FROM passport_entries
            WHERE clerk_user_id = :uid AND dish_id = :dish_id::uuid
        """
        return self.db.query(sql, [
            {'name': 'uid', 'value': {'stringValue': clerk_user_id}},
            {'name': 'dish_id', 'value': {'stringValue': dish_id}},
        ])

    def find_by_user_dish_and_restaurant(self, clerk_user_id: str, dish_id: str, restaurant_id: Optional[str]) -> Optional[Dict]:
        if restaurant_id:
            sql = """SELECT * FROM passport_entries
                     WHERE clerk_user_id = :uid AND dish_id = :dish_id::uuid
                       AND restaurant_id = :rid::uuid"""
            return self.db.query_one(sql, [
                {'name': 'uid',     'value': {'stringValue': clerk_user_id}},
                {'name': 'dish_id', 'value': {'stringValue': dish_id}},
                {'name': 'rid',     'value': {'stringValue': restaurant_id}},
            ])
        else:
            sql = """SELECT * FROM passport_entries
                     WHERE clerk_user_id = :uid AND dish_id = :dish_id::uuid
                       AND restaurant_id IS NULL"""
            return self.db.query_one(sql, [
                {'name': 'uid',     'value': {'stringValue': clerk_user_id}},
                {'name': 'dish_id', 'value': {'stringValue': dish_id}},
            ])

    def create_entry(self, clerk_user_id: str, entry: PassportEntryCreate) -> str:
        import json
        data = {k: v for k, v in {
            'clerk_user_id': clerk_user_id,
            'dish_id': entry.dish_id,
            'restaurant_id': entry.restaurant_id,
            'tasted_at': entry.tasted_at if entry.tasted_at else date.today(),
            'rating': entry.rating,
            'notes': entry.notes,
        }.items() if v is not None}
        data['itinerary_ids'] = json.dumps([str(i) for i in entry.itinerary_ids]) if entry.itinerary_ids else '[]'
        try:
            return self.db.insert('passport_entries', data, returning='id')
        except Exception as e:
            if 'unique' in str(e).lower() or 'duplicate' in str(e).lower():
                existing = self.find_by_user_dish_and_restaurant(clerk_user_id, entry.dish_id, entry.restaurant_id)
                if existing:
                    if entry.itinerary_ids:
                        self.append_itinerary_ids(existing['id'], entry.itinerary_ids)
                    return existing['id']
            raise

    def append_itinerary_ids(self, entry_id: str, itinerary_ids: list) -> None:
        """Append itinerary UUIDs to an existing passport entry, skipping duplicates."""
        for iid in itinerary_ids:
            sql = """
                UPDATE passport_entries
                SET itinerary_ids = itinerary_ids || ARRAY[:iid::uuid]
                WHERE id = :id::uuid
                  AND NOT (itinerary_ids @> ARRAY[:iid::uuid])
            """
            self.db.execute(sql, [
                {'name': 'iid', 'value': {'stringValue': str(iid)}},
                {'name': 'id',  'value': {'stringValue': entry_id}},
            ])

    def update_entry(self, entry_id: str, update: PassportEntryUpdate) -> int:
        data = {k: v for k, v in update.model_dump().items() if v is not None}
        if 'tasted_at' in data and hasattr(data['tasted_at'], 'isoformat'):
            data['tasted_at'] = data['tasted_at'].isoformat()
        return self.db.update('passport_entries', data, "id = :id::uuid", {'id': entry_id})

    def stats_for_user(self, clerk_user_id: str) -> Dict:
        sql = """
            SELECT
                COUNT(DISTINCT pe.dish_id)        AS total_dishes,
                COUNT(DISTINCT d.city_id)         AS cities_visited,
                COUNT(DISTINCT d.cuisine_type)    AS cuisine_types,
                ROUND(AVG(pe.rating), 1)          AS avg_rating
            FROM passport_entries pe
            JOIN dishes d ON pe.dish_id = d.id
            WHERE pe.clerk_user_id = :uid
        """
        result = self.db.query_one(sql, [{'name': 'uid', 'value': {'stringValue': clerk_user_id}}])
        return result or {'total_dishes': 0, 'cities_visited': 0, 'cuisine_types': 0, 'avg_rating': None}


class Itineraries(BaseModel):
    table_name = 'itineraries'

    def find_by_user(self, clerk_user_id: str) -> List[Dict]:
        sql = """
            SELECT i.*,
                   COUNT(ii.id) AS item_count
            FROM itineraries i
            LEFT JOIN itinerary_items ii ON ii.itinerary_id = i.id
            WHERE i.clerk_user_id = :uid
            GROUP BY i.id
            ORDER BY i.created_at ASC
        """
        return self.db.query(sql, [{'name': 'uid', 'value': {'stringValue': clerk_user_id}}])

    def create_itinerary(self, clerk_user_id: str, name: str, list_type: str = 'trip') -> str:
        return self.db.insert('itineraries', {'clerk_user_id': clerk_user_id, 'name': name, 'list_type': list_type}, returning='id')

    def delete_itinerary(self, itinerary_id: str) -> int:
        return self.db.delete('itineraries', "id = :id::uuid", {'id': itinerary_id})


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
                   COALESCE(
                       (SELECT r.latitude  FROM restaurants r
                        WHERE r.id = (ii.restaurant_ids->>0)::uuid
                          AND r.latitude IS NOT NULL LIMIT 1),
                       (SELECT r.latitude  FROM restaurants r
                        WHERE r.dish_id = ii.dish_id AND r.latitude IS NOT NULL LIMIT 1)
                   ) AS latitude,
                   COALESCE(
                       (SELECT r.longitude FROM restaurants r
                        WHERE r.id = (ii.restaurant_ids->>0)::uuid
                          AND r.longitude IS NOT NULL LIMIT 1),
                       (SELECT r.longitude FROM restaurants r
                        WHERE r.dish_id = ii.dish_id AND r.longitude IS NOT NULL LIMIT 1)
                   ) AS longitude
            FROM itinerary_items ii
            LEFT JOIN dishes d ON ii.dish_id = d.id
            LEFT JOIN cities c ON d.city_id = c.id
            WHERE ii.clerk_user_id = :uid
            ORDER BY ii.created_at DESC
        """
        return self.db.query(sql, [{'name': 'uid', 'value': {'stringValue': clerk_user_id}}])

    def find_by_itinerary(self, itinerary_id: str) -> List[Dict]:
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
                   COALESCE(
                       (SELECT r.latitude  FROM restaurants r
                        WHERE r.id = (ii.restaurant_ids->>0)::uuid
                          AND r.latitude IS NOT NULL LIMIT 1),
                       (SELECT r.latitude  FROM restaurants r
                        WHERE r.dish_id = ii.dish_id AND r.latitude IS NOT NULL LIMIT 1)
                   ) AS latitude,
                   COALESCE(
                       (SELECT r.longitude FROM restaurants r
                        WHERE r.id = (ii.restaurant_ids->>0)::uuid
                          AND r.longitude IS NOT NULL LIMIT 1),
                       (SELECT r.longitude FROM restaurants r
                        WHERE r.dish_id = ii.dish_id AND r.longitude IS NOT NULL LIMIT 1)
                   ) AS longitude
            FROM itinerary_items ii
            LEFT JOIN dishes d ON ii.dish_id = d.id
            LEFT JOIN cities c ON d.city_id = c.id
            WHERE ii.itinerary_id = :itinerary_id::uuid
            ORDER BY ii.created_at DESC
        """
        return self.db.query(sql, [{'name': 'itinerary_id', 'value': {'stringValue': itinerary_id}}])

    def find_by_user_and_dish(self, clerk_user_id: str, dish_id: str) -> Optional[Dict]:
        sql = """
            SELECT * FROM itinerary_items
            WHERE clerk_user_id = :uid AND dish_id = :dish_id::uuid
        """
        return self.db.query_one(sql, [
            {'name': 'uid', 'value': {'stringValue': clerk_user_id}},
            {'name': 'dish_id', 'value': {'stringValue': dish_id}},
        ])

    def find_by_itinerary_and_dish(self, itinerary_id: str, dish_id: str) -> Optional[Dict]:
        sql = """
            SELECT * FROM itinerary_items
            WHERE itinerary_id = :itinerary_id::uuid AND dish_id = :dish_id::uuid
        """
        return self.db.query_one(sql, [
            {'name': 'itinerary_id', 'value': {'stringValue': itinerary_id}},
            {'name': 'dish_id',      'value': {'stringValue': dish_id}},
        ])

    def find_by_itinerary_and_category(self, itinerary_id: str, dish_name: str, city_name: str) -> Optional[Dict]:
        sql = """SELECT * FROM itinerary_items
                 WHERE itinerary_id = :itinerary_id::uuid AND dish_id IS NULL
                   AND dish_name = :dish_name AND city_name = :city_name"""
        return self.db.query_one(sql, [
            {'name': 'itinerary_id', 'value': {'stringValue': itinerary_id}},
            {'name': 'dish_name',    'value': {'stringValue': dish_name}},
            {'name': 'city_name',    'value': {'stringValue': city_name}},
        ])

    def append_restaurant(self, item_id: str, restaurant_id: str) -> None:
        sql = """
            UPDATE itinerary_items
            SET restaurant_ids = restaurant_ids || jsonb_build_array(:rid)
            WHERE id = :id::uuid
              AND NOT (restaurant_ids @> jsonb_build_array(:rid))
        """
        self.db.execute(sql, [
            {'name': 'rid', 'value': {'stringValue': restaurant_id}},
            {'name': 'id',  'value': {'stringValue': item_id}},
        ])

    def remove_restaurant(self, item_id: str, restaurant_id: str) -> None:
        sql = """
            UPDATE itinerary_items
            SET restaurant_ids = (
                SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
                FROM jsonb_array_elements_text(restaurant_ids) AS val
                WHERE val <> :rid
            )
            WHERE id = :id::uuid
        """
        self.db.execute(sql, [
            {'name': 'rid', 'value': {'stringValue': restaurant_id}},
            {'name': 'id',  'value': {'stringValue': item_id}},
        ])

    def create_item(self, clerk_user_id: str, item: ItineraryItemCreate, dish_name: str, city_name: str, country: str) -> str:
        restaurant_ids = [item.restaurant_id] if item.restaurant_id else []
        data: Dict = {
            'clerk_user_id': clerk_user_id,
            'dish_name': dish_name,
            'city_name': city_name,
            'country': country,
            'restaurant_ids': restaurant_ids,
        }
        if item.dish_id:
            data['dish_id'] = item.dish_id
        if item.notes:
            data['notes'] = item.notes
        if item.itinerary_id:
            data['itinerary_id'] = item.itinerary_id
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
        self.itineraries = Itineraries(self.client)
        self.itinerary = ItineraryItems(self.client)
        self.jobs = Jobs(self.client)

    def execute_raw(self, sql: str, parameters: List[Dict] = None) -> Dict:
        return self.client.execute(sql, parameters)

    def query_raw(self, sql: str, parameters: List[Dict] = None) -> List[Dict]:
        return self.client.query(sql, parameters)
