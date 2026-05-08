/**
 * API client for Local Taste backend
 */
import { showToast } from '../components/Toast';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface User {
  clerk_user_id: string;
  display_name: string;
  home_city?: string;
  dietary_notes?: string;
}

export interface City {
  id: string;
  name: string;
  country: string;
  slug: string;
  description?: string;
}

export interface Dish {
  id: string;
  city_id: string;
  name: string;
  description: string;
  rank: number;
  cuisine_type?: string;
  tags: string[];
  in_passport?: boolean;
}

export interface Restaurant {
  id: string;
  dish_id: string;
  name: string;
  address?: string;
  google_maps_url?: string;
  google_rating?: number;
  review_count?: number;
  price_level?: string;
  rank: number;
  rank_rationale?: string;
  highlights: string[];
}

export interface PassportEntry {
  id: string;
  clerk_user_id: string;
  dish_id: string;
  dish_name: string;
  city_name: string;
  country: string;
  tasted_at?: string;
  rating?: number;
  notes?: string;
}

export interface Job {
  id: string;
  clerk_user_id: string;
  job_type: string;
  status: string;
  dishes_payload?: Record<string, unknown>;
  restaurants_payload?: Record<string, unknown>;
  summary_payload?: Record<string, unknown>;
  error_message?: string;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    showToast('error', 'Session expired. Please sign in again.');
    setTimeout(() => { window.location.href = '/'; }, 2000);
    throw new Error('Session expired');
  }

  if (response.status === 429) {
    showToast('error', 'Too many requests. Please slow down.');
    throw new Error('Rate limited');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export function createApiClient(token: string) {
  return {
    user: {
      get: () => apiRequest<{ user: User; created: boolean }>('/api/user', token),
    },

    cities: {
      dishes: (cityId: string) =>
        apiRequest<{ city: City; dishes: Dish[] }>(`/api/cities/${cityId}/dishes`, token),
    },

    discover: {
      start: (city: string, country: string) =>
        apiRequest<{ job_id: string; message: string; city_id?: string }>('/api/discover', token, {
          method: 'POST',
          body: JSON.stringify({ city, country }),
        }),
    },

    restaurants: {
      rank: (dishId: string, dishName: string, city: string, country: string) =>
        apiRequest<{ job_id: string; message: string }>('/api/rank-restaurants', token, {
          method: 'POST',
          body: JSON.stringify({ dish_id: dishId, dish_name: dishName, city, country }),
        }),
      list: (dishId: string) =>
        apiRequest<{ dish: Dish; restaurants: Restaurant[] }>(`/api/dishes/${dishId}/restaurants`, token),
    },

    passport: {
      list: () => apiRequest<PassportEntry[]>('/api/passport', token),
      add: (dishId: string, rating?: number, notes?: string) =>
        apiRequest<PassportEntry>('/api/passport', token, {
          method: 'POST',
          body: JSON.stringify({ dish_id: dishId, rating, notes }),
        }),
      stats: () => apiRequest<Record<string, unknown>>('/api/passport/stats', token),
    },

    jobs: {
      get: (id: string) => apiRequest<Job>(`/api/jobs/${id}`, token),
    },
  };
}
