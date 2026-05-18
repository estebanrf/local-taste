import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import Portal from "../components/Portal";
import Link from "next/link";
import Head from "next/head";

const ItineraryMap = dynamic(() => import("../components/ItineraryMap"), { ssr: false });

const DISH_COLORS = [
  "#7c3aed", "#ea580c", "#0891b2", "#16a34a", "#db2777",
  "#ca8a04", "#4f46e5", "#dc2626", "#059669", "#7c2d12",
];

const dishKeyColor = (key: string): string => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DISH_COLORS[h % DISH_COLORS.length];
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Itinerary {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
}

interface ItineraryItem {
  id: string;
  dish_id: string | null;
  dish_name: string;
  city_name: string;
  country: string;
  notes: string | null;
  dish_description: string | null;
  cuisine_type: string | null;
  tags: string[];
  dish_rank: number | null;
  city_id: string | null;
  eaten_count: number;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  restaurant_ids: string[];
  category_type: "world_cuisine" | "occasion" | null;
}


interface ReviewSnippet {
  author: string;
  rating: number | null;
  text: string;
}

interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  google_maps_url: string | null;
  google_rating: number | null;
  review_count: number | null;
  price_level: string | null;
  rank: number;
  rank_rationale: string;
  highlights: string[];
  latitude: number | null;
  longitude: number | null;
  photo_url: string | null;
  reviews: ReviewSnippet[];
}

