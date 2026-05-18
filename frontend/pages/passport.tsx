import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import OnboardingWizard from "../components/OnboardingWizard";
import Link from "next/link";
import Head from "next/head";
import { DIETARY_OPTIONS, parseDietaryPrefs } from "../lib/dietary";
import CityAutocomplete from "../components/CityAutocomplete";
import { CITY_COORDS } from "../lib/cities";

const ItineraryMap = dynamic(() => import("../components/ItineraryMap"), { ssr: false });

interface PassportEntry {
  id: string;
  dish_id: string | null;
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
  itinerary_ids: string[];
}

interface Stats {
  total_dishes: number;
  cities_visited: number;
  cuisine_types: number;
  avg_rating: number | null;
}

interface MapRestaurant {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  google_rating: number | null;
  address: string | null;
  google_maps_url: string | null;
}

export default function Passport() {
  const { getToken } = useAuth();
  const { isLoaded: isUserLoaded } = useUser();
  const router = useRouter();

  const [entries, setEntries] = useState<PassportEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [itineraries, setItineraries] = useState<{ id: string; name: string }[]>([]);

  // Settings drawer
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // City filter
  const [cityFilter, setCityFilter] = useState<string>("all");

  // Selected entry for detail panel
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState<number>(0);
  const [editNotes, setEditNotes] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [openTripPickerId, setOpenTripPickerId] = useState<string | null>(null);

  // Map state
  const [mapExpandedCity, setMapExpandedCity] = useState<string | null>(null);
  const [mapRestaurants, setMapRestaurants] = useState<MapRestaurant[]>([]);
  const [mapLoadingRestaurants, setMapLoadingRestaurants] = useState(false);
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);
  const [mapFocusCoords, setMapFocusCoords] = useState<{ lat: number; lng: number } | null>(null);

  const load = async () => {
    try {
      const token = await getToken();
      const [passportRes, userRes, itinerariesRes] = await Promise.all([
        fetch(`${API_URL}/api/passport`,    { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/user`,        { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/itineraries`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (passportRes.ok) {
        const data = await passportRes.json();
        setEntries(data.entries || []);
        setStats(data.stats);
      }
      if (itinerariesRes.ok) {
        const data = await itinerariesRes.json();
        setItineraries(data.itineraries || []);
      }
      if (userRes.ok) {
        const userData = await userRes.json();
        const u = userData.user;
        const prefs = parseDietaryPrefs(u?.dietary_notes);
        setDietaryPrefs(prefs);
        setDisplayName(u?.display_name || "");
        setHomeCity(u?.home_city || "");
        const alreadyShown = sessionStorage.getItem("onboarding_shown");
        const incomplete = !u?.home_city || !u?.display_name || !u?.dietary_notes || u?.dietary_notes === "[]";
        if (!alreadyShown && incomplete) {
          sessionStorage.setItem("onboarding_shown", "1");
          setShowWizard(true);
        }
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isUserLoaded) load(); }, [isUserLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && isUserLoaded) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isUserLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map helpers ───────────────────────────────────────────────────────────

  const cityRestaurantIds = (allEntries: PassportEntry[]): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const e of allEntries) {
      if (e.restaurant_id) {
        if (!map[e.city_name]) map[e.city_name] = [];
        if (!map[e.city_name].includes(e.restaurant_id)) map[e.city_name].push(e.restaurant_id);
      }
    }
    return map;
  };

  const openMapCity = useCallback(async (city: string, restaurantIds: string[], force = false) => {
    if (!force && mapExpandedCity === city) {
      setMapExpandedCity(null); setMapRestaurants([]); setMapSelectedId(null); setMapFocusCoords(null);
      return;
    }
    setMapExpandedCity(city);
    setMapSelectedId(null);
    const coords = CITY_COORDS[city];
    if (coords) setMapFocusCoords({ lat: coords[0], lng: coords[1] });
    const uniqueIds = [...new Set(restaurantIds)].filter(Boolean);
    if (uniqueIds.length === 0) { setMapRestaurants([]); return; }
    setMapLoadingRestaurants(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/restaurants/by-ids`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds }),
      });
      if (res.ok) setMapRestaurants((await res.json()).restaurants || []);
    } catch { /* silent */ } finally {
      setMapLoadingRestaurants(false);
    }
  }, [mapExpandedCity, getToken]);

  // ── City filter ───────────────────────────────────────────────────────────

  const restIds = cityRestaurantIds(entries);

  const handleCityFilterChange = (value: string) => {
    setCityFilter(value);
    setSelectedEntryId(null);
    setEditingId(null);
    if (value === "all") {
      setMapExpandedCity(null); setMapRestaurants([]); setMapSelectedId(null); setMapFocusCoords(null);
    } else {
      openMapCity(value, restIds[value] ?? [], true);
    }
  };

  // ── Profile helpers ───────────────────────────────────────────────────────

  const toggleDietaryPref = async (id: string) => {
    const next = dietaryPrefs.includes(id) ? dietaryPrefs.filter(p => p !== id) : [...dietaryPrefs, id];
    setDietaryPrefs(next);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/user`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dietary_notes: JSON.stringify(next) }),
      });
      if (!res.ok) throw new Error();
      showToast("success", "Preferences saved");
    } catch { setDietaryPrefs(dietaryPrefs); showToast("error", "Failed to save preferences."); }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) { showToast("error", "Display name is required"); return; }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/user`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim(), home_city: homeCity || null, dietary_notes: JSON.stringify(dietaryPrefs) }),
      });
      if (!res.ok) throw new Error();
      showToast("success", "Profile saved!");
      setSettingsOpen(false);
    } catch { showToast("error", "Failed to save profile"); } finally { setSaving(false); }
  };

  const handleWizardComplete = async (profile: { display_name: string; home_city: string; dietary_notes: string }) => {
    setShowWizard(false);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/user`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      setDisplayName(profile.display_name);
      setHomeCity(profile.home_city);
      setDietaryPrefs(parseDietaryPrefs(profile.dietary_notes));
      showToast("success", "Passport activated!");
    } catch { showToast("error", "Failed to save profile."); }
  };

  // ── Entry edit helpers ────────────────────────────────────────────────────

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
    } catch { showToast("error", "Failed to save."); }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/passport/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setConfirmDeleteId(null);
      if (selectedEntryId === id) setSelectedEntryId(null);
      showToast("success", "Removed from passport.");
      await load();
    } catch { showToast("error", "Failed to delete."); }
  };

  const goToPlan = (entry: PassportEntry, itineraryId: string) => {
    setOpenTripPickerId(null);
    const params = new URLSearchParams({ itinerary: itineraryId });
    if (entry.dish_id)       params.set("dish_id",       entry.dish_id);
    if (entry.dish_name)     params.set("dish_name",     entry.dish_name);
    if (entry.city_name)     params.set("city_name",     entry.city_name);
    if (entry.restaurant_id) params.set("restaurant_id", entry.restaurant_id);
    router.push(`/plan?${params.toString()}`);
  };

  // ── Completion score ──────────────────────────────────────────────────────

  const completionSteps = [
    { label: "Display name",    done: !!displayName.trim() },
    { label: "Home city",       done: !!homeCity.trim() },
    { label: "Dietary prefs",   done: dietaryPrefs.length > 0 },
    { label: "First dish",      done: (stats?.total_dishes ?? 0) >= 1 },
    { label: "3+ dishes",       done: (stats?.total_dishes ?? 0) >= 3 },
    { label: "2+ cities",       done: (stats?.cities_visited ?? 0) >= 2 },
  ];
  const completionPct = Math.round((completionSteps.filter(s => s.done).length / completionSteps.length) * 100);

  // ── Derived data ──────────────────────────────────────────────────────────

  const cities = Array.from(new Set(entries.map(e => e.city_name))).sort();
  const filtered = cityFilter === "all" ? entries : entries.filter(e => e.city_name === cityFilter);
  const grouped: { city: string; country: string; items: PassportEntry[] }[] = (() => {
    if (cityFilter !== "all") {
      return filtered.length > 0 ? [{ city: filtered[0].city_name, country: filtered[0].country, items: filtered }] : [];
    }
    return cities.map(city => ({
      city,
      country: entries.find(e => e.city_name === city)?.country ?? "",
      items: entries.filter(e => e.city_name === city),
    }));
  })();

  const selectedEntry = entries.find(e => e.id === selectedEntryId) ?? null;

  // ── Map items ─────────────────────────────────────────────────────────────

  const mapItems = mapExpandedCity
    ? mapRestaurants
        .filter(r => r.latitude != null && r.longitude != null)
        .map(r => ({
          id: r.id,
          dish_id: null,
          dish_name: r.name,
          city_name: mapExpandedCity,
          country: entries.find(e => e.city_name === mapExpandedCity)?.country ?? "",
          notes: r.address,
          dish_description: null,
          cuisine_type: null,
          tags: [] as string[],
          dish_rank: null,
          city_id: null,
          eaten_count: 1,
          created_at: "",
          latitude: r.latitude,
          longitude: r.longitude,
          restaurant_ids: [r.id],
          color: "#7c3aed",
        }))
    : cities.map(city => {
        const cityEntries = entries.filter(e => e.city_name === city);
        const coords = CITY_COORDS[city];
        return {
          id: city,
          dish_id: null,
          dish_name: `${cityEntries.length} dish${cityEntries.length !== 1 ? "es" : ""}`,
          city_name: cityEntries[0].city_name,
          country: cityEntries[0].country,
          notes: null,
          dish_description: null,
          cuisine_type: null,
          tags: [] as string[],
          dish_rank: null,
          city_id: null,
          eaten_count: cityEntries.length,
          created_at: cityEntries[0].tasted_at,
          latitude: coords ? coords[0] : null,
          longitude: coords ? coords[1] : null,
          restaurant_ids: restIds[city] ?? [],
          color: "#7c3aed",
        };
      });

  // ── Sub-components ────────────────────────────────────────────────────────

  const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button" onClick={() => onChange(s === value ? 0 : s)}
          className={`text-2xl transition-colors ${s <= value ? "text-violet-400" : "text-gray-200 hover:text-violet-200"}`}>★</button>
      ))}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Head><title>My Passport - Local Taste</title></Head>
      {showWizard && (
        <OnboardingWizard
          initialDisplayName={displayName}
          initialHomeCity={homeCity}
          initialDietary={dietaryPrefs}
          onComplete={handleWizardComplete}
          onSkip={() => setShowWizard(false)}
        />
      )}
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-dark">🛂 My Passport</h1>
              <p className="text-gray-500 text-sm mt-1">Your culinary adventures, logged for life.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettingsOpen(o => !o)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors"
              >⚙ Profile</button>
              <Link href="/explore">
                <button className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 font-medium transition-colors text-sm">
                  + Explore
                </button>
              </Link>
            </div>
          </div>

          {/* ── Stats ────────────────────────────────────────────────────── */}
          {stats && (
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <p className="text-2xl font-bold text-primary">{stats.total_dishes}</p>
                <p className="text-xs text-gray-500 mt-0.5">Dishes</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <p className="text-2xl font-bold text-dark">{stats.cities_visited}</p>
                <p className="text-xs text-gray-500 mt-0.5">Cities</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <p className="text-2xl font-bold text-dark">{stats.cuisine_types}</p>
                <p className="text-xs text-gray-500 mt-0.5">Cuisines</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4 text-center">
                <p className="text-2xl font-bold text-dark">{stats.avg_rating ? stats.avg_rating.toFixed(1) : "—"}</p>
                <p className="text-xs text-gray-500 mt-0.5">Avg Rating</p>
              </div>
            </div>
          )}

          {/* ── Completion bar (inline, compact) ─────────────────────────── */}
          {!loading && completionPct < 100 && (
            <div className="bg-white rounded-xl shadow px-5 py-3 mb-6 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-dark">Passport {completionPct}% complete</span>
                  <button onClick={() => setSettingsOpen(true)} className="text-xs text-primary hover:underline">Complete ↗</button>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-purple-400 rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }} />
                </div>
              </div>
              <div className="hidden sm:flex gap-3">
                {completionSteps.map(s => (
                  <span key={s.label} className={`text-xs flex items-center gap-0.5 ${s.done ? "text-green-600" : "text-gray-300"}`}>
                    {s.done ? "✓" : "○"} {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Settings drawer ───────────────────────────────────────────── */}
          {settingsOpen && (
            <div className="bg-white rounded-xl shadow p-6 mb-6 border border-purple-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-dark">Profile & Preferences</h2>
                <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home City</label>
                  <CityAutocomplete initialValue={homeCity} onSelect={(city, country) => setHomeCity(`${city}, ${country}`)} />
                </div>
              </div>
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Dietary preferences</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIETARY_OPTIONS.map(opt => {
                    const active = dietaryPrefs.includes(opt.id);
                    return (
                      <button key={opt.id} type="button" onClick={() => toggleDietaryPref(opt.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                          active ? "border-primary bg-purple-50 text-primary" : "border-gray-200 text-gray-600 hover:border-purple-200"
                        }`}>
                        <span>{opt.emoji}</span><span>{opt.label}</span>
                        {active && <span className="ml-auto text-xs text-primary">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={handleSaveProfile} disabled={saving}
                className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors text-sm">
                {saving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          )}

          {/* ── Main content ──────────────────────────────────────────────── */}
          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading your passport…</div>
          ) : entries.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-16 text-center">
              <div className="text-5xl mb-4">🍽️</div>
              <h2 className="text-xl font-semibold text-dark mb-2">Your passport is empty</h2>
              <p className="text-gray-500 mb-6">Start exploring cities and log the dishes you try.</p>
              <Link href="/explore">
                <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 font-semibold">Explore a City</button>
              </Link>
            </div>
          ) : (
            <>
              {/* Section header */}
              <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-bold text-dark">
                    {cityFilter === "all" ? "Your culinary map" : cityFilter}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {cityFilter === "all"
                      ? `${cities.length} cit${cities.length !== 1 ? "ies" : "y"} · ${entries.length} dish${entries.length !== 1 ? "es" : ""} tried`
                      : `${filtered.length} dish${filtered.length !== 1 ? "es" : ""} tried · ${filtered[0]?.country ?? ""}`}
                  </p>
                </div>
                <select
                  value={cityFilter}
                  onChange={e => handleCityFilterChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="all">All cities</option>
                  {cities.map(c => (
                    <option key={c} value={c}>{c} ({entries.filter(e => e.city_name === c).length})</option>
                  ))}
                </select>
              </div>

              {/* Split layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: map + grouped list */}
                <div className="lg:col-span-2 space-y-4">

                  {/* Map */}
                  <div className="bg-white rounded-xl shadow overflow-hidden" style={{ height: 360 }}>
                    {mapExpandedCity && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <button
                          onClick={() => {
                            setMapExpandedCity(null); setMapRestaurants([]); setMapSelectedId(null); setMapFocusCoords(null);
                            if (cityFilter !== "all") { setCityFilter("all"); setSelectedEntryId(null); }
                          }}
                          className="text-xs text-primary hover:underline">← All cities</button>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs font-medium text-dark">{mapExpandedCity}</span>
                        {mapLoadingRestaurants && <span className="text-xs text-gray-400 animate-pulse ml-1">Loading…</span>}
                      </div>
                    )}
                    <div style={{ height: mapExpandedCity ? 320 : 360 }}>
                      <ItineraryMap
                        items={mapItems}
                        selectedItem={mapSelectedId ? mapItems.find(m => m.id === mapSelectedId) ?? null : null}
                        focusCoords={mapFocusCoords}
                        highlightedRestaurantId={mapSelectedId}
                        onPinClick={item => {
                          if (!mapExpandedCity) {
                            // City pin → zoom into city
                            setCityFilter(item.city_name);
                            openMapCity(item.city_name, restIds[item.city_name] ?? []);
                          } else {
                            // Restaurant pin → select entry in list
                            const nextId = mapSelectedId === item.id ? null : item.id;
                            setMapSelectedId(nextId);
                            if (item.latitude && item.longitude) setMapFocusCoords({ lat: item.latitude, lng: item.longitude });
                            // Highlight matching passport entry
                            if (nextId) {
                              const match = entries.find(e => e.restaurant_id === nextId);
                              if (match) setSelectedEntryId(match.id);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Grouped entry list */}
                  <div className="space-y-5">
                    {grouped.map(({ city, country, items }) => (
                      <div key={city}>
                        {cityFilter === "all" && (
                          <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-sm font-bold text-dark">{city}</h2>
                            <span className="text-xs text-gray-400">{country} · {items.length} dish{items.length !== 1 ? "es" : ""}</span>
                            <button
                              onClick={() => openMapCity(city, restIds[city] ?? [])}
                              className="ml-auto text-xs text-primary hover:underline"
                            >Show on map →</button>
                          </div>
                        )}
                        <div className="space-y-2">
                          {items.map(entry => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => setSelectedEntryId(selectedEntryId === entry.id ? null : entry.id)}
                              className={`w-full text-left bg-white rounded-lg shadow px-4 py-3 transition-all border-2 ${
                                selectedEntryId === entry.id ? "border-primary" : "border-transparent hover:border-purple-200"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-dark text-sm truncate">{entry.dish_name}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {entry.cuisine_type && (
                                      <span className="text-xs text-purple-500">{entry.cuisine_type}</span>
                                    )}
                                    {entry.restaurant_name && (
                                      <span className="text-xs text-gray-400">at {entry.restaurant_name}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {entry.rating && (
                                    <span className="text-violet-400 text-xs">{"★".repeat(entry.rating)}</span>
                                  )}
                                  <span className="text-xs text-gray-300">
                                    {new Date(entry.tasted_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                  </span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: detail panel */}
                <div className="lg:col-span-1">
                  {selectedEntry ? (
                    <div className="bg-white rounded-xl shadow p-5 sticky top-6">
                      {editingId === selectedEntry.id ? (
                        <div>
                          <p className="font-semibold text-dark mb-1">{selectedEntry.dish_name}</p>
                          <p className="text-xs text-gray-400 mb-3">📍 {selectedEntry.city_name}, {selectedEntry.country}</p>
                          <div className="mb-3">
                            <label className="text-sm text-gray-600 mb-1 block">Your rating</label>
                            <StarRating value={editRating} onChange={setEditRating} />
                          </div>
                          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                            placeholder="Notes, memories, recommendations…" rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3" />
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(selectedEntry.id)}
                              className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-purple-700">Save</button>
                            <button onClick={() => setEditingId(null)}
                              className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-dark text-base leading-tight">{selectedEntry.dish_name}</h3>
                              <p className="text-xs text-gray-500 mt-0.5">📍 {selectedEntry.city_name}, {selectedEntry.country}</p>
                            </div>
                            <button onClick={() => setSelectedEntryId(null)} className="text-gray-300 hover:text-gray-500 text-lg leading-none flex-shrink-0">✕</button>
                          </div>

                          {selectedEntry.cuisine_type && (
                            <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs mb-3">{selectedEntry.cuisine_type}</span>
                          )}

                          {selectedEntry.restaurant_name && (
                            <p className="text-sm text-gray-600 mb-2">🍽 {selectedEntry.restaurant_name}</p>
                          )}

                          {selectedEntry.rating ? (
                            <p className="text-violet-400 mb-2">{"★".repeat(selectedEntry.rating)}{"☆".repeat(5 - selectedEntry.rating)}</p>
                          ) : (
                            <p className="text-xs text-gray-300 mb-2">No rating yet</p>
                          )}

                          {selectedEntry.notes && (
                            <p className="text-sm text-gray-600 italic mb-3">&ldquo;{selectedEntry.notes}&rdquo;</p>
                          )}

                          <p className="text-xs text-gray-400 mb-4">
                            {new Date(selectedEntry.tasted_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                          </p>

                          {/* Trip links */}
                          {selectedEntry.itinerary_ids?.length > 0 && (() => {
                            const trips = itineraries.filter(t => selectedEntry.itinerary_ids.includes(t.id));
                            if (trips.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1 mb-4">
                                {trips.map(t => (
                                  <button key={t.id} onClick={() => goToPlan(selectedEntry, t.id)}
                                    className="text-xs px-2 py-1 bg-purple-50 border border-primary text-primary rounded-lg hover:bg-purple-100">
                                    📋 {t.name} →
                                  </button>
                                ))}
                              </div>
                            );
                          })()}

                          <div className="flex gap-2 pt-3 border-t border-gray-100">
                            <button onClick={() => startEdit(selectedEntry)}
                              className="flex-1 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:border-primary hover:text-primary transition-colors">
                              Edit
                            </button>
                            <button onClick={() => setConfirmDeleteId(selectedEntry.id)}
                              className="flex-1 py-1.5 border border-red-200 text-red-400 rounded-lg text-xs hover:border-red-400 hover:text-red-600 transition-colors">
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl shadow p-6 text-center text-gray-400 sticky top-6">
                      <p className="text-3xl mb-2">🗺️</p>
                      <p className="text-sm">Select a dish from the list to see details</p>
                    </div>
                  )}
                </div>

              </div>
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
      </Layout>
    </>
  );
}
