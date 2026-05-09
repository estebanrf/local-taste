import { useState, useEffect, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import Link from "next/link";
import Head from "next/head";

const ItineraryMap = dynamic(() => import("../components/ItineraryMap"), { ssr: false });

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

  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItineraryItem | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [passportEntries, setPassportEntries] = useState<PassportEntry[]>([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [rankingRestaurants, setRankingRestaurants] = useState(false);
  const [rankingStatus, setRankingStatus] = useState("");
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmDeleteTripId, setConfirmDeleteTripId] = useState<string | null>(null);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [showNewTripInput, setShowNewTripInput] = useState(false);

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
    if (!token) return;
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
    setRestaurants([]);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/itineraries/${itineraryId}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } finally {
      setLoadingItems(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!isUserLoaded) return;
    Promise.all([loadItineraries(), loadPassport()]).then(([list]) => {
      if (list && list.length > 0) {
        setActiveId(list[0].id);
        loadItems(list[0].id);
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded]);

  const switchTrip = (id: string) => {
    setActiveId(id);
    loadItems(id);
  };

  const handleCreateTrip = async () => {
    const name = newTripName.trim();
    if (!name) { showToast("error", "Please enter a trip name"); return; }
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
      const newTrip: Itinerary = { id: created.id, name: created.name, item_count: 0, created_at: new Date().toISOString() };
      setItineraries(prev => [...prev, newTrip]);
      setNewTripName("");
      setShowNewTripInput(false);
      switchTrip(created.id);
      showToast("success", `Trip "${created.name}" created!`);
    } catch {
      showToast("error", "Failed to create trip.");
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
      showToast("success", "Trip deleted.");
    } catch {
      showToast("error", "Failed to delete trip.");
    }
  };

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

  const findRestaurants = async (item: ItineraryItem) => {
    if (!item.dish_id) return;
    setRankingRestaurants(true);
    setRankingStatus("Finding the best spots…");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/rank-restaurants`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dish_id: item.dish_id, dish_name: item.dish_name, city: item.city_name, country: item.country }),
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
            await openDish(item);
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

  const handleMarkEaten = async (restaurant: Restaurant) => {
    if (!selectedItem?.dish_id) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/passport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dish_id: selectedItem.dish_id, restaurant_id: restaurant.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("success", `Marked "${selectedItem.dish_name}" as eaten at ${restaurant.name}!`);
      await loadPassport();
      setSelectedItem(prev => prev ? { ...prev, eaten_count: (prev.eaten_count || 0) + 1 } : prev);
    } catch {
      showToast("error", "Failed to mark as eaten.");
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

  const activeTrip = itineraries.find(t => t.id === activeId);

  return (
    <>
      <Head><title>My Trips - Local Taste</title></Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-dark">🗺️ My Trips</h1>
              <p className="text-gray-600 mt-1">Plan your food adventures, trip by trip.</p>
            </div>
            <Link href="/explore">
              <button className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 font-medium transition-colors">
                + Discover dishes
              </button>
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading your trips…</div>
          ) : (
            <>
              {/* Trip tabs + new trip button */}
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {itineraries.map(trip => (
                  <div key={trip.id} className="flex items-center gap-1">
                    <button
                      onClick={() => switchTrip(trip.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeId === trip.id
                          ? "bg-primary text-white shadow-sm"
                          : "bg-white text-gray-600 border border-gray-200 hover:border-primary hover:text-primary"
                      }`}
                    >
                      {trip.name}
                      <span className={`ml-1.5 text-xs ${activeId === trip.id ? "opacity-70" : "text-gray-400"}`}>
                        ({trip.item_count})
                      </span>
                    </button>
                    <button
                      onClick={() => setConfirmDeleteTripId(trip.id)}
                      className="text-red-400 hover:text-red-600 text-xs px-1 transition-colors"
                      title="Delete trip"
                    >✕</button>
                  </div>
                ))}

                {showNewTripInput ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTripName}
                      onChange={e => setNewTripName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleCreateTrip(); if (e.key === "Escape") { setShowNewTripInput(false); setNewTripName(""); } }}
                      placeholder="Trip name…"
                      autoFocus
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary w-40"
                    />
                    <button
                      onClick={handleCreateTrip}
                      disabled={creatingTrip}
                      className="px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-purple-700 disabled:bg-gray-300 transition-colors"
                    >
                      {creatingTrip ? "…" : "Create"}
                    </button>
                    <button
                      onClick={() => { setShowNewTripInput(false); setNewTripName(""); }}
                      className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:border-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewTripInput(true)}
                    className="px-4 py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-primary hover:text-primary transition-all"
                  >
                    + New trip
                  </button>
                )}
              </div>

              {/* No trips yet */}
              {itineraries.length === 0 && (
                <div className="bg-white rounded-xl shadow p-16 text-center">
                  <div className="text-5xl mb-4">🗺️</div>
                  <h2 className="text-xl font-semibold text-dark mb-2">No trips yet</h2>
                  <p className="text-gray-500 mb-6">Create a trip and add dishes you want to try.</p>
                  <Link href="/explore">
                    <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 font-semibold">
                      Start exploring
                    </button>
                  </Link>
                </div>
              )}

              {/* Active trip content */}
              {activeId && (
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

                    {/* Left: map + list */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="bg-white rounded-xl shadow overflow-hidden" style={{ height: 320 }}>
                        <ItineraryMap items={items} onPinClick={openDish} selectedItem={selectedItem} />
                      </div>

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
                                        {item.notes && (
                                          <p className="text-xs text-amber-700 mt-0.5 italic">📝 {item.notes}</p>
                                        )}
                                      </div>
                                      <button
                                        onClick={e => { e.stopPropagation(); setConfirmDeleteItemId(item.id); }}
                                        className="flex-shrink-0 text-xs text-gray-300 hover:text-red-400 transition-colors px-2"
                                        title="Remove from trip"
                                      >✕</button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: dish detail */}
                    <div className="lg:col-span-1">
                      {selectedItem ? (
                        <div className="bg-white rounded-xl shadow p-5 sticky top-6">
                          <div className="mb-4 pb-4 border-b border-gray-100">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="font-bold text-dark text-lg leading-snug">{selectedItem.dish_name}</h3>
                              <button onClick={() => setSelectedItem(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">✕</button>
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
                              {selectedItem.dish_id && (
                                <Link href={`/explore?dish=${selectedItem.dish_id}`} className="text-xs text-primary hover:underline">
                                  Search more →
                                </Link>
                              )}
                            </div>

                            {loadingRestaurants ? (
                              <p className="text-xs text-gray-400 text-center py-4">Loading restaurants…</p>
                            ) : restaurants.length === 0 ? (
                              <div className="text-center py-6">
                                {rankingRestaurants ? (
                                  <>
                                    <div className="text-2xl mb-2 animate-pulse">🌍</div>
                                    <p className="text-xs text-gray-500 mb-1">{rankingStatus}</p>
                                    <p className="text-xs text-gray-400">Usually 20–40 seconds…</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-xs text-gray-400 mb-3">No restaurants found yet.</p>
                                    {selectedItem?.dish_id && (
                                      <button
                                        onClick={() => findRestaurants(selectedItem)}
                                        className="text-xs px-4 py-2 bg-primary text-white rounded-lg hover:bg-purple-700"
                                      >
                                        🔍 Find restaurants
                                      </button>
                                    )}
                                  </>
                                )}
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
                                        {!selectedItem?.dish_id ? (
                                          <span className="text-xs text-gray-400 italic">Discover this dish from Explore to track it</span>
                                        ) : eaten ? (
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
                                          <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
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
                )
              )}
            </>
          )}
        </div>

        {confirmDeleteItemId && (
          <ConfirmModal
            isOpen={true}
            title="Remove from trip"
            message="Remove this dish from the trip?"
            onConfirm={() => handleDeleteItem(confirmDeleteItemId)}
            onCancel={() => setConfirmDeleteItemId(null)}
          />
        )}
        {confirmDeleteTripId && (
          <ConfirmModal
            isOpen={true}
            title="Delete trip"
            message="Delete this trip and all its dishes? This cannot be undone."
            onConfirm={() => handleDeleteTrip(confirmDeleteTripId)}
            onCancel={() => setConfirmDeleteTripId(null)}
          />
        )}
      </Layout>
    </>
  );
}
