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
  restaurant_ids: string[];
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
  const [foundWishlistRestaurants, setFoundWishlistRestaurants] = useState<Restaurant[]>([]);
  const [loadingWishlistRestaurants, setLoadingWishlistRestaurants] = useState(false);
  const [rankingWishlistRestaurants, setRankingWishlistRestaurants] = useState(false);
  const [rankingWishlistStatus, setRankingWishlistStatus] = useState("");
  const [markingEaten, setMarkingEaten] = useState(false);
  const [itineraries, setItineraries] = useState<{id: string; name: string}[]>([]);
  const [tripModal, setTripModal] = useState<WishlistItem | null>(null);
  const [selectedItineraryIds, setSelectedItineraryIds] = useState<string[]>([]);
  const [newTripName, setNewTripName] = useState("");
  const [addingToTrip, setAddingToTrip] = useState(false);
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const token = await getToken();
      const [passportRes, userRes, wishlistRes, itinerariesRes] = await Promise.all([
        fetch(`${API_URL}/api/passport`,     { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/user`,         { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/wishlist`,     { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/itineraries`,  { headers: { Authorization: `Bearer ${token}` } }),
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
      if (itinerariesRes.ok) {
        const data = await itinerariesRes.json();
        setItineraries(data.itineraries || []);
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

  const fetchRestaurants = async (token: string, dishId: string | null | undefined, savedIds: string[]): Promise<Restaurant[]> => {
    let all: Restaurant[] = [];
    if (dishId) {
      const res = await fetch(`${API_URL}/api/dishes/${dishId}/restaurants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) all = (await res.json()).restaurants || [];
    } else if (savedIds.length > 0) {
      const res = await fetch(`${API_URL}/api/restaurants/by-ids`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: savedIds }),
      });
      if (res.ok) all = (await res.json()).restaurants || [];
    }
    const filtered = savedIds.length > 0 ? all.filter(r => savedIds.includes(r.id)) : all;
    return [...filtered].sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0));
  };

  const openWishlistItem = async (item: WishlistItem) => {
    setSelectedWishlistItem(item);
    setWishlistRestaurants([]);
    setFoundWishlistRestaurants([]);
    setRankingWishlistRestaurants(false);
    setRankingWishlistStatus("");
    const savedIds = item.restaurant_ids || [];
    if (!item.dish_id && savedIds.length === 0) return;
    setLoadingWishlistRestaurants(true);
    try {
      const token = (await getToken()) ?? "";
      setWishlistRestaurants(await fetchRestaurants(token, item.dish_id, savedIds));
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
            const rPayload = (job.restaurants_payload as Record<string, unknown>) || {};
            const rList = (rPayload.restaurants as Restaurant[]) || [];
            // For dish items, fetch fresh saved list; for category items results are in payload
            if (item.dish_id) {
              const t2 = await getToken();
              const saved = await fetchRestaurants(t2 ?? "", item.dish_id, item.restaurant_ids || []);
              setWishlistRestaurants(saved);
              const savedIds = new Set(saved.map(r => r.id));
              setFoundWishlistRestaurants(rList.filter(r => !savedIds.has(r.id)).sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0)));
            } else {
              const savedIds = new Set(wishlistRestaurants.map(r => r.id));
              setFoundWishlistRestaurants(rList.filter(r => !savedIds.has(r.id)).sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0)));
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

  const postPassport = async (dishId: string, restaurantId?: string): Promise<boolean> => {
    try {
      const token = await getToken();
      const body: Record<string, string> = { dish_id: dishId };
      if (restaurantId) body.restaurant_id = restaurantId;
      const res = await fetch(`${API_URL}/api/passport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleMarkDishEaten = async (item: WishlistItem) => {
    if (!item.dish_id || markingEaten) return;
    setMarkingEaten(true);
    const ok = await postPassport(item.dish_id);
    if (ok) {
      showToast("success", `"${item.dish_name}" added to your passport!`);
      await load();
    } else {
      showToast("error", "Failed to mark as eaten.");
    }
    setMarkingEaten(false);
  };

  const handleRemoveRestaurant = async (wishlistItemId: string, restaurantId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/wishlist/${wishlistItemId}/restaurants/${restaurantId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setWishlistRestaurants(prev => prev.filter(r => r.id !== restaurantId));
      // Also update the selectedWishlistItem so restaurant_ids reflects the removal
      setSelectedWishlistItem(prev => prev ? { ...prev, restaurant_ids: prev.restaurant_ids.filter(id => id !== restaurantId) } : prev);
      setWishlistItems(prev => prev.map(i => i.id === wishlistItemId ? { ...i, restaurant_ids: i.restaurant_ids.filter(id => id !== restaurantId) } : i));
    } catch {
      showToast("error", "Failed to remove restaurant.");
    }
  };

  const handleAddFoundRestaurant = async (restaurant: Restaurant) => {
    if (!selectedWishlistItem) return;
    try {
      const token = await getToken();
      const body = selectedWishlistItem.dish_id
        ? { dish_id: selectedWishlistItem.dish_id, restaurant_id: restaurant.id }
        : { dish_name: selectedWishlistItem.dish_name, city_name: selectedWishlistItem.city_name, country: selectedWishlistItem.country, restaurant_id: restaurant.id };
      const res = await fetch(`${API_URL}/api/wishlist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      // Move from found → saved in UI
      setFoundWishlistRestaurants(prev => prev.filter(r => r.id !== restaurant.id));
      setWishlistRestaurants(prev => [...prev, restaurant]);
      setSelectedWishlistItem(prev => prev ? { ...prev, restaurant_ids: [...prev.restaurant_ids, restaurant.id] } : prev);
      setWishlistItems(prev => prev.map(i => i.id === selectedWishlistItem.id ? { ...i, restaurant_ids: [...i.restaurant_ids, restaurant.id] } : i));
    } catch {
      showToast("error", "Failed to add restaurant.");
    }
  };

  const handleMarkEaten = async (restaurant: Restaurant) => {
    if (!selectedWishlistItem?.dish_id || markingEaten) return;
    setMarkingEaten(true);
    const ok = await postPassport(selectedWishlistItem.dish_id, restaurant.id);
    if (ok) {
      showToast("success", `"${selectedWishlistItem.dish_name}" added to your passport!`);
      await load();
    } else {
      showToast("error", "Failed to mark as eaten.");
    }
    setMarkingEaten(false);
  };

  const handleAddToTrip = async () => {
    if (!tripModal) return;
    const hasNew = newTripName.trim().length > 0;
    if (selectedItineraryIds.length === 0 && !hasNew) return;
    setAddingToTrip(true);
    try {
      const token = await getToken();
      const targetIds = [...selectedItineraryIds];

      if (hasNew) {
        const res = await fetch(`${API_URL}/api/itineraries`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: newTripName.trim() }),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        targetIds.push(created.id);
        setItineraries(prev => [...prev, { id: created.id, name: created.name }]);
      }

      const body = tripModal.dish_id
        ? { dish_id: tripModal.dish_id }
        : { dish_name: tripModal.dish_name, city_name: tripModal.city_name, country: tripModal.country };

      await Promise.all(targetIds.map(id =>
        fetch(`${API_URL}/api/itineraries/${id}/items`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ));

      const names = [
        ...selectedItineraryIds.map(id => itineraries.find(t => t.id === id)?.name ?? id),
        ...(hasNew ? [newTripName.trim()] : []),
      ].join(", ");
      showToast("success", `"${tripModal.dish_name}" added to ${names}!`);
      setTripModal(null);
      setSelectedItineraryIds([]);
      setNewTripName("");
    } catch {
      showToast("error", "Failed to add to trip.");
    } finally {
      setAddingToTrip(false);
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
                  {/* Left: dish list grouped by city */}
                  <div className="lg:col-span-2 space-y-4">
                    {(() => {
                      // Group items by "City, Country"
                      const groups: { key: string; city: string; country: string; items: WishlistItem[] }[] = [];
                      wishlistItems.forEach(item => {
                        const key = `${item.city_name}||${item.country}`;
                        const existing = groups.find(g => g.key === key);
                        if (existing) existing.items.push(item);
                        else groups.push({ key, city: item.city_name, country: item.country, items: [item] });
                      });
                      return groups.map(group => {
                        const isCollapsed = collapsedCities.has(group.key);
                        const eatenInGroup = group.items.filter(i => i.dish_id && entries.some(e => e.dish_id === i.dish_id)).length;
                        return (
                          <div key={group.key}>
                            {/* City header */}
                            <button
                              onClick={() => setCollapsedCities(prev => {
                                const next = new Set(prev);
                                next.has(group.key) ? next.delete(group.key) : next.add(group.key);
                                return next;
                              })}
                              className="w-full flex items-center gap-3 px-1 py-2 text-left group"
                            >
                              <span className="text-base font-bold text-dark">📍 {group.city}, {group.country}</span>
                              <span className="text-xs text-gray-400 font-normal">
                                {group.items.length} dish{group.items.length !== 1 ? "es" : ""}
                                {eatenInGroup > 0 && ` · ${eatenInGroup} tried`}
                              </span>
                              <span className="ml-auto text-gray-400 text-xs group-hover:text-gray-600 transition-colors">
                                {isCollapsed ? "▶" : "▼"}
                              </span>
                            </button>

                            {!isCollapsed && (
                              <div className="space-y-2">
                                {group.items.map(item => {
                                  const isSelected = selectedWishlistItem?.id === item.id;
                                  const alreadyEaten = item.dish_id ? entries.some(e => e.dish_id === item.dish_id) : false;
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={() => openWishlistItem(item)}
                                      className={`bg-white rounded-xl shadow-sm border cursor-pointer transition-all hover:shadow-md flex overflow-hidden ${
                                        isSelected ? "ring-2 ring-primary border-transparent" : "border-gray-100"
                                      }`}
                                    >
                                      <div className={`w-1.5 flex-shrink-0 ${alreadyEaten ? "bg-green-400" : "bg-amber-300"}`} />
                                      <div className="flex-1 px-4 py-3 flex items-center gap-3 min-w-0">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-dark text-sm">{item.dish_name}</span>
                                            {item.cuisine_type && (
                                              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{item.cuisine_type}</span>
                                            )}
                                            {alreadyEaten && (
                                              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">✓ In passport</span>
                                            )}
                                          </div>
                                          {item.dish_description && (
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.dish_description}</p>
                                          )}
                                          {item.notes && (
                                            <p className="text-xs text-amber-700 mt-0.5 italic">📝 {item.notes}</p>
                                          )}
                                        </div>
                                        <div className="flex-shrink-0 flex flex-col gap-1 items-end">
                                          {item.dish_id && !alreadyEaten && (
                                            <button
                                              onClick={e => { e.stopPropagation(); handleMarkDishEaten(item); }}
                                              disabled={markingEaten}
                                              className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors whitespace-nowrap"
                                            >
                                              ✓ Eaten
                                            </button>
                                          )}
                                          <button
                                            onClick={e => { e.stopPropagation(); setSelectedItineraryIds([]); setNewTripName(""); setTripModal(item); }}
                                            className="text-xs px-2.5 py-1 border border-gray-200 text-gray-500 rounded-lg hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
                                          >
                                            🗺️ Trip
                                          </button>
                                          <button
                                            onClick={e => { e.stopPropagation(); setConfirmDeleteWishlistId(item.id); }}
                                            className="text-xs text-red-300 hover:text-red-500 transition-colors px-1"
                                            title="Remove from wishlist"
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
                      });
                    })()}
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

                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-dark">Where to eat</h4>
                          {!rankingWishlistRestaurants && (
                            <button
                              onClick={() => findWishlistRestaurants(selectedWishlistItem!)}
                              className="text-xs text-primary hover:underline"
                            >🔍 Find more</button>
                          )}
                        </div>

                        {loadingWishlistRestaurants ? (
                          <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
                        ) : (
                          <div className="space-y-2">
                            {/* Saved restaurants */}
                            {wishlistRestaurants.length === 0 && foundWishlistRestaurants.length === 0 && !rankingWishlistRestaurants && (
                              <p className="text-xs text-gray-400 text-center py-4">No restaurants saved yet. Click &ldquo;Find more&rdquo; to search.</p>
                            )}
                            {wishlistRestaurants.map(r => {
                              const alreadyEaten = entries.some(e => e.restaurant_id === r.id);
                              return (
                                <div key={r.id} className={`rounded-lg border p-3 transition-all ${alreadyEaten ? "border-green-200 bg-green-50" : "border-gray-100 hover:border-primary"}`}>
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <p className="font-medium text-dark text-sm leading-snug">{r.name}</p>
                                    {r.google_rating && <span className="text-xs text-violet-600 font-semibold flex-shrink-0">★ {r.google_rating}</span>}
                                  </div>
                                  {r.address && <p className="text-xs text-gray-400 mb-1">{r.address}</p>}
                                  {r.rank_rationale && <p className="text-xs text-gray-500 italic mb-2 line-clamp-2">&ldquo;{r.rank_rationale}&rdquo;</p>}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {alreadyEaten ? (
                                      <span className="text-xs text-green-600 font-medium">✓ You tried this</span>
                                    ) : selectedWishlistItem?.dish_id ? (
                                      <button onClick={() => handleMarkEaten(r)} disabled={markingEaten}
                                        className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors">
                                        {markingEaten ? "Saving…" : "✓ Already Been"}
                                      </button>
                                    ) : null}
                                    {r.google_maps_url && (
                                      <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">📍 Maps</a>
                                    )}
                                    <button onClick={() => handleRemoveRestaurant(selectedWishlistItem!.id, r.id)}
                                      className="ml-auto text-xs text-red-300 hover:text-red-500 transition-colors" title="Remove from list">✕</button>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Ranking in progress */}
                            {rankingWishlistRestaurants && (
                              <div className="text-center py-4">
                                <div className="text-2xl mb-2 animate-pulse">🌍</div>
                                <p className="text-xs text-gray-500 mb-1">{rankingWishlistStatus}</p>
                                <p className="text-xs text-gray-400">Usually 20–40 seconds…</p>
                              </div>
                            )}

                            {/* Found restaurants (not yet saved) */}
                            {foundWishlistRestaurants.length > 0 && (
                              <>
                                <div className="flex items-center gap-2 my-3">
                                  <div className="flex-1 h-px bg-gray-100" />
                                  <span className="text-xs text-gray-400 font-medium">Found nearby</span>
                                  <div className="flex-1 h-px bg-gray-100" />
                                </div>
                                {foundWishlistRestaurants.map(r => (
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

        {tripModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-dark">Add to Trip</h2>
                <button onClick={() => setTripModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <p className="text-sm text-gray-500 mb-5">
                Add <span className="font-semibold text-dark">{tripModal.dish_name}</span> in {tripModal.city_name} to one or more trips.
              </p>

              {itineraries.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your trips</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {itineraries.map(trip => {
                      const checked = selectedItineraryIds.includes(trip.id);
                      return (
                        <button
                          key={trip.id}
                          onClick={() => setSelectedItineraryIds(prev =>
                            checked ? prev.filter(id => id !== trip.id) : [...prev, trip.id]
                          )}
                          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center gap-2 ${
                            checked
                              ? "bg-primary text-white border-primary"
                              : "border-gray-200 text-gray-700 hover:border-primary hover:text-primary"
                          }`}
                        >
                          <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs ${checked ? "bg-white border-white text-primary" : "border-gray-300"}`}>
                            {checked ? "✓" : ""}
                          </span>
                          🗺️ {trip.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">New trip</p>
                <input
                  type="text"
                  value={newTripName}
                  onChange={e => setNewTripName(e.target.value)}
                  placeholder="Trip name (e.g. Paris Spring 2025)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleAddToTrip}
                  disabled={addingToTrip || (selectedItineraryIds.length === 0 && !newTripName.trim())}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {addingToTrip ? "Adding…" : `Add to ${selectedItineraryIds.length + (newTripName.trim() ? 1 : 0) > 1 ? `${selectedItineraryIds.length + (newTripName.trim() ? 1 : 0)} trips` : "Trip"}`}
                </button>
                <button
                  onClick={() => setTripModal(null)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:border-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </>
  );
}