interface PassportEntry {
  id: string;
  dish_id: string | null;
  dish_name: string | null;
  city_name: string | null;
  restaurant_id: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Plan() {
  const { getToken } = useAuth();
  const { isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  // Stores deep-link intent from passport navigation; consumed once after items load
  const deepLinkRef = useRef<{
    itineraryId: string;
    dishId?: string;
    dishName?: string;
    cityName?: string;
    restaurantId?: string;
  } | null>(null);

  // ── Shared ────────────────────────────────────────────────────────────────
  const [passportEntries, setPassportEntries] = useState<PassportEntry[]>([]);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [eatenDateModal, setEatenDateModal] = useState<{ label: string; onConfirm: (date: string, rating: number, notes: string) => void } | null>(null);
  const [eatenDate, setEatenDate] = useState("");
  const [eatenRating, setEatenRating] = useState(0);
  const [eatenNotes, setEatenNotes] = useState("");

  // ── Lists state ───────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [expandedCityKey, setExpandedCityKey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItineraryItem | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [foundRestaurants, setFoundRestaurants] = useState<Restaurant[]>([]);
  const [restaurantCache, setRestaurantCache] = useState<Record<string, Restaurant>>({});
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [markingEaten, setMarkingEaten] = useState<Set<string>>(new Set());
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [rankingRestaurants, setRankingRestaurants] = useState(false);
  const [rankingStatus, setRankingStatus] = useState("");
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmDeleteTripId, setConfirmDeleteTripId] = useState<string | null>(null);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [showNewTripInput, setShowNewTripInput] = useState(false);
  const [focusCoords, setFocusCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadPassport = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/passport`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setPassportEntries(data.entries || []);
    }
  }, [getToken]);

  const loadItineraries = useCallback(async () => {
    const token = await getToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/api/itineraries`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      const list: Itinerary[] = data.itineraries || [];
      setItineraries(list);
      return list;
    }
    return [];
  }, [getToken]);

  const loadItems = useCallback(async (itineraryId: string) => {
    setLoadingItems(true);
    setSelectedItem(null);
    setExpandedCityKey(null);
    setRestaurants([]);
    setFoundRestaurants([]);
    setRestaurantCache({});
    setFocusCoords(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/itineraries/${itineraryId}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const loaded: ItineraryItem[] = data.items || [];
        setItems(loaded);

        // ── Deep-link focus (coming from passport "Go to plan") ──────────────
        const intent = deepLinkRef.current;
        if (intent && intent.itineraryId === itineraryId) {
          deepLinkRef.current = null;

          // 1. Find the matching item by dish_id or dish_name+city_name
          const matchItem = loaded.find(i =>
            intent.dishId
              ? i.dish_id === intent.dishId
              : i.dish_name === intent.dishName && i.city_name === intent.cityName
          );

          if (matchItem) {
            // Expand the city and select the item
            const cityKey = `${matchItem.city_name}|${matchItem.country}`;
            setExpandedCityKey(cityKey);
            setSelectedItem(matchItem);

            // 2. Try to focus the restaurant pin if it's still in the item
            if (intent.restaurantId && matchItem.restaurant_ids.includes(intent.restaurantId)) {
              setSelectedRestaurantId(intent.restaurantId);
              // Fetch restaurants so we can get coords for the map fly
              const token = await getToken();
              if (token) {
                const rList = await fetchRestaurants(token, matchItem.dish_id, matchItem.restaurant_ids);
                setRestaurants(rList);
                setRestaurantCache(prev => {
                  const next = { ...prev };
                  rList.forEach(r => { next[r.id] = r; });
                  return next;
                });
                const target = rList.find(r => r.id === intent.restaurantId);
                // Delay so the map has time to render the restaurant pins after cache is set
                setTimeout(() => {
                  if (target?.latitude && target?.longitude) {
                    setFocusCoords({ lat: target.latitude, lng: target.longitude });
                  }
                  document.getElementById(`restaurant-card-${intent.restaurantId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }, 300);
              }
            } else if (matchItem.latitude && matchItem.longitude) {
              // 3. No restaurant — fly to the dish/category pin
              setFocusCoords({ lat: matchItem.latitude, lng: matchItem.longitude });
            }
          } else {
            // 4. Item not in plan — just expand the city if we know it
            if (intent.cityName) {
              const cityKey = loaded.find(i => i.city_name === intent.cityName)
                ? `${intent.cityName}|${loaded.find(i => i.city_name === intent.cityName)!.country}`
                : null;
              if (cityKey) setExpandedCityKey(cityKey);
            }
            // 5. If nothing matches, plan is just opened — no extra focus needed
          }
        }
      }
    } finally {
      setLoadingItems(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!isUserLoaded || !router.isReady) return;
    const { itinerary, dish_id, dish_name, city_name, restaurant_id } = router.query;
    if (itinerary) {
      deepLinkRef.current = {
        itineraryId:  String(itinerary),
        dishId:       dish_id       ? String(dish_id)       : undefined,
        dishName:     dish_name     ? String(dish_name)     : undefined,
        cityName:     city_name     ? String(city_name)     : undefined,
        restaurantId: restaurant_id ? String(restaurant_id) : undefined,
      };
    }
    Promise.all([loadItineraries(), loadPassport()]).then(([list]) => {
      const targetId = deepLinkRef.current?.itineraryId;
      const startId = targetId ?? (list && list.length > 0 ? list[0].id : null);
      if (startId) {
        setActiveId(startId);
        loadItems(startId);
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, router.isReady]);

  const switchTrip = (id: string) => {
    setActiveId(id);
    loadItems(id);
  };

  // ── Shared restaurant fetch ───────────────────────────────────────────────

  const fetchRestaurants = async (token: string, dishId: string | null | undefined, savedIds: string[]): Promise<Restaurant[]> => {
    if (savedIds.length === 0) return [];
    let all: Restaurant[] = [];
    if (dishId) {
      const res = await fetch(`${API_URL}/api/dishes/${dishId}/restaurants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) all = (await res.json()).restaurants || [];
    } else {
      const res = await fetch(`${API_URL}/api/restaurants/by-ids`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: savedIds }),
      });
      if (res.ok) all = (await res.json()).restaurants || [];
    }
    return [...all.filter(r => savedIds.includes(r.id))].sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0));
  };

  // ── List handlers ─────────────────────────────────────────────────────────

  const handleCreateList = async () => {
    const name = newTripName.trim();
    if (!name) { showToast("error", "Please enter a name"); return; }
    setCreatingTrip(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/itineraries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      const newList: Itinerary = { id: created.id, name: created.name, item_count: 0, created_at: new Date().toISOString() };
      setItineraries(prev => [...prev, newList]);
      setNewTripName("");
      setShowNewTripInput(false);
      switchTrip(created.id);
      showToast("success", `"${created.name}" created!`);
    } catch {
      showToast("error", "Failed to create list.");
    } finally {
      setCreatingTrip(false);
    }
  };

  const handleDeleteTrip = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/itineraries/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setConfirmDeleteTripId(null);
      const remaining = itineraries.filter(t => t.id !== id);
      setItineraries(remaining);
      if (activeId === id) {
        if (remaining.length > 0) { switchTrip(remaining[0].id); }
        else { setActiveId(null); setItems([]); }
      }
      showToast("success", "List deleted.");
    } catch {
      showToast("error", "Failed to delete trip.");
    }
  };

  const openCity = async (cityKey: string, cityItems: ItineraryItem[]) => {
    if (expandedCityKey === cityKey) {
      setExpandedCityKey(null);
      setSelectedItem(null);
      setRestaurants([]);
      setFoundRestaurants([]);
      setFocusCoords(null);
      setSelectedRestaurantId(null);
      return;
    }
    setExpandedCityKey(cityKey);
    setSelectedItem(null);
    setRestaurants([]);
    setFoundRestaurants([]);

    // Fly immediately using the item lat/lng already from DB
    const rep = cityItems.find(i => i.latitude != null && i.longitude != null);
    if (rep) setFocusCoords({ lat: rep.latitude!, lng: rep.longitude! });

    // Load restaurant details into cache in background
    setLoadingRestaurants(true);
    try {
      const token = (await getToken()) ?? "";
      const newCache: Record<string, Restaurant> = { ...restaurantCache };
      for (const item of cityItems) {
        const savedIds = item.restaurant_ids || [];
        if (!item.dish_id && savedIds.length === 0) continue;
        const loaded = await fetchRestaurants(token, item.dish_id, savedIds);
        loaded.forEach(r => { newCache[r.id] = r; });
      }
      setRestaurantCache(newCache);
    } catch { /* silent */ } finally {
      setLoadingRestaurants(false);
    }
  };

  const openDish = async (item: ItineraryItem) => {
    if (selectedItem?.id === item.id) {
      // deselect — back to city view
      setSelectedItem(null);
      setRestaurants([]);
      setFoundRestaurants([]);
      setSelectedRestaurantId(null);
      return;
    }
    setSelectedItem(item);
    setFoundRestaurants([]);
    setSelectedRestaurantId(null);
    const savedIds = item.restaurant_ids || [];
    if (!item.dish_id && savedIds.length === 0) { setRestaurants([]); return; }
    setLoadingRestaurants(true);
    try {
      const token = (await getToken()) ?? "";
      const loaded = await fetchRestaurants(token, item.dish_id, savedIds);
      setRestaurants(loaded);
      setRestaurantCache(prev => {
        const next = { ...prev };
        loaded.forEach(r => { next[r.id] = r; });
        return next;
      });
      const first = loaded.find(r => r.latitude != null && r.longitude != null);
      if (first) setFocusCoords({ lat: first.latitude!, lng: first.longitude! });
    } catch { /* silent */ } finally {
      setLoadingRestaurants(false);
    }
  };

  const findRestaurants = async (item: ItineraryItem) => {
    setRankingRestaurants(true);
    setRankingStatus("Finding the best spots…");
    try {
      const token = await getToken();
      const endpoint = item.dish_id ? "/api/rank-restaurants" : "/api/rank-by-category";
      if (!item.dish_id && !item.category_type) {
        showToast("error", "Cannot find restaurants: category type is missing for this item.");
        setRankingRestaurants(false);
        return;
      }
      const body = item.dish_id
        ? { dish_id: item.dish_id, dish_name: item.dish_name, city: item.city_name, country: item.country }
        : { category: item.dish_name, category_type: item.category_type, city: item.city_name, country: item.country };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const { job_id } = await res.json();
      const interval = setInterval(async () => {
        try {
          const t = await getToken();
          const jr = await fetch(`${API_URL}/api/jobs/${job_id}`, { headers: { Authorization: `Bearer ${t}` } });
          if (!jr.ok) return;
          const job = await jr.json();
          if (job.status === "completed") {
            clearInterval(interval);
            setRankingRestaurants(false);
            setRankingStatus("");
            const rList = ((job.restaurants_payload as Record<string, unknown>)?.restaurants as Restaurant[]) || [];
            const t2 = await getToken();
            const saved = await fetchRestaurants(t2 ?? "", item.dish_id, item.restaurant_ids || []);
            setRestaurants(saved);
            setRestaurantCache(prev => {
              const next = { ...prev };
              saved.forEach(r => { next[r.id] = r; });
              return next;
            });
            const savedIds = new Set(saved.map(r => r.id));
            setFoundRestaurants(rList.filter(r => !savedIds.has(r.id)).sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0)));
          } else if (job.status === "failed") {
            clearInterval(interval);
            setRankingRestaurants(false);
            setRankingStatus("");
            showToast("error", "Failed to find restaurants.");
          } else {
            setRankingStatus("Searching local reviews…");
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch {
      setRankingRestaurants(false);
      setRankingStatus("");
      showToast("error", "Failed to start restaurant search.");
    }
  };

  const handleRemoveRestaurant = async (itemId: string, restaurantId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/itinerary-items/${itemId}/restaurants/${restaurantId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setRestaurants(prev => prev.filter(r => r.id !== restaurantId));
      setSelectedItem(prev => prev ? { ...prev, restaurant_ids: prev.restaurant_ids.filter(id => id !== restaurantId) } : prev);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, restaurant_ids: i.restaurant_ids.filter(id => id !== restaurantId) } : i));
    } catch {
      showToast("error", "Failed to remove restaurant.");
    }
  };

  const handleAddFoundRestaurant = async (restaurant: Restaurant) => {
    if (!selectedItem || !activeId) return;
    try {
      const token = await getToken();
      const body = selectedItem.dish_id
        ? { dish_id: selectedItem.dish_id, restaurant_id: restaurant.id }
        : { dish_name: selectedItem.dish_name, city_name: selectedItem.city_name, country: selectedItem.country, restaurant_id: restaurant.id };
      const res = await fetch(`${API_URL}/api/itineraries/${activeId}/items`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setFoundRestaurants(prev => prev.filter(r => r.id !== restaurant.id));
      setRestaurants(prev => [...prev, restaurant]);
      setRestaurantCache(prev => ({ ...prev, [restaurant.id]: restaurant }));
      setSelectedItem(prev => prev ? { ...prev, restaurant_ids: [...prev.restaurant_ids, restaurant.id] } : prev);
      setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, restaurant_ids: [...i.restaurant_ids, restaurant.id] } : i));
    } catch {
      showToast("error", "Failed to add restaurant.");
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/itinerary/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setConfirmDeleteItemId(null);
      if (selectedItem?.id === id) setSelectedItem(null);
      setItems(prev => prev.filter(i => i.id !== id));
      setItineraries(prev => prev.map(t => t.id === activeId ? { ...t, item_count: Math.max(0, t.item_count - 1) } : t));
      showToast("success", "Removed from trip.");
    } catch {
      showToast("error", "Failed to remove.");
    }
  };



  const handleMarkEaten = (restaurant: Restaurant) => {
    if (!selectedItem || markingEaten.has(restaurant.id)) return;
    setEatenDate(new Date().toISOString().slice(0, 10));
    setEatenRating(0);
    setEatenNotes("");
    setEatenDateModal({
      label: `When did you visit ${restaurant.name}?`,
      onConfirm: async (tastedAt: string, rating: number, notes: string) => {
        setEatenDateModal(null);
        setMarkingEaten(prev => new Set(prev).add(restaurant.id));
        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/api/passport`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(selectedItem.dish_id
              ? { dish_id: selectedItem.dish_id, restaurant_id: restaurant.id, tasted_at: tastedAt, rating: rating || undefined, notes: notes || undefined, itinerary_ids: activeId ? [activeId] : [] }
              : { dish_name: selectedItem.dish_name, city_name: selectedItem.city_name, country: selectedItem.country, restaurant_id: restaurant.id, tasted_at: tastedAt, rating: rating || undefined, notes: notes || undefined, itinerary_ids: activeId ? [activeId] : [] }
            ),
          });
          if (res.ok) {
            showToast("success", `"${selectedItem.dish_name}" at ${restaurant.name} added to your passport!`);
            await loadPassport();
            const updatedCount = (selectedItem.eaten_count || 0) + 1;
            setSelectedItem(prev => prev ? { ...prev, eaten_count: updatedCount } : prev);
            setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, eaten_count: updatedCount } : i));
          } else showToast("error", "Failed to mark as eaten.");
        } catch { showToast("error", "Failed to mark as eaten."); }
        finally { setMarkingEaten(prev => { const n = new Set(prev); n.delete(restaurant.id); return n; }); }
      },
    });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const groupByCity = (list: ItineraryItem[]) => {
    const groups: Record<string, { key: string; city: string; country: string; items: ItineraryItem[] }> = {};
    list.forEach(item => {
      const key = `${item.city_name}|${item.country}`;
      if (!groups[key]) groups[key] = { key, city: item.city_name, country: item.country, items: [] };
      groups[key].items.push(item);
    });
    return Object.values(groups);
  };

  const getDishColorForItem = (item: ItineraryItem) =>
    dishKeyColor(item.dish_id ?? `cat:${item.dish_name}:${item.city_name}`);

  // Three-level map hierarchy:
  //   no city open  → one pin per city (using item's DB lat/lng, city color = first dish color)
  //   city open     → all restaurant pins for all dishes in that city (each dish color)
  //   dish selected → only that dish's restaurant pins
  type MapDisplayItem = ItineraryItem & { restaurant_name: string | null; restaurant_id: string | null; color: string };
  const mapDisplayItems = (() => {
    const cityGroups = groupByCity(items);
    const expandedGroup = cityGroups.find(g => g.key === expandedCityKey);

    if (!expandedGroup) {
      // Level 1: one representative pin per city
      return cityGroups.flatMap(group => {
        const rep = group.items.find(i => i.latitude != null && i.longitude != null);
        if (!rep) return [];
        return [{
          ...rep,
          restaurant_name: null as string | null,
          color: getDishColorForItem(group.items[0]),
        }];
      });
    }

    const sourceItems = selectedItem
      ? expandedGroup.items.filter(i => i.id === selectedItem.id)
      : expandedGroup.items;

    // Level 2 / 3: restaurant pins from cache
    return sourceItems.flatMap(item => {
      const color = getDishColorForItem(item);
      const savedIds = item.restaurant_ids || [];
      const cached = savedIds.map(id => restaurantCache[id]).filter(Boolean);
      const pinnable = cached.filter(r => r.latitude != null && r.longitude != null);
      if (pinnable.length > 0) {
        return pinnable.map(r => ({
          ...item,
          latitude: r.latitude,
          longitude: r.longitude,
          restaurant_name: r.name as string | null,
          restaurant_id: r.id as string | null,
          color,
        }));
      }
      // fallback: use item's own DB lat/lng if no cached restaurant yet
      if (item.latitude != null && item.longitude != null) {
        return [{ ...item, restaurant_name: null as string | null, restaurant_id: null as string | null, color }];
      }
      return [] as MapDisplayItem[];
    });
  })() as MapDisplayItem[];

  const eatenDishIds = new Set(passportEntries.filter(e => e.dish_id).map(e => e.dish_id as string));
  const isItemEaten = (item: ItineraryItem) =>
    item.dish_id
      ? eatenDishIds.has(item.dish_id)
      : passportEntries.some(e => !e.dish_id && e.dish_name === item.dish_name && e.city_name === item.city_name);
  const isRestaurantEaten = (restaurantId: string) => passportEntries.some(e => e.restaurant_id === restaurantId);
  const activeTrip = itineraries.find(t => t.id === activeId);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Head><title>Plan - Local Taste</title></Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-dark">🗺️ Plan</h1>
              <p className="text-gray-600 mt-1">Your lists — wishlists, trips, and visited favorites.</p>
            </div>
            <Link href="/explore">
              <button className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 font-medium transition-colors">
                + Discover dishes
              </button>
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading…</div>
          ) : (
            <>
              {/* ── LIST SELECTOR ────────────────────────────────────────── */}
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {itineraries.map(list => (
                  <div key={list.id} className="flex items-center gap-1">
                    <button
                      onClick={() => switchTrip(list.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeId === list.id
                          ? "bg-primary text-white shadow-sm"
                          : "bg-white text-gray-600 border border-gray-200 hover:border-primary hover:text-primary"
                      }`}
                    >
                      {list.name}
                      <span className={`ml-1.5 text-xs ${activeId === list.id ? "opacity-70" : "text-gray-400"}`}>
                        ({list.item_count})
                      </span>
                    </button>
                    <button
                      onClick={() => setConfirmDeleteTripId(list.id)}
                      className="text-red-400 hover:text-red-600 text-xs px-1 transition-colors"
                      title="Delete list"
                    >✕</button>
                  </div>
                ))}
                {showNewTripInput ? (
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
                    <input
                      type="text"
                      value={newTripName}
                      onChange={e => setNewTripName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleCreateList(); if (e.key === "Escape") { setShowNewTripInput(false); setNewTripName(""); } }}
                      placeholder="Plan name…"
                      autoFocus
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary w-40"
                    />
                    <button onClick={handleCreateList} disabled={creatingTrip}
                      className="px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-purple-700 disabled:bg-gray-300 transition-colors">
                      {creatingTrip ? "…" : "Create"}
                    </button>
                    <button onClick={() => { setShowNewTripInput(false); setNewTripName(""); }}
                      className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:border-gray-400">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewTripInput(true)}
                    className="px-4 py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-primary hover:text-primary transition-all"
                  >
                    + New list
                  </button>
                )}
              </div>

                  {itineraries.length === 0 ? (
                    <div className="bg-white rounded-xl shadow p-16 text-center">
                      <div className="text-5xl mb-4">🗂️</div>
                      <h2 className="text-xl font-semibold text-dark mb-2">No lists yet</h2>
                      <p className="text-gray-500 mb-6">Create a wishlist, a trip, or a visited favorites list.</p>
                      <button onClick={() => setShowNewTripInput(true)}
                        className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 font-semibold">
                        Create a list
                      </button>
                    </div>
                  ) : activeId && (
                    loadingItems ? (
                      <div className="text-center py-16 text-gray-400">Loading…</div>
                    ) : items.length === 0 ? (
                      <div className="bg-white rounded-xl shadow p-12 text-center">
                        <div className="text-4xl mb-3">🍽️</div>
                        <p className="text-gray-500 mb-4">No dishes in <strong>{activeTrip?.name}</strong> yet.</p>
                        <Link href="/explore">
                          <button className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
                            Discover dishes
                          </button>
                        </Link>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Left: map + city accordion */}
                        <div className="lg:col-span-2 space-y-4">

                          {/* Map — always visible */}
                          <div className="bg-white rounded-xl shadow overflow-hidden" style={{ height: 340 }}>
                            <ItineraryMap
                              items={mapDisplayItems}
                              onPinClick={item => {
                                if (item.restaurant_id) {
                                  // restaurant-level pin: open the dish first if needed, then highlight
                                  const sourceItem = items.find(i => i.id === item.id);
                                  if (sourceItem && selectedItem?.id !== sourceItem.id) openDish(sourceItem);
                                  setSelectedRestaurantId(item.restaurant_id);
                                  document.getElementById(`restaurant-card-${item.restaurant_id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                } else {
                                  const sourceItem = items.find(i => i.id === item.id);
                                  if (sourceItem) openDish(sourceItem);
                                }
                              }}
                              selectedItem={selectedItem}
                              focusCoords={focusCoords}
                              highlightedRestaurantId={selectedRestaurantId}
                            />
                          </div>

                          {/* City accordion */}
                          <div className="space-y-3">
                            {groupByCity(items).map(group => {
                              const isExpanded = expandedCityKey === group.key;
                              return (
                                <div key={group.key} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                  {/* City header */}
                                  <button
                                    onClick={() => openCity(group.key, group.items)}
                                    className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50"}`}
                                  >
                                    <span className="text-base font-bold text-dark">📍 {group.city}, {group.country}</span>
                                    <span className="text-xs text-gray-400 font-normal">
                                      {group.items.length} dish{group.items.length !== 1 ? "es" : ""}
                                    </span>
                                    {/* dish color dots */}
                                    <div className="flex gap-1 ml-1">
                                      {group.items.map(i => (
                                        <span
                                          key={i.id}
                                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ background: getDishColorForItem(i) }}
                                        />
                                      ))}
                                    </div>
                                    <span className="ml-auto flex items-center gap-2">
                                      {loadingRestaurants && isExpanded && (
                                        <span className="text-xs text-gray-400 animate-pulse">Loading…</span>
                                      )}
                                      <span className="text-gray-400 text-xs transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}>▼</span>
                                    </span>
                                  </button>

                                  {/* Dish list — only when expanded */}
                                  {isExpanded && (
                                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                                      {group.items.map(item => {
                                        const eaten = isItemEaten(item);
                                        const isSelected = selectedItem?.id === item.id;
                                        const color = getDishColorForItem(item);
                                        return (
                                          <div
                                            key={item.id}
                                            onClick={() => openDish(item)}
                                            className={`flex cursor-pointer transition-all hover:bg-gray-50 overflow-hidden ${isSelected ? "ring-2 ring-inset ring-primary" : ""}`}
                                          >
                                            <div className="w-1 flex-shrink-0" style={{ background: eaten ? "#22c55e" : color }} />
                                            <div className="flex-1 px-4 py-3 flex items-center gap-3 min-w-0">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="font-semibold text-dark text-sm">{item.dish_name}</span>
                                                  {item.cuisine_type && (
                                                    <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{item.cuisine_type}</span>
                                                  )}
                                                  {eaten && (
                                                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">✓ Tried {item.eaten_count}×</span>
                                                  )}
                                                </div>
                                                {item.dish_description && (
                                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.dish_description}</p>
                                                )}
                                                {item.notes && (
                                                  <p className="text-xs text-amber-700 mt-0.5 italic">📝 {item.notes}</p>
                                                )}
                                                {/* mini restaurant count */}
                                                {(item.restaurant_ids || []).length > 0 && (
                                                  <p className="text-xs text-gray-400 mt-0.5">{item.restaurant_ids.length} restaurant{item.restaurant_ids.length !== 1 ? "s" : ""} saved</p>
                                                )}
                                              </div>
                                              <div className="flex-shrink-0 flex flex-col gap-1 items-end">
                                                <button
                                                  onClick={e => { e.stopPropagation(); setConfirmDeleteItemId(item.id); }}
                                                  className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1"
                                                  title="Remove from trip"
                                                >✕</button>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right: dish detail panel */}
                        <div className="lg:col-span-1">
                          {selectedItem ? (
                            <div className="bg-white rounded-xl shadow p-5 sticky top-6">
                              {/* color accent strip */}
                              <div className="h-1 rounded-full mb-4" style={{ background: getDishColorForItem(selectedItem) }} />
                              <div className="mb-4 pb-4 border-b border-gray-100">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h3 className="font-bold text-dark text-lg leading-snug">{selectedItem.dish_name}</h3>
                                  <button onClick={() => { setSelectedItem(null); setRestaurants([]); setFoundRestaurants([]); }} className="text-gray-300 hover:text-gray-500 flex-shrink-0">✕</button>
                                </div>
                                <p className="text-xs text-gray-400 mb-2">📍 {selectedItem.city_name}, {selectedItem.country}</p>
                                {selectedItem.dish_description && (
                                  <p className="text-sm text-gray-600 leading-relaxed">{selectedItem.dish_description}</p>
                                )}
                                {selectedItem.notes && (
                                  <p className="text-xs text-amber-700 mt-2 italic">📝 {selectedItem.notes}</p>
                                )}
                                {(selectedItem.tags || []).length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {selectedItem.tags.slice(0, 4).map(tag => (
                                      <span key={tag} className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs">{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-semibold text-dark">Where to eat</h4>
                                  {!rankingRestaurants && (
                                    <button onClick={() => findRestaurants(selectedItem!)} className="text-xs text-primary hover:underline">
                                      🔍 Find more
                                    </button>
                                  )}
                                </div>
                                {loadingRestaurants ? (
                                  <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
                                ) : (
                                  <div className="space-y-2">
                                    {restaurants.length === 0 && foundRestaurants.length === 0 && !rankingRestaurants && (
                                      <div className="text-center py-6 px-4">
                                        <p className="text-2xl mb-2">🍽️</p>
                                        <p className="text-sm font-medium text-dark mb-1">No restaurants saved yet</p>
                                        <p className="text-xs text-gray-400 mb-3">Use &ldquo;Find more&rdquo; above to search, or go back to Explore to discover places.</p>
                                        <Link href="/explore">
                                          <button className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-purple-700 transition-colors font-medium">
                                            Explore →
                                          </button>
                                        </Link>
                                      </div>
                                    )}
                                    {restaurants.map(r => {
                                      const eaten = isRestaurantEaten(r.id);
                                      const isHighlighted = selectedRestaurantId === r.id;
                                      return (
                                        <div
                                          key={r.id}
                                          id={`restaurant-card-${r.id}`}
                                          onClick={() => {
                                            setSelectedRestaurantId(prev => prev === r.id ? null : r.id);
                                            if (r.latitude != null && r.longitude != null) {
                                              setFocusCoords({ lat: r.latitude, lng: r.longitude });
                                            }
                                          }}
                                          className={`rounded-lg border p-3 transition-all cursor-pointer ${
                                            isHighlighted ? "border-primary ring-1 ring-primary bg-purple-50" :
                                            eaten ? "border-green-200 bg-green-50" : "border-gray-100 hover:border-primary"
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-2 mb-1">
                                            <p className="font-medium text-dark text-sm leading-snug">{r.name}</p>
                                            {r.google_rating && <span className="text-xs text-violet-600 font-semibold flex-shrink-0">★ {r.google_rating}</span>}
                                          </div>
                                          {r.address && <p className="text-xs text-gray-400 mb-1">{r.address}</p>}
                                          {r.rank_rationale && <p className="text-xs text-gray-500 italic mb-2 line-clamp-2">&ldquo;{r.rank_rationale}&rdquo;</p>}
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {eaten ? (
                                              <span className="text-xs text-green-600 font-medium">✓ You tried this</span>
                                            ) : (
                                              <button onClick={e => { e.stopPropagation(); handleMarkEaten(r); }} disabled={markingEaten.has(r.id)}
                                                className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors">
                                                {markingEaten.has(r.id) ? "Saving…" : "🍽 I ate here!"}
                                              </button>
                                            )}
                                            {(r.photo_url || (r.reviews && r.reviews.length > 0)) && (
                                              <button onClick={e => { e.stopPropagation(); setDetailRestaurant(r); }}
                                                className="text-xs px-3 py-1 border border-gray-200 text-gray-600 rounded-lg hover:border-primary hover:text-primary transition-colors">
                                                Details
                                              </button>
                                            )}
                                            {r.google_maps_url && (
                                              <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">📍 Maps</a>
                                            )}
                                            <button onClick={e => { e.stopPropagation(); handleRemoveRestaurant(selectedItem!.id, r.id); }}
                                              className="ml-auto text-xs text-red-300 hover:text-red-500 transition-colors" title="Remove from list">✕</button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {rankingRestaurants && (
                                      <div className="text-center py-4">
                                        <div className="text-2xl mb-2 animate-pulse">🌍</div>
                                        <p className="text-xs text-gray-500 mb-1">{rankingStatus}</p>
                                        <p className="text-xs text-gray-400">Usually 20–40 seconds…</p>
                                      </div>
                                    )}
                                    {foundRestaurants.length > 0 && (
                                      <>
                                        <div className="flex items-center gap-2 my-3">
                                          <div className="flex-1 h-px bg-gray-100" />
                                          <span className="text-xs text-gray-400 font-medium">Found nearby</span>
                                          <div className="flex-1 h-px bg-gray-100" />
                                        </div>
                                        {foundRestaurants.map(r => (
                                          <div key={r.id} className="rounded-lg border border-dashed border-gray-200 p-3 bg-gray-50">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                              <p className="font-medium text-dark text-sm leading-snug">{r.name}</p>
                                              {r.google_rating && <span className="text-xs text-violet-600 font-semibold flex-shrink-0">★ {r.google_rating}</span>}
                                            </div>
                                            {r.address && <p className="text-xs text-gray-400 mb-1">{r.address}</p>}
                                            {r.rank_rationale && <p className="text-xs text-gray-500 italic mb-2 line-clamp-2">&ldquo;{r.rank_rationale}&rdquo;</p>}
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <button onClick={() => handleAddFoundRestaurant(r)}
                                                className="text-xs px-3 py-1 bg-primary text-white rounded-lg hover:bg-purple-700 font-medium transition-colors">
                                                ＋ Add
                                              </button>
                                              {(r.photo_url || (r.reviews && r.reviews.length > 0)) && (
                                                <button onClick={e => { e.stopPropagation(); setDetailRestaurant(r); }}
                                                  className="text-xs px-3 py-1 border border-gray-200 text-gray-600 rounded-lg hover:border-primary hover:text-primary transition-colors">
                                                  Details
                                                </button>
                                              )}
                                              {r.google_maps_url && (
                                                <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">📍 Maps</a>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : expandedCityKey ? (
                            <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
                              <div className="text-4xl mb-3">🍽️</div>
                              <p className="text-sm">Click a dish to see restaurants</p>
                            </div>
                          ) : (
                            <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
                              <div className="text-4xl mb-3">📍</div>
                              <p className="text-sm">Click a city to expand it and see dishes</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
            </>
          )}
        </div>

        {/* ── Modals ────────────────────────────────────────────────────── */}
        {confirmDeleteItemId && (
          <ConfirmModal
            isOpen={true}
            title="Remove from list"
            message="Remove this dish from the list?"
            onConfirm={() => handleDeleteItem(confirmDeleteItemId)}
            onCancel={() => setConfirmDeleteItemId(null)}
          />
        )}
        {confirmDeleteTripId && (
          <ConfirmModal
            isOpen={true}
            title="Delete list"
            message="Delete this list and all its dishes? This cannot be undone."
            onConfirm={() => handleDeleteTrip(confirmDeleteTripId)}
            onCancel={() => setConfirmDeleteTripId(null)}
          />
        )}

        {eatenDateModal && (
          <Portal>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                <h2 className="text-lg font-bold text-dark mb-1">Log to Passport</h2>
                <p className="text-sm text-gray-500 mb-5">{eatenDateModal.label}</p>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={eatenDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setEatenDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your rating <span className="text-gray-400 font-normal">(optional)</span></label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} type="button" onClick={() => setEatenRating(s === eatenRating ? 0 : s)}
                        className={`text-2xl transition-colors ${s <= eatenRating ? "text-violet-400" : "text-gray-200 hover:text-violet-200"}`}>
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea
                    value={eatenNotes}
                    onChange={e => setEatenNotes(e.target.value)}
                    placeholder="How was it? Any highlights or tips…"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => eatenDateModal.onConfirm(eatenDate, eatenRating, eatenNotes)}
                    disabled={!eatenDate}
                    className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    ✓ Save to Passport
                  </button>
                  <button
                    onClick={() => setEatenDateModal(null)}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:border-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

      {/* Restaurant detail modal */}
      {detailRestaurant && (
        <Portal>
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 px-4" onClick={() => setDetailRestaurant(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Photo */}
              {detailRestaurant.photo_url && (
                <div className="w-full h-52 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={detailRestaurant.photo_url} alt={detailRestaurant.name} className="w-full h-full object-cover" />
                </div>
              )}

              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h2 className="text-xl font-bold text-dark leading-snug">{detailRestaurant.name}</h2>
                  <button onClick={() => setDetailRestaurant(null)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">✕</button>
                </div>
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  {detailRestaurant.google_rating && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-violet-600">
                      {"★".repeat(Math.round(detailRestaurant.google_rating))}
                      <span className="text-gray-700">{detailRestaurant.google_rating}</span>
                      {detailRestaurant.review_count && <span className="text-gray-400 font-normal text-xs">({detailRestaurant.review_count.toLocaleString()} reviews)</span>}
                    </span>
                  )}
                  {detailRestaurant.price_level && (
                    <span className="text-sm font-medium text-amber-600">{detailRestaurant.price_level}</span>
                  )}
                  {detailRestaurant.address && (
                    <span className="text-xs text-gray-400">{detailRestaurant.address}</span>
                  )}
                </div>

                {/* Rationale */}
                {detailRestaurant.rank_rationale && (
                  <p className="text-sm text-gray-600 italic mb-4">&ldquo;{detailRestaurant.rank_rationale}&rdquo;</p>
                )}

                {/* Highlights */}
                {detailRestaurant.highlights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {detailRestaurant.highlights.map((h, i) => (
                      <span key={i} className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100">{h}</span>
                    ))}
                  </div>
                )}

                {/* Reviews */}
                {detailRestaurant.reviews && detailRestaurant.reviews.length > 0 && (
                  <div className="space-y-3 mb-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What people say</p>
                    {detailRestaurant.reviews.map((rev, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-700">{rev.author}</span>
                          {rev.rating && (
                            <span className="text-violet-400 text-xs">{"★".repeat(Math.round(rev.rating))}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">{rev.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  {detailRestaurant.google_maps_url && (
                    <a href={detailRestaurant.google_maps_url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-center text-sm px-4 py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition-colors">
                      📍 Open in Maps
                    </a>
                  )}
                  <button onClick={() => setDetailRestaurant(null)}
                    className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:border-gray-300 text-sm transition-colors">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      </Layout>
    </>
  );
}
