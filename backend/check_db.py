#!/usr/bin/env python3
"""Quick DB health check — shows recent jobs and city/dish counts."""

import json
from database.src import Database

db = Database()

print("Recent jobs:")
jobs = db.jobs.find_all()
sorted_jobs = sorted(jobs, key=lambda x: x["created_at"], reverse=True)[:5]
for job in sorted_jobs:
    print(f"  {job['id'][:8]}... {job['job_type']} → {job['status']} ({job['created_at']})")

print("\nCities:")
cities = db.cities.find_all()
for city in cities:
    dishes = db.dishes.find_by_city(city["id"])
    print(f"  {city['name']}, {city['country']} — {len(dishes)} dishes")
