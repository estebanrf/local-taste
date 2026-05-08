import { useState, useEffect, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import Link from "next/link";
import Head from "next/head";

// Leaflet must be loaded client-side only (no SSR)
const ItineraryMap = dynamic(() => import("../components/ItineraryMap"), { ssr: false });

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
}

interface PassportEntry {
  id: string;
  dish_id: string;
  restaurant_id: string | null;
}

export default function Itinerary() {
  const { getToken } = useAuth();
  const { isLoaded: isUserLoaded } = useUser();

  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ItineraryItem | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [passportEntries, setPassportEntries] = useState<PassportEntry[]>([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const [itRes, passRes] = await Promise.all([
      fetch(`${API_URL}/api/itinerary`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/passport`,  { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (itRes.ok) {
      const data = await itRes.json();
      setItems(data.items || []);
    }
    if (passRes.ok) {
      const data = await passRes.json();
      setPassportEntries(data.entries || []);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    if (isUserLoaded) load();
  }, [isUserLoaded, load]);

  const openDish = async (item: ItineraryItem) => {
    setSelectedItem(item);
    setRestaurants([]);
    if (!item.dish_id) return;
    setLoadingRestaurants(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/dishes/${item.dish_id}/restaurants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const sorted = [...(data.restaurants || [])].sort(
          (a: Restaurant, b: Restaurant) => (b.google_rating ?? 0) - (a.google_rating ?? 0)
        );
        setRestaurants(sorted);
      }
    } catch { /* silent */ } finally {
      setLoadingRestaurants(false);
    }
  };

  const handleMarkEaten = async (restaurant: Restaurant) => {
    if (!selectedItem?.dish_id) return;
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/passport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dish_id: selectedItem.dish_id, restaurant_id: restaurant.id }),
      });
      showToast("success", `Marked "${selectedItem.dish_name}" as eaten at ${restaurant.name}!`);
      await load();
      // Refresh selected item eaten count
      setSelectedItem(prev => prev ? { ...prev, eaten_count: (prev.eaten_count || 0) + 1 } : prev);
    } catch {
      showToast("error", "Failed to mark as eaten.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/itinerary/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirmDeleteId(null);
      if (selectedItem?.id === id) setSelectedItem(null);
      showToast("success", "Removed from trip.");
      await load();
    } catch {
      showToast("error", "Failed to remove.");
    }
  };

  const groupByCity = () => {
    const groups: Record<string, { city: string; country: string; items: ItineraryItem[] }> = {};
    items.forEach(item => {
      const key = `${item.city_name}|${item.country}`;
      if (!groups[key]) groups[key] = { city: item.city_name, country: item.country, items: [] };
      groups[key].items.push(item);
    });
    return Object.values(groups);
  };


  const eatenDishIds = new Set(passportEntries.map(e => e.dish_id));
  const isRestaurantEaten = (restaurantId: string) =>
    passportEntries.some(e => e.restaurant_id === restaurantId);

  return (
    <>
      <Head><title>My Trip - Local Taste</title></Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-dark">🗺️ My Culinary Trip</h1>
              <p className="text-gray-600 mt-1">Plan your food adventures, dish by dish.</p>
            </div>
            <Link href="/explore">
              <button className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 font-medium transition-colors">
                + Discover dishes
              </button>
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading your trip…</div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-16 text-center">
              <div className="text-5xl mb-4">🗺️</div>
              <h2 className="text-xl font-semibold text-dark mb-2">Your trip is empty</h2>
              <p className="text-gray-500 mb-6">Explore cities and add dishes you want to try.</p>
              <Link href="/explore">
                <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 font-semibold">
                  Start exploring
                </button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left: map + trip list */}
              <div className="lg:col-span-2 space-y-6">

                {/* Map */}
                <div className="bg-white rounded-xl shadow overflow-hidden" style={{ height: 320 }}>
                  <ItineraryMap items={items} onPinClick={openDish} selectedItem={selectedItem} />
                </div>

                {/* Trip list grouped by city */}
                <div className="space-y-6">
                  {groupByCity().map(group => (
                    <div key={`${group.city}|${group.country}`}>
                      <h2 className="text-lg font-bold text-dark mb-3 flex items-center gap-2">
                        📍 {group.city}, {group.country}
                        <span className="text-sm font-normal text-gray-400">
                          {group.items.length} dish{group.items.length !== 1 ? "es" : ""}
                        </span>
                      </h2>
                      <div className="space-y-2">
                        {group.items.map(item => {
                          const eaten = eatenDishIds.has(item.dish_id ?? "");
                          const isSelected = selectedItem?.id === item.id;
                          return (
                            <div
                              key={item.id}
                              onClick={() => openDish(item)}
                              className={`bg-white rounded-xl shadow-sm border cursor-pointer transition-all hover:shadow-md flex overflow-hidden ${
                                isSelected ? "ring-2 ring-primary" : "border-gray-100"
                              }`}
                            >
                              <div className={`w-1.5 flex-shrink-0 ${eaten ? "bg-green-400" : "bg-amber-300"}`} />
                              <div className="flex-1 px-4 py-3 flex items-center gap-3 min-w-0">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-dark text-sm">{item.dish_name}</span>
                                    {item.cuisine_type && (
                                      <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{item.cuisine_type}</span>
                                    )}
                                    {eaten && (
                                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                        ✓ Tried {item.eaten_count}×
                                      </span>
                                    )}
                                  </div>
                                  {item.dish_description && (
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.dish_description}</p>
                                  )}
                                </div>
                                <button
                                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(item.id); }}
                                  className="flex-shrink-0 text-xs text-gray-300 hover:text-red-400 transition-colors px-2"
                                  title="Remove from trip"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: dish detail drawer */}
              <div className="lg:col-span-1">
                {selectedItem ? (
                  <div className="bg-white rounded-xl shadow p-5 sticky top-6">
                    {/* Dish header */}
                    <div className="mb-4 pb-4 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-dark text-lg leading-snug">{selectedItem.dish_name}</h3>
                        <button onClick={() => setSelectedItem(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">✕</button>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">📍 {selectedItem.city_name}, {selectedItem.country}</p>
                      {selectedItem.dish_description && (
                        <p className="text-sm text-gray-600 leading-relaxed">{selectedItem.dish_description}</p>
                      )}
                      {(selectedItem.tags || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedItem.tags.slice(0, 4).map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Restaurants */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-dark">Where to eat</h4>
                        {selectedItem.dish_id && (
                          <Link
                            href={`/explore?dish=${selectedItem.dish_id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            Search more →
                          </Link>
                        )}
                      </div>

                      {loadingRestaurants ? (
                        <p className="text-xs text-gray-400 text-center py-4">Loading restaurants…</p>
                      ) : restaurants.length === 0 ? (
                        <div className="text-center py-6">
                          <p className="text-xs text-gray-400 mb-3">No restaurants cached yet.</p>
                          <Link href="/explore">
                            <button className="text-xs px-4 py-2 bg-primary text-white rounded-lg hover:bg-purple-700">
                              Find restaurants
                            </button>
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {restaurants.map(r => {
                            const eaten = isRestaurantEaten(r.id);
                            return (
                              <div key={r.id} className={`rounded-lg border p-3 transition-all ${eaten ? "border-green-200 bg-green-50" : "border-gray-100 hover:border-primary"}`}>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="font-medium text-dark text-sm leading-snug">{r.name}</p>
                                  {r.google_rating && (
                                    <span className="text-xs text-violet-600 font-semibold flex-shrink-0">★ {r.google_rating}</span>
                                  )}
                                </div>
                                {r.address && <p className="text-xs text-gray-400 mb-1">{r.address}</p>}
                                {r.rank_rationale && (
                                  <p className="text-xs text-gray-500 italic mb-2 line-clamp-2">&ldquo;{r.rank_rationale}&rdquo;</p>
                                )}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {eaten ? (
                                    <span className="text-xs text-green-600 font-medium">✓ You tried this</span>
                                  ) : (
                                    <button
                                      onClick={() => handleMarkEaten(r)}
                                      className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                                    >
                                      ✓ Mark as eaten
                                    </button>
                                  )}
                                  {r.google_maps_url && (
                                    <a
                                      href={r.google_maps_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:underline"
                                    >
                                      📍 Maps
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
                    <div className="text-4xl mb-3">👆</div>
                    <p className="text-sm">Click a dish to see restaurants and mark what you&apos;ve tried</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {confirmDeleteId && (
          <ConfirmModal
            isOpen={true}
            title="Remove from trip"
            message="Remove this dish from your trip plan?"
            onConfirm={() => handleDelete(confirmDeleteId)}
            onCancel={() => setConfirmDeleteId(null)}
          />
        )}
      </Layout>
    </>
  );
}
