import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Layout from "../components/Layout";
import CityAutocomplete from "../components/CityAutocomplete";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import { DIETARY_OPTIONS, parseDietaryPrefs } from "../lib/dietary";
import Link from "next/link";
import Head from "next/head";

interface Dish {
  id: string;
  name: string;
  description: string;
  rank: number;
  cuisine_type: string | null;
  tags: string[];
  in_passport: boolean;
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
}

interface City {
  id: string;
  name: string;
  country: string;
  description: string | null;
}

type Stage = "idle" | "searching" | "dishes" | "loading_restaurants" | "restaurants";

const LOCAL_CATEGORY = "local";

const CUISINE_CATEGORIES = [
  { id: "pizza",          label: "Pizza",          emoji: "🍕" },
  { id: "pasta",          label: "Pasta",          emoji: "🍝" },
  { id: "sushi",          label: "Sushi",          emoji: "🍣" },
  { id: "ramen",          label: "Ramen",          emoji: "🍜" },
  { id: "dumplings",      label: "Dumplings",      emoji: "🥟" },
  { id: "mexican",        label: "Mexican",        emoji: "🌮" },
  { id: "indian",         label: "Indian",         emoji: "🍛" },
  { id: "thai",           label: "Thai",           emoji: "🥗" },
  { id: "middle-eastern", label: "Middle Eastern", emoji: "🥙" },
  { id: "burgers",        label: "Burgers",        emoji: "🍔" },
];

const MEAL_CATEGORIES = [
  { id: "breakfast",  label: "Breakfast",  emoji: "🌅" },
  { id: "brunch",     label: "Brunch",     emoji: "🥞" },
  { id: "lunch",      label: "Lunch",      emoji: "☀️" },
  { id: "snack",      label: "Snack",      emoji: "🥡" },
  { id: "dinner",     label: "Dinner",     emoji: "🌙" },
  { id: "late-night", label: "Late Night", emoji: "🌃" },
];

const FOOD_CATEGORIES = [...CUISINE_CATEGORIES, ...MEAL_CATEGORIES];

