import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import Link from "next/link";
import Head from "next/head";
import { DIETARY_OPTIONS, parseDietaryPrefs } from "../lib/dietary";

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
}

interface WishlistItem {
  id: string;
  dish_id: string | null;
  dish_name: string;
  city_name: string;
  country: string;
  notes: string | null;
  cuisine_type: string | null;
  dish_description: string | null;
  tags: string[];
  created_at: string;
}

interface PassportEntry {
  id: string;
  dish_id: string;
  dish_name: string;
  city_name: string;
  country: string;
  cuisine_type: string | null;
  dish_rank: number;
  tasted_at: string;
  rating: number | null;
  notes: string | null;
  restaurant_name: string | null;
  restaurant_id: string | null;
}

interface Stats {
  total_dishes: number;
  cities_visited: number;
  cuisine_types: number;
  avg_rating: number | null;
}


export default function Passport() {
  const { getToken } = useAuth();
  const { isLoaded: isUserLoaded } = useUser();
  const [entries, setEntries] = useState<PassportEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState<number>(0);
  const [editNotes, setEditNotes] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [confirmDeleteWishlistId, setConfirmDeleteWishlistId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"passport" | "wishlist">("passport");
  const [selectedWishlistItem, setSelectedWishlistItem] = useState<WishlistItem | null>(null);
  const [wishlistRestaurants, setWishlistRestaurants] = useState<Restaurant[]>([]);
  const [loadingWishlistRestaurants, setLoadingWishlistRestaurants] = useState(false);
  const [rankingWishlistRestaurants, setRankingWishlistRestaurants] = useState(false);
  const [rankingWishlistStatus, setRankingWishlistStatus] = useState("");
  const [markingEaten, setMarkingEaten] = useState(false);

  const load = async () => {
    try {
      const token = await getToken();
      const [passportRes, userRes, wishlistRes] = await Promise.all([
        fetch(`${API_URL}/api/passport`,  { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/user`,      { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/wishlist`,  { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (passportRes.ok) {
        const data = await passportRes.json();
        setEntries(data.entries || []);
        setStats(data.stats);
      }
      if (userRes.ok) {
        const userData = await userRes.json();
        const u = userData.user;
        setDietaryPrefs(parseDietaryPrefs(u?.dietary_notes));
        setDisplayName(u?.display_name || "");
        setHomeCity(u?.home_city || "");
      }
      if (wishlistRes.ok) {
        const data = await wishlistRes.json();
        setWishlistItems(data.items || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isUserLoaded) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && isUserLoaded) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded]);

  const toggleDietaryPref = async (id: string) => {
    const next = dietaryPrefs.includes(id)
      ? dietaryPrefs.filter(p => p !== id)
      : [...dietaryPrefs, id];
    setDietaryPrefs(next);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/user`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dietary_notes: JSON.stringify(next) }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("success", "Preferences saved");
    } catch {
      setDietaryPrefs(dietaryPrefs); // roll back optimistic update
      showToast("error", "Failed to save preferences.");
    }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      showToast("error", "Display name is required");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/user`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim(), home_city: homeCity || null, dietary_notes: JSON.stringify(dietaryPrefs) }),
      });
      if (!res.ok) throw new Error("Failed to save");
      showToast("success", "Profile saved!");
    } catch {
      showToast("error", "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWishlistItem = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/wishlist/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setConfirmDeleteWishlistId(null);
      setWishlistItems(prev => prev.filter(i => i.id !== id));
      showToast("success", "Removed from wishlist.");
    } catch {
      showToast("error", "Failed to remove.");
    }
  };

  const openWishlistItem = async (item: WishlistItem) => {
    setSelectedWishlistItem(item);
    setWishlistRestaurants([]);
    setRankingWishlistRestaurants(false);
    setRankingWishlistStatus("");
    if (!item.dish_id) return;
    setLoadingWishlistRestaurants(true);
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
        setWishlistRestaurants(sorted);
      }
    } catch { /* silent */ } finally {
      setLoadingWishlistRestaurants(false);
    }
  };

  const findWishlistRestaurants = async (item: WishlistItem) => {
    setRankingWishlistRestaurants(true);
    setRankingWishlistStatus("Finding the best spots…");
    try {
      const token = await getToken();
      const endpoint = item.dish_id ? "/api/rank-restaurants" : "/api/rank-by-category";
      const body = item.dish_id
        ? { dish_id: item.dish_id, dish_name: item.dish_name, city: item.city_name, country: item.country }
        : { category: item.dish_name, city: item.city_name, country: item.country };
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
            setRankingWishlistRestaurants(false);
            setRankingWishlistStatus("");
            if (item.dish_id) {
              await openWishlistItem(item);
            } else {
              const rPayload = (job.restaurants_payload as Record<string, unknown>) || {};
              const rList = (rPayload.restaurants as Restaurant[]) || [];
              setWishlistRestaurants([...rList].sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0)));
            }
          } else if (job.status === "failed") {
            clearInterval(interval);
            setRankingWishlistRestaurants(false);
            setRankingWishlistStatus("");
            showToast("error", "Failed to find restaurants.");
          } else {
            setRankingWishlistStatus("Searching local reviews…");
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch {
      setRankingWishlistRestaurants(false);
      setRankingWishlistStatus("");
      showToast("error", "Failed to start restaurant search.");
    }
  };

  const handleMarkEaten = async (restaurant: Restaurant) => {
    if (!selectedWishlistItem?.dish_id || markingEaten) return;
    setMarkingEaten(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/passport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dish_id: selectedWishlistItem.dish_id, restaurant_id: restaurant.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("success", `"${selectedWishlistItem.dish_name}" added to your passport!`);
      await load();
    } catch {
      showToast("error", "Failed to mark as eaten.");
    } finally {
      setMarkingEaten(false);
    }
  };

  const startEdit = (entry: PassportEntry) => {
    setEditingId(entry.id);
    setEditRating(entry.rating || 0);
    setEditNotes(entry.notes || "");
  };

  const saveEdit = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/passport/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rating: editRating || null, notes: editNotes || null }),
      });
      setEditingId(null);
      showToast("success", "Updated!");
      await load();
    } catch {
      showToast("error", "Failed to save.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/passport/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirmDeleteId(null);
      showToast("success", "Removed from passport.");
      await load();
    } catch {
      showToast("error", "Failed to delete.");
    }
  };

  const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s === value ? 0 : s)}
          className={`text-2xl transition-colors ${s <= value ? "text-violet-400" : "text-gray-200 hover:text-violet-200"}`}
        >
          ★
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Head><title>My Food Passport - Local Taste</title></Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-dark">🛂 My Food Passport</h1>
              <p className="text-gray-600 mt-1">Your culinary adventures, logged for life.</p>
            </div>
            <Link href="/explore">
              <button className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 font-medium transition-colors">
                + Explore More
              </button>
            </Link>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow p-5 text-center">
                <p className="text-3xl font-bold text-primary">{stats.total_dishes}</p>
                <p className="text-sm text-gray-500">Dishes Tried</p>
              </div>
              <div className="bg-white rounded-lg shadow p-5 text-center">
                <p className="text-3xl font-bold text-dark">{stats.cities_visited}</p>
                <p className="text-sm text-gray-500">Cities</p>
              </div>
              <div className="bg-white rounded-lg shadow p-5 text-center">
                <p className="text-3xl font-bold text-dark">{stats.cuisine_types}</p>
                <p className="text-sm text-gray-500">Cuisine Types</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab("passport")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "passport" ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
              }`}
            >
              🛂 Food Passport {stats ? `(${stats.total_dishes})` : ""}
            </button>
            <button
              onClick={() => setActiveTab("wishlist")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "wishlist" ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
              }`}
            >
              ⭐ Wishlist {wishlistItems.length > 0 ? `(${wishlistItems.length})` : ""}
            </button>
          </div>

          {activeTab === "wishlist" && (
            <div className="mb-8">
              {wishlistItems.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <div className="text-5xl mb-4">⭐</div>
                  <h2 className="text-xl font-semibold text-dark mb-2">Your wishlist is empty</h2>
                  <p className="text-gray-500 mb-6">Save dishes from Explore to try later.</p>
                  <Link href="/explore">
                    <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 font-semibold">
                      Explore a City
                    </button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: dish list */}
                  <div className="lg:col-span-2 space-y-2">
                    {wishlistItems.map(item => {
                      const isSelected = selectedWishlistItem?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => openWishlistItem(item)}
                          className={`bg-white rounded-xl shadow-sm border cursor-pointer transition-all hover:shadow-md flex overflow-hidden ${
                            isSelected ? "ring-2 ring-primary border-transparent" : "border-gray-100"
                          }`}
                        >
                          <div className="w-1.5 flex-shrink-0 bg-amber-300" />
                          <div className="flex-1 px-4 py-3 flex items-center gap-3 min-w-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-dark text-sm">{item.dish_name}</span>
                                {item.cuisine_type && (
                                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{item.cuisine_type}</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">📍 {item.city_name}, {item.country}</p>
                              {item.dish_description && (
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.dish_description}</p>
                              )}
                              {item.notes && (
                                <p className="text-xs text-amber-700 mt-0.5 italic">📝 {item.notes}</p>
                              )}
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmDeleteWishlistId(item.id); }}
                              className="flex-shrink-0 text-xs text-red-300 hover:text-red-500 transition-colors px-2"
                              title="Remove from wishlist"
                            >✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: restaurant panel */}
                  <div className="lg:col-span-1">
                    {selectedWishlistItem ? (
                      <div className="bg-white rounded-xl shadow p-5 sticky top-6">
                        <div className="mb-4 pb-4 border-b border-gray-100">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-bold text-dark text-lg leading-snug">{selectedWishlistItem.dish_name}</h3>
                            <button onClick={() => setSelectedWishlistItem(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">✕</button>
                          </div>
                          <p className="text-xs text-gray-400 mb-2">📍 {selectedWishlistItem.city_name}, {selectedWishlistItem.country}</p>
                          {selectedWishlistItem.dish_description && (
                            <p className="text-sm text-gray-600 leading-relaxed">{selectedWishlistItem.dish_description}</p>
                          )}
                          {selectedWishlistItem.notes && (
                            <p className="text-xs text-amber-700 mt-2 italic">📝 {selectedWishlistItem.notes}</p>
                          )}
                          {(selectedWishlistItem.tags || []).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {selectedWishlistItem.tags.slice(0, 4).map(tag => (
                                <span key={tag} className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>

                        <h4 className="text-sm font-semibold text-dark mb-3">Where to eat</h4>
                        {!selectedWishlistItem.dish_id ? (
                          <div className="text-center py-6">
                            {rankingWishlistRestaurants ? (
                              <>
                                <div className="text-2xl mb-2 animate-pulse">🌍</div>
                                <p className="text-xs text-gray-500 mb-1">{rankingWishlistStatus}</p>
                                <p className="text-xs text-gray-400">Usually 20–40 seconds…</p>
                              </>
                            ) : wishlistRestaurants.length > 0 ? null : (
                              <>
                                <p className="text-xs text-gray-400 mb-3">No restaurants found yet.</p>
                                <button
                                  onClick={() => findWishlistRestaurants(selectedWishlistItem!)}
                                  className="text-xs px-4 py-2 bg-primary text-white rounded-lg hover:bg-purple-700"
                                >
                                  🔍 Find restaurants
                                </button>
                              </>
                            )}
                            {wishlistRestaurants.length > 0 && (
                              <div className="space-y-3 text-left">
                                {wishlistRestaurants.map(r => {
                                  const alreadyEaten = entries.some(e => e.restaurant_id === r.id);
                                  return (
                                    <div key={r.id} className={`rounded-lg border p-3 transition-all ${alreadyEaten ? "border-green-200 bg-green-50" : "border-gray-100 hover:border-primary"}`}>
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
                                        {alreadyEaten ? (
                                          <span className="text-xs text-green-600 font-medium">✓ You tried this</span>
                                        ) : selectedWishlistItem?.dish_id ? (
                                          <button
                                            onClick={() => handleMarkEaten(r)}
                                            disabled={markingEaten}
                                            className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
                                          >
                                            {markingEaten ? "Saving…" : "✓ Mark as eaten"}
                                          </button>
                                        ) : null}
                                        {r.google_maps_url && (
                                          <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer"
                                            className="text-xs text-blue-600 hover:underline">
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
                        ) : loadingWishlistRestaurants ? (
                          <p className="text-xs text-gray-400 text-center py-4">Loading restaurants…</p>
                        ) : wishlistRestaurants.length === 0 ? (
                          <div className="text-center py-6">
                            {rankingWishlistRestaurants ? (
                              <>
                                <div className="text-2xl mb-2 animate-pulse">🌍</div>
                                <p className="text-xs text-gray-500 mb-1">{rankingWishlistStatus}</p>
                                <p className="text-xs text-gray-400">Usually 20–40 seconds…</p>
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-gray-400 mb-3">No restaurants found yet.</p>
                                <button
                                  onClick={() => findWishlistRestaurants(selectedWishlistItem!)}
                                  className="text-xs px-4 py-2 bg-primary text-white rounded-lg hover:bg-purple-700"
                                >
                                  🔍 Find restaurants
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {wishlistRestaurants.map(r => {
                              const alreadyEaten = entries.some(e => e.restaurant_id === r.id);
                              return (
                                <div key={r.id} className={`rounded-lg border p-3 transition-all ${alreadyEaten ? "border-green-200 bg-green-50" : "border-gray-100 hover:border-primary"}`}>
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
                                    {alreadyEaten ? (
                                      <span className="text-xs text-green-600 font-medium">✓ You tried this</span>
                                    ) : (
                                      <button
                                        onClick={() => handleMarkEaten(r)}
                                        disabled={markingEaten}
                                        className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
                                      >
                                        {markingEaten ? "Saving…" : "✓ Mark as eaten"}
                                      </button>
                                    )}
                                    {r.google_maps_url && (
                                      <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:underline">
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
                    ) : (
                      <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
                        <div className="text-4xl mb-3">👆</div>
                        <p className="text-sm">Click a dish to see where to eat it</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "passport" && (
          <>
          {/* Profile */}
          <div className="bg-white rounded-xl shadow p-6 mb-8">
            <h2 className="text-lg font-bold text-dark mb-4">Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Home City</label>
                <input
                  type="text"
                  value={homeCity}
                  onChange={(e) => setHomeCity(e.target.value)}
                  placeholder="e.g. Barcelona, Spain"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors text-sm"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>

          {/* Dietary preferences */}
          <div className="bg-white rounded-xl shadow p-6 mb-8">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-dark">Your dietary preferences</h2>
              <p className="text-sm text-gray-500 mt-0.5">We&apos;ll use these to surface better restaurant options when you search.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DIETARY_OPTIONS.map(opt => {
                const active = dietaryPrefs.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleDietaryPref(opt.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      active
                        ? "border-primary bg-purple-50 text-primary"
                        : "border-gray-200 text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-lg">{opt.emoji}</span>
                    <span>{opt.label}</span>
                    {active && <span className="ml-auto text-primary text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading your passport…</div>
          ) : entries.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-16 text-center">
              <div className="text-5xl mb-4">🍽️</div>
              <h2 className="text-xl font-semibold text-dark mb-2">Your passport is empty</h2>
              <p className="text-gray-500 mb-6">Start exploring cities and log the dishes you try.</p>
              <Link href="/explore">
                <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 font-semibold">
                  Explore a City
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="bg-white rounded-lg shadow p-4">
                  {editingId === entry.id ? (
                    <div>
                      <p className="font-semibold text-dark mb-1">{entry.dish_name}</p>
                      <p className="text-xs text-gray-400 mb-3">📍 {entry.city_name}, {entry.country}</p>
                      <div className="mb-3">
                        <label className="text-sm text-gray-600 mb-1 block">Your rating</label>
                        <StarRating value={editRating} onChange={setEditRating} />
                      </div>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notes, memories, recommendations…"
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(entry.id)}
                          className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-purple-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:border-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <h3 className="font-semibold text-dark">
                            {entry.dish_name} <span className="font-normal text-gray-500">in</span> {entry.city_name}, {entry.country}
                          </h3>
                        </div>
                        {entry.cuisine_type && (
                          <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs mb-1">{entry.cuisine_type}</span>
                        )}
                        {entry.restaurant_name && (
                          <p className="text-sm text-gray-500">at {entry.restaurant_name}</p>
                        )}
                        {entry.rating && (
                          <p className="text-violet-400 mt-1">{"★".repeat(entry.rating)}{"☆".repeat(5 - entry.rating)}</p>
                        )}
                        {entry.notes && (
                          <p className="text-sm text-gray-600 mt-1 italic">&ldquo;{entry.notes}&rdquo;</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(entry.tasted_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => startEdit(entry)}
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:border-primary hover:text-primary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="text-xs px-3 py-1.5 border border-red-200 text-red-400 rounded-lg hover:border-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </div>

        {confirmDeleteId && (
          <ConfirmModal
            isOpen={true}
            title="Remove from Passport"
            message="Remove this dish from your passport?"
            onConfirm={() => handleDelete(confirmDeleteId)}
            onCancel={() => setConfirmDeleteId(null)}
          />
        )}
        {confirmDeleteWishlistId && (
          <ConfirmModal
            isOpen={true}
            title="Remove from Wishlist"
            message="Remove this dish from your wishlist?"
            onConfirm={() => handleDeleteWishlistItem(confirmDeleteWishlistId)}
            onCancel={() => setConfirmDeleteWishlistId(null)}
          />
        )}
      </Layout>
    </>
  );
}