export default function Explore() {
  const { getToken } = useAuth();
  const { isLoaded: isUserLoaded } = useUser();
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const handleCitySelect = useCallback((city: string, country: string) => {
    setCityInput(city);
    setCountryInput(country);
  }, []);
  const [isLocal, setIsLocal] = useState(true);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [selectedMealTime, setSelectedMealTime] = useState<string | null>(null);
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);
  const [useMyPrefs, setUseMyPrefs] = useState(true);
  const [customPrefs, setCustomPrefs] = useState<string[]>([]);
  const [itineraryDishIds, setItineraryDishIds] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage>("idle");
  const loadingRef = useRef<HTMLDivElement>(null);
  const dishesRef = useRef<HTMLDivElement>(null);
  const restaurantsLoadingRef = useRef<HTMLDivElement>(null);
  const restaurantsRef = useRef<HTMLDivElement>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [categoryLabel, setCategoryLabel] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState("");
  const [addedToTripKeys, setAddedToTripKeys] = useState<Set<string>>(new Set());
  const [wishlistDishIds, setWishlistDishIds] = useState<Set<string>>(new Set());

  // Save-to modal state
  const [saveModal, setSaveModal] = useState<{
    dishId: string | null;
    dishName: string;
    cityName: string;
    country: string;
  } | null>(null);
  const [saveNotes, setSaveNotes] = useState("");
  const [saveDestination, setSaveDestination] = useState<"wishlist" | "trip">("wishlist");
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>("");
  const [newTripName, setNewTripName] = useState("");
  const [itineraries, setItineraries] = useState<{id: string; name: string}[]>([]);
  const [saving, setSaving] = useState(false);

  // Load user prefs + itinerary dish IDs + itineraries once auth ready
  useEffect(() => {
    if (!isUserLoaded) return;
    getToken().then(async token => {
      if (!token) return;
      const [userRes, itineraryRes, itinerariesRes, wishlistRes] = await Promise.all([
        fetch(`${API_URL}/api/user`,        { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/itinerary`,   { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/itineraries`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/wishlist`,    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (userRes.ok) {
        const data = await userRes.json();
        setDietaryPrefs(parseDietaryPrefs(data?.user?.dietary_notes));
      }
      if (itineraryRes.ok) {
        const data = await itineraryRes.json();
        setItineraryDishIds(new Set((data.items || []).map((i: {dish_id: string}) => i.dish_id)));
      }
      if (itinerariesRes.ok) {
        const data = await itinerariesRes.json();
        setItineraries(data.itineraries || []);
      }
      if (wishlistRes.ok) {
        const data = await wishlistRes.json();
        setWishlistDishIds(new Set((data.items || []).filter((i: {dish_id: string | null}) => i.dish_id).map((i: {dish_id: string}) => i.dish_id)));
      }
    }).catch(() => { /* silent */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollInterval) clearInterval(pollInterval); }, [pollInterval]);

  const stopPolling = () => {
    if (pollInterval) { clearInterval(pollInterval); setPollInterval(null); }
  };

  const pollJob = async (jid: string, onComplete: (job: Record<string, unknown>) => void) => {
    stopPolling();
    const interval = setInterval(async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/jobs/${jid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const job = await res.json();
        if (job.status === "completed") {
          clearInterval(interval);
          setPollInterval(null);
          onComplete(job);
        } else if (job.status === "failed") {
          clearInterval(interval);
          setPollInterval(null);
          showToast("error", job.error_message || "Search failed. Please try again.");
          setStage("idle");
        }
      } catch { /* keep polling */ }
    }, 2000);
    setPollInterval(interval);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityInput.trim() || !countryInput.trim()) {
      showToast("error", "Please select a city from the list");
      return;
    }

    setDishes([]);
    setCity(null);
    setSelectedDish(null);
    setRestaurants([]);
    setTimeout(() => loadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    const activeDietary = useMyPrefs ? dietaryPrefs : customPrefs;

    // Non-local: skip dish discovery, go straight to restaurant ranking
    if (!isLocal) {
      const catId = selectedCuisine || selectedMealTime;
      const cat = FOOD_CATEGORIES.find(c => c.id === catId);
      const catName = cat ? `${cat.emoji} ${cat.label}` : (catId ?? "food");
      setCategoryLabel(catName);
      setStage("loading_restaurants");
      setStatusMessage(`Finding the best ${cat?.label || catId} spots in ${cityInput}…`);
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/rank-by-category`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            category: cat?.label || catId,
            city: cityInput.trim(),
            country: countryInput.trim(),
            dietary_preferences: activeDietary,
          }),
        });
        if (!res.ok) throw new Error("Failed to start category search");
        const data = await res.json();
        pollJob(data.job_id, async (job) => {
          const rPayload = (job.restaurants_payload as Record<string, unknown>) || {};
          const rList = (rPayload.restaurants as Restaurant[]) || [];
          setRestaurants([...rList].sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0)));
          setStage("restaurants");
        });
      } catch {
        showToast("error", "Failed to start search. Please try again.");
        setStage("idle");
      }
      return;
    }

    // Local dishes flow
    setStage("searching");
    setStatusMessage("Exploring the local food scene…");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/discover`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityInput.trim(),
          country: countryInput.trim(),
          dietary_preferences: activeDietary,
          meal_time: selectedMealTime,
        }),
      });
      if (!res.ok) throw new Error("Failed to start discovery");
      const data = await res.json();
      pollJob(data.job_id, async (job) => {
        const dishesPayload = (job.dishes_payload as Record<string, unknown>) || {};
        const cityId = (job.summary_payload as Record<string, unknown> | undefined)?.city_id as string || (dishesPayload?.city_id as string);
        if (cityId) {
          const token2 = await getToken();
          const dishRes = await fetch(`${API_URL}/api/cities/${cityId}/dishes`, {
            headers: { Authorization: `Bearer ${token2}` },
          });
          if (dishRes.ok) {
            const d = await dishRes.json();
            setCity(d.city);
            setDishes(d.dishes);
            setStage("dishes");
            setTimeout(() => dishesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          }
        }
      });
    } catch {
      showToast("error", "Failed to start search. Please try again.");
      setStage("idle");
    }
  };

  const handleDishClick = async (dish: Dish) => {
    setSelectedDish(dish);
    setRestaurants([]);
    setStage("loading_restaurants");
    setStatusMessage(`Finding the best spots for ${dish.name}…`);
    setTimeout(() => restaurantsLoadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/rank-restaurants`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dish_id: dish.id,
          dish_name: dish.name,
          city: city?.name || "",
          country: city?.country || "",
          dietary_preferences: dietaryPrefs,
        }),
      });
      if (!res.ok) throw new Error("Failed to start restaurant search");
      const data = await res.json();
      pollJob(data.job_id, async (job) => {
        const rPayload = (job.restaurants_payload as Record<string, unknown>) || {};
        const rList = (rPayload.restaurants as Restaurant[]) || [];
        const sortByRating = (list: Restaurant[]) =>
          [...list].sort((a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0));
        if (rList.length > 0) {
          setRestaurants(sortByRating(rList));
          setStage("restaurants");
          setTimeout(() => restaurantsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        } else {
          // Fall back to direct fetch
          const token2 = await getToken();
          const rRes = await fetch(`${API_URL}/api/dishes/${dish.id}/restaurants`, {
            headers: { Authorization: `Bearer ${token2}` },
          });
          if (rRes.ok) {
            const rData = await rRes.json();
            setRestaurants(sortByRating(rData.restaurants || []));
          }
          setStage("restaurants");
          setTimeout(() => restaurantsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        }
      });
    } catch {
      showToast("error", "Failed to load restaurants.");
      setStage("dishes");
    }
  };

  const handleAddToPassport = async (dish: Dish) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/passport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dish_id: dish.id }),
      });
      setDishes((prev) => prev.map((d) => d.id === dish.id ? { ...d, in_passport: true } : d));
      if (selectedDish?.id === dish.id) setSelectedDish({ ...dish, in_passport: true });
      showToast("success", `"${dish.name}" added to your passport!`);
    } catch {
      showToast("error", "Failed to add to passport.");
    }
  };

  const openSaveModal = (dish: Dish | null, overrideCityName?: string, overrideCountry?: string) => {
    const dishName = dish ? dish.name : (categoryLabel || `Food in ${cityInput}`);
    const cName = overrideCityName ?? city?.name ?? cityInput;
    const cCountry = overrideCountry ?? city?.country ?? countryInput;
    if (!dishName || !cName || !cCountry) return;
    setSaveNotes("");
    setSaveDestination("wishlist");
    setSelectedItineraryId(itineraries[0]?.id ?? "");
    setNewTripName("");
    setSaveModal({ dishId: dish?.id ?? null, dishName, cityName: cName, country: cCountry });
  };

  const confirmSave = async () => {
    if (!saveModal) return;
    setSaving(true);
    try {
      const token = await getToken();
      const baseBody = saveModal.dishId
        ? { dish_id: saveModal.dishId, notes: saveNotes || undefined }
        : { dish_name: saveModal.dishName, city_name: saveModal.cityName, country: saveModal.country, notes: saveNotes || undefined };

      if (saveDestination === "wishlist") {
        const res = await fetch(`${API_URL}/api/wishlist`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(baseBody),
        });
        if (!res.ok) throw new Error(await res.text());
        if (saveModal.dishId) setWishlistDishIds(prev => new Set([...prev, saveModal.dishId!]));
        showToast("success", `"${saveModal.dishName}" added to your Wishlist!`);
      } else {
        let itineraryId = selectedItineraryId;

        if (!itineraryId) {
          // Create a new trip
          const name = newTripName.trim() || "My Trip";
          const createRes = await fetch(`${API_URL}/api/itineraries`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (!createRes.ok) throw new Error(await createRes.text());
          const created = await createRes.json();
          itineraryId = created.id;
          setItineraries(prev => [...prev, { id: created.id, name: created.name }]);
        }

        const res = await fetch(`${API_URL}/api/itineraries/${itineraryId}/items`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(baseBody),
        });
        if (!res.ok) throw new Error(await res.text());
        const key = `${saveModal.dishName}|${saveModal.cityName}`;
        setAddedToTripKeys(prev => new Set([...prev, key]));
        if (saveModal.dishId) setItineraryDishIds(prev => new Set([...prev, saveModal.dishId!]));
        const tripName = itineraries.find(t => t.id === itineraryId)?.name ?? (newTripName.trim() || "My Trip");
        showToast("success", `"${saveModal.dishName}" added to "${tripName}"!`);
      }

      setSaveModal(null);
    } catch {
      showToast("error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };


  const getMealMoment = (tags: string[]): { emoji: string; label: string } | null => {
    const t = tags.map(s => s.toLowerCase()).join(" ");
    if (/breakfast|morning|brunch/.test(t)) return { emoji: "🌅", label: "Morning" };
    if (/lunch|midday/.test(t)) return { emoji: "☀️", label: "Lunch" };
    if (/late.night|nightcap|bar snack/.test(t)) return { emoji: "🌃", label: "Late-night" };
    if (/dinner|evening/.test(t)) return { emoji: "🌙", label: "Dinner" };
    if (/street food|snack|anytime/.test(t)) return { emoji: "🥡", label: "Street snack" };
    return null;
  };

  const getDishVibe = (rank: number, tags: string[]): string => {
    const t = tags.map(s => s.toLowerCase()).join(" ");
    if (/hidden|secret|underrated/.test(t)) return "Hidden gem";
    if (/traditional|classic|heritage|historic/.test(t)) return "Local classic";
    if (/street|market|stall/.test(t)) return "Street food icon";
    if (/iconic|famous|must.try/.test(t)) return "City icon";
    if (rank === 1) return "Locals' #1 pick";
    return "Worth every bite";
  };

  const activeDiscoverPrefs = useMyPrefs ? dietaryPrefs : customPrefs;

  const getRestaurantBadge = (r: Restaurant): string | null => {
    const h = r.highlights.map(s => s.toLowerCase()).join(" ");
    if (/hidden|secret|gem/.test(h)) return "Hidden gem";
    if (/tourist/.test(h)) return "Tourist-heavy";
    if (/\blocal\b/.test(h)) return "Popular with locals";
    if (/neighborhood|neighbourhood/.test(h)) return "Neighborhood favorite";
    if (r.google_rating && r.review_count && r.google_rating >= 4.7 && r.review_count < 400) return "Hidden gem";
    if (r.google_rating && r.review_count && r.google_rating >= 4.5 && r.review_count >= 1000) return "Neighborhood favorite";
    if (r.rank === 1) return "Top pick";
    return null;
  };

  return (
    <>
      <Head><title>Explore - Local Taste</title></Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-dark mb-2">Explore a City</h1>
            <p className="text-gray-600">Enter any city and discover its 5 must-try dishes — then find the best places to eat them.</p>
          </div>

          {/* Food category selector */}
          <div className="bg-white rounded-xl shadow p-6 mb-4">

            {/* Top-level toggle */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                type="button"
                onClick={() => setIsLocal(true)}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 font-semibold text-left transition-all ${
                  isLocal ? "border-primary bg-purple-50 text-primary" : "border-gray-200 text-gray-700 hover:border-purple-200"
                }`}
              >
                <span className="text-2xl">🌍</span>
                <div>
                  <div className="font-bold text-sm">Local dishes</div>
                  <div className="text-xs font-normal text-gray-500">The soul of the city</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsLocal(false)}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 font-semibold text-left transition-all ${
                  !isLocal ? "border-primary bg-purple-50 text-primary" : "border-gray-200 text-gray-700 hover:border-purple-200"
                }`}
              >
                <span className="text-2xl">🍽️</span>
                <div>
                  <div className="font-bold text-sm">Not feeling local?</div>
                  <div className="text-xs font-normal text-gray-500">Pick a cuisine or meal time</div>
                </div>
              </button>
            </div>

            {/* Cuisine grid — only for non-local */}
            {!isLocal && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Cuisine</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-10 gap-2">
                  {CUISINE_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCuisine(prev => prev === cat.id ? null : cat.id)}
                      className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-xs font-medium transition-all ${
                        selectedCuisine === cat.id
                          ? "border-primary bg-purple-50 text-primary"
                          : "border-gray-100 text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-xl">{cat.emoji}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Meal time — shown for both modes */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Meal time <span className="normal-case font-normal text-gray-300">(optional)</span></p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {MEAL_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedMealTime(prev => prev === cat.id ? null : cat.id)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-xs font-medium transition-all ${
                      selectedMealTime === cat.id
                        ? "border-primary bg-purple-50 text-primary"
                        : "border-gray-100 text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dietary preferences — shown for both modes */}
            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">Dietary preferences</span>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs text-gray-500">Use my saved preferences</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useMyPrefs}
                    onClick={() => setUseMyPrefs(v => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${useMyPrefs ? "bg-primary" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useMyPrefs ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </label>
              </div>
              {useMyPrefs ? (
                dietaryPrefs.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {dietaryPrefs.map(p => {
                      const opt = DIETARY_OPTIONS.find(o => o.id === p);
                      return (
                        <span key={p} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full font-medium border border-purple-200">
                          {opt?.emoji} {opt?.label ?? p}
                        </span>
                      );
                    })}
                    <Link href="/passport" className="text-xs text-gray-400 hover:text-primary self-center ml-1">edit →</Link>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">
                    No preferences saved. <Link href="/passport" className="text-primary hover:underline">Set them in your passport</Link>.
                  </p>
                )
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Select which preferences to apply to this search:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DIETARY_OPTIONS.map(opt => {
                      const active = customPrefs.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setCustomPrefs(prev =>
                            prev.includes(opt.id) ? prev.filter(p => p !== opt.id) : [...prev, opt.id]
                          )}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                            active
                              ? "border-primary bg-purple-50 text-primary"
                              : "border-gray-200 text-gray-600 hover:border-purple-200 hover:bg-white"
                          }`}
                        >
                          <span>{opt.emoji}</span>
                          <span>{opt.label}</span>
                          {active && <span className="ml-auto text-primary">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Search form */}
          <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex flex-col sm:flex-row gap-3">
              <CityAutocomplete
                onSelect={handleCitySelect}
                disabled={stage === "searching" || stage === "loading_restaurants"}
              />
              <button
                type="submit"
                disabled={stage === "searching" || stage === "loading_restaurants"}
                className="px-8 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
              >
                {stage === "searching" ? "Searching…" : isLocal ? "Discover" : "Find restaurants"}
              </button>
            </div>
          </form>

          {/* Loading state */}
          {(stage === "searching" || stage === "loading_restaurants") && (
            <div ref={stage === "searching" ? loadingRef : restaurantsLoadingRef} className="mb-8 space-y-4">
              {/* Dish detail banner — shown while restaurants load */}
              {stage === "loading_restaurants" && selectedDish && (
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-6 border border-purple-100">
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                      selectedDish.rank === 1 ? "bg-violet-500 text-white" :
                      selectedDish.rank === 2 ? "bg-purple-400 text-white" :
                      selectedDish.rank === 3 ? "bg-purple-300 text-white" : "bg-purple-100 text-purple-700"
                    }`}>
                      {selectedDish.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-dark mb-1">{selectedDish.name}</h3>
                      {selectedDish.cuisine_type && (
                        <p className="text-xs text-purple-500 font-medium mb-2">{selectedDish.cuisine_type}</p>
                      )}
                      <p className="text-gray-600 leading-relaxed">{selectedDish.description}</p>
                      {selectedDish.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {selectedDish.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-white text-purple-600 rounded-full text-xs font-medium border border-purple-100">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Spinner */}
              <div className="bg-white rounded-lg shadow p-10 text-center">
                <div className="text-4xl mb-4 animate-strong-pulse">🌍</div>
                <p className="text-lg font-medium text-gray-700 mb-2">{statusMessage}</p>
                <p className="text-sm text-gray-500">Gathering local reviews and recommendations — usually takes 20-40 seconds</p>
                {stage === "searching" && activeDiscoverPrefs.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center items-center gap-2">
                    <span className="text-xs text-gray-400">Applying:</span>
                    {activeDiscoverPrefs.map(p => {
                      const opt = DIETARY_OPTIONS.find(o => o.id === p);
                      return (
                        <span key={p} className="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full font-medium border border-purple-100">
                          {opt?.emoji} {opt?.label ?? p}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-center gap-2 mt-4">
                  <div className="w-2 h-2 bg-primary rounded-full animate-strong-pulse" />
                  <div className="w-2 h-2 bg-primary rounded-full animate-strong-pulse" style={{ animationDelay: "0.3s" }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-strong-pulse" style={{ animationDelay: "0.6s" }} />
                </div>
              </div>
            </div>
          )}

          {/* Dishes */}
          {(stage === "dishes" || stage === "restaurants" || stage === "loading_restaurants") && city && dishes.length > 0 && (
            <div ref={dishesRef} className="mb-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-dark">
                  Must-try dishes in {city.name}, {city.country}
                </h2>
                {city.description && <p className="text-gray-600 mt-1">{city.description}</p>}
              </div>
              <div className="space-y-3">
                {dishes.map((dish) => {
                  const moment = getMealMoment(dish.tags);
                  const vibe = getDishVibe(dish.rank, dish.tags);
                  const isSelected = selectedDish?.id === dish.id;
                  return (
                    <div
                      key={dish.id}
                      onClick={() => handleDishClick(dish)}
                      className={`bg-white rounded-xl shadow cursor-pointer transition-all hover:shadow-md flex overflow-hidden ${
                        isSelected ? "ring-2 ring-primary shadow-md" : ""
                      }`}
                    >
                      {/* Left color band */}
                      <div className={`w-1.5 flex-shrink-0 ${
                        dish.rank === 1 ? "bg-violet-500" :
                        dish.rank === 2 ? "bg-purple-400" :
                        dish.rank === 3 ? "bg-purple-300" : "bg-purple-100"
                      }`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0 px-5 py-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <h3 className="font-bold text-dark text-base leading-snug">{dish.name}</h3>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              dish.rank <= 3 ? "bg-violet-100 text-violet-700" : "bg-purple-50 text-purple-600"
                            }`}>{vibe}</span>
                            {dish.in_passport && <span title="In your passport" className="text-sm">🛂</span>}
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            {moment && <span className="text-xs text-purple-500 font-medium">{moment.emoji} {moment.label}</span>}
                            {dish.cuisine_type && !moment && <span className="text-xs text-gray-400">{dish.cuisine_type}</span>}
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{dish.description}</p>
                          {dish.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {dish.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs font-medium">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex flex-col gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDishClick(dish); }}
                            className="text-xs px-4 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold whitespace-nowrap"
                          >
                            Where to eat →
                          </button>
                          {wishlistDishIds.has(dish.id) || itineraryDishIds.has(dish.id) ? (
                            <span className="text-xs px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200 text-center font-medium">
                              ✓ Saved
                            </span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); openSaveModal(dish); }}
                              className="text-xs px-4 py-2 border border-gray-200 text-gray-500 rounded-lg hover:border-amber-400 hover:text-amber-600 transition-colors text-center"
                              title="Save to wishlist or trip"
                            >
                              🗺️ Save
                            </button>
                          )}
                          {!dish.in_passport && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddToPassport(dish); }}
                              className="text-xs px-4 py-2 border border-gray-200 text-gray-500 rounded-lg hover:border-primary hover:text-primary transition-colors text-center"
                              title="Add to passport"
                            >
                              🛂 Save
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Restaurants */}
          {stage === "restaurants" && (selectedDish || !isLocal) && (
            <div ref={restaurantsRef} className="mb-8 space-y-4">
              {/* Dish description banner */}
              {selectedDish && (
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-5 border border-purple-100 flex items-start gap-4">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-base ${
                    selectedDish.rank === 1 ? "bg-violet-500 text-white" :
                    selectedDish.rank === 2 ? "bg-purple-400 text-white" :
                    selectedDish.rank === 3 ? "bg-purple-300 text-white" : "bg-purple-100 text-purple-700"
                  }`}>{selectedDish.rank}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-dark text-lg">{selectedDish.name}</h3>
                      {selectedDish.cuisine_type && (
                        <span className="text-xs text-purple-500 font-medium">{selectedDish.cuisine_type}</span>
                      )}
                    </div>
                    {selectedDish.description && (
                      <p className="text-gray-600 text-sm leading-relaxed">{selectedDish.description}</p>
                    )}
                    {selectedDish.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedDish.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-white text-purple-600 rounded-full text-xs font-medium border border-purple-100">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1 min-w-0 pr-4">
                  <h2 className="text-2xl font-bold text-dark mb-1">
                    {selectedDish ? `Where locals go for ${selectedDish.name}` : `Best ${categoryLabel} in ${cityInput}`}
                  </h2>
                  <p className="text-gray-400 text-xs">Chosen using local reviews, reputation, and food expertise</p>
                </div>
                <button
                  onClick={() => {
                    if (!isLocal) { setStage("idle"); setRestaurants([]); }
                    else { setStage("dishes"); setSelectedDish(null); setRestaurants([]); }
                  }}
                  className="flex-shrink-0 text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>

              {restaurants.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No restaurants found yet.</p>
              ) : (
                <div className="space-y-4">
                  {restaurants.map((r) => {
                    const badge = getRestaurantBadge(r);
                    const badgeStyle: Record<string, string> = {
                      "Hidden gem":          "bg-emerald-50 text-emerald-700",
                      "Popular with locals": "bg-amber-50 text-amber-700",
                      "Neighborhood favorite":"bg-orange-50 text-orange-700",
                      "Tourist-heavy":       "bg-gray-100 text-gray-500",
                      "Top pick":            "bg-violet-50 text-violet-700",
                    };
                    return (
                      <div key={r.id || r.rank} className="p-5 rounded-xl border border-gray-100 hover:border-primary hover:shadow-sm transition-all">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-dark text-base">{r.name}</h3>
                                {badge && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeStyle[badge] ?? "bg-gray-100 text-gray-600"}`}>
                                    {badge}
                                  </span>
                                )}
                              </div>
                              {r.address && <p className="text-sm text-gray-400 mt-0.5">{r.address}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {r.google_rating && (
                                <div className="flex items-center gap-1">
                                  <span className="text-violet-500">★</span>
                                  <span className="font-semibold">{r.google_rating}</span>
                                  {r.review_count && (
                                    <span className="text-gray-400 text-xs">({r.review_count.toLocaleString()})</span>
                                  )}
                                </div>
                              )}
                              {r.price_level && <p className="text-gray-400 text-sm">{r.price_level}</p>}
                            </div>
                          </div>
                          {r.rank_rationale && (
                            <p className="text-sm text-gray-600 mt-2 italic leading-relaxed">&ldquo;{r.rank_rationale}&rdquo;</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.highlights.slice(0, 4).map((h, i) => (
                              <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">{h}</span>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-3 flex-wrap">
                            {r.google_maps_url && (
                              <a
                                href={r.google_maps_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                📍 Google Maps
                              </a>
                            )}
                            {selectedDish && !selectedDish.in_passport && (
                              <button
                                onClick={() => handleAddToPassport(selectedDish)}
                                className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                              >
                                🛂 Add to Passport
                              </button>
                            )}
                            {(() => {
                              const key = `${selectedDish ? selectedDish.name : categoryLabel}|${cityInput}`;
                              const alreadySaved = addedToTripKeys.has(key)
                                || (selectedDish ? (itineraryDishIds.has(selectedDish.id) || wishlistDishIds.has(selectedDish.id)) : false);
                              return alreadySaved ? (
                                <span className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg border border-green-200 font-medium">
                                  ✓ Saved
                                </span>
                              ) : (
                                <button
                                  onClick={() => openSaveModal(selectedDish, cityInput.trim(), countryInput.trim())}
                                  className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors"
                                >
                                  🗺️ Save
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          )}

        </div>
        {/* Save modal */}
        {saveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-dark mb-1">Save this dish</h2>
              <p className="text-sm text-gray-500 mb-5">
                <span className="font-medium text-gray-800">{saveModal.dishName}</span>
                {" · "}{saveModal.cityName}, {saveModal.country}
              </p>

              {/* Destination toggle */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setSaveDestination("wishlist")}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    saveDestination === "wishlist"
                      ? "border-primary bg-purple-50 text-primary"
                      : "border-gray-200 text-gray-600 hover:border-purple-200"
                  }`}
                >
                  <span className="text-xl">⭐</span>
                  <span>Wishlist</span>
                  <span className="text-xs font-normal text-gray-400">Plan for later</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaveDestination("trip")}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    saveDestination === "trip"
                      ? "border-primary bg-purple-50 text-primary"
                      : "border-gray-200 text-gray-600 hover:border-purple-200"
                  }`}
                >
                  <span className="text-xl">🗺️</span>
                  <span>A Trip</span>
                  <span className="text-xs font-normal text-gray-400">Add to itinerary</span>
                </button>
              </div>

              {/* Trip picker */}
              {saveDestination === "trip" && (
                <div className="mb-4">
                  {itineraries.length > 0 ? (
                    <div className="space-y-2 mb-3">
                      {itineraries.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedItineraryId(t.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                            selectedItineraryId === t.id
                              ? "border-primary bg-purple-50 text-primary font-semibold"
                              : "border-gray-200 text-gray-700 hover:border-purple-200"
                          }`}
                        >
                          <span>🗺️</span> {t.name}
                          {selectedItineraryId === t.id && <span className="ml-auto text-xs">✓</span>}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedItineraryId("")}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                          selectedItineraryId === ""
                            ? "border-primary bg-purple-50 text-primary font-semibold"
                            : "border-gray-200 text-gray-500 hover:border-purple-200"
                        }`}
                      >
                        <span>＋</span> New trip…
                        {selectedItineraryId === "" && <span className="ml-auto text-xs">✓</span>}
                      </button>
                    </div>
                  ) : null}
                  {(selectedItineraryId === "" || itineraries.length === 0) && (
                    <input
                      type="text"
                      value={newTripName}
                      onChange={e => setNewTripName(e.target.value)}
                      placeholder="Trip name (e.g. Tokyo 2026)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={saveNotes}
                  onChange={e => setSaveNotes(e.target.value)}
                  placeholder="e.g. try the spicy version, go at lunch…"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={confirmSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
                >
                  {saving ? "Saving…" : saveDestination === "wishlist" ? "⭐ Add to Wishlist" : "🗺️ Add to Trip"}
                </button>
                <button
                  onClick={() => setSaveModal(null)}
                  disabled={saving}
                  className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:border-gray-400 transition-colors"
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
