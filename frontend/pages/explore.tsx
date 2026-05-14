import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import Layout from "../components/Layout";
import CityAutocomplete from "../components/CityAutocomplete";

const ItineraryMap = dynamic(() => import("../components/ItineraryMap"), { ssr: false });
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import { DIETARY_OPTIONS, parseDietaryPrefs } from "../lib/dietary";
import Portal from "../components/Portal";
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

interface City {
  id: string;
  name: string;
  country: string;
  description: string | null;
}

type Stage = "idle" | "searching" | "dishes" | "loading_restaurants" | "restaurants";
type LocationMode = "city" | "nearby";

type SearchMode = "local" | "world_cuisine" | "occasion";

const WORLD_CUISINES = [
  { id: "Japanese",       label: "Japanese",       emoji: "🍣" },
  { id: "Italian",        label: "Italian",        emoji: "🍝" },
  { id: "Chinese",        label: "Chinese",        emoji: "🥟" },
  { id: "French",         label: "French",         emoji: "🥐" },
  { id: "Mexican",        label: "Mexican",        emoji: "🌮" },
  { id: "Indian",         label: "Indian",         emoji: "🍛" },
  { id: "Thai",           label: "Thai",           emoji: "🍜" },
  { id: "Spanish",        label: "Spanish",        emoji: "🥘" },
  { id: "Greek",          label: "Greek",          emoji: "🫒" },
  { id: "Turkish",        label: "Turkish",        emoji: "🥙" },
  { id: "Lebanese",       label: "Lebanese",       emoji: "🧆" },
  { id: "Korean",         label: "Korean",         emoji: "🥩" },
  { id: "Vietnamese",     label: "Vietnamese",     emoji: "🍲" },
  { id: "Peruvian",       label: "Peruvian",       emoji: "🐟" },
  { id: "American",       label: "American",       emoji: "🍔" },
  { id: "Brazilian",      label: "Brazilian",      emoji: "🥩" },
  { id: "Argentinian",    label: "Argentinian",    emoji: "🥩" },
  { id: "Ethiopian",      label: "Ethiopian",      emoji: "🫓" },
  { id: "Moroccan",       label: "Moroccan",       emoji: "🫕" },
  { id: "Indonesian",     label: "Indonesian",     emoji: "🍚" },
  { id: "Malaysian",      label: "Malaysian",      emoji: "🥗" },
  { id: "Portuguese",     label: "Portuguese",     emoji: "🐟" },
  { id: "German",         label: "German",         emoji: "🥨" },
  { id: "Polish",         label: "Polish",         emoji: "🥟" },
  { id: "Israeli",        label: "Israeli",        emoji: "🧆" },
  { id: "Georgian",       label: "Georgian",       emoji: "🫓" },
  { id: "Filipino",       label: "Filipino",       emoji: "🍖" },
  { id: "Caribbean",      label: "Caribbean",      emoji: "🌶️" },
  { id: "Scandinavian",   label: "Scandinavian",   emoji: "🐟" },
  { id: "Middle Eastern", label: "Middle Eastern", emoji: "🫙" },
  { id: "African",        label: "African",        emoji: "🌍" },
  { id: "Fusion",         label: "Fusion",         emoji: "✨" },
];

const OCCASIONS = [
  { id: "Brunch",          label: "Brunch",          emoji: "🥞" },
  { id: "Breakfast",       label: "Breakfast",       emoji: "🌅" },
  { id: "Late night",      label: "Late night",      emoji: "🌃" },
  { id: "Street food",     label: "Street food",     emoji: "🥡" },
  { id: "Fine dining",     label: "Fine dining",     emoji: "🕯️" },
  { id: "Tasting menu",    label: "Tasting menu",    emoji: "🍽️" },
  { id: "Food market",     label: "Food market",     emoji: "🛒" },
  { id: "Rooftop",         label: "Rooftop",         emoji: "🏙️" },
  { id: "Waterfront",      label: "Waterfront",      emoji: "⛵" },
  { id: "Hidden gem",      label: "Hidden gem",      emoji: "💎" },
  { id: "Natural wine bar",label: "Natural wine",    emoji: "🍷" },
  { id: "Craft beer",      label: "Craft beer",      emoji: "🍺" },
  { id: "Cocktail bar",    label: "Cocktail bar",    emoji: "🍸" },
];

const EATING_OCCASIONS = OCCASIONS.filter(
  o => !["Natural wine bar", "Craft beer", "Cocktail bar"].includes(o.id)
);

export default function Explore() {
  const { getToken } = useAuth();
  const { isLoaded: isUserLoaded } = useUser();
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const handleCitySelect = useCallback((city: string, country: string) => {
    setCityInput(city);
    setCountryInput(country);
    // user manually picked a city — drop GPS coords so they don't bias restaurant search
    setGeoCoords(null);
    setLocationMode("city");
  }, []);
  const [searchMode, setSearchMode] = useState<SearchMode>("local");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<string[]>([]);
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
  const [savedRestaurantIds, setSavedRestaurantIds] = useState<Set<string>>(new Set());
  const [focusCoords, setFocusCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [highlightedRestaurantId, setHighlightedRestaurantId] = useState<string | null>(null);
  const [cityKey, setCityKey] = useState(0);
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null);
  const [surpriseMode, setSurpriseMode] = useState(false);
  const [isSurpriseResult, setIsSurpriseResult] = useState(false);

  // Near-me state
  const [locationMode, setLocationMode] = useState<LocationMode>("city");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLabel, setGeoLabel] = useState<string>("");
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "ready" | "denied">("idle");
  const [radiusKm, setRadiusKm] = useState<number>(5);

  // Save-to modal state
  const [saveModal, setSaveModal] = useState<{
    dishId: string | null;
    dishName: string;
    cityName: string;
    country: string;
    restaurantId?: string;
    categoryType?: "world_cuisine" | "occasion";
  } | null>(null);
  const [saveNotes, setSaveNotes] = useState("");
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>("");
  const [newListName, setNewListName] = useState("");
  const [itineraries, setItineraries] = useState<{id: string; name: string}[]>([]);
  const [saving, setSaving] = useState(false);

  // Load user prefs + itinerary dish IDs + itineraries once auth ready
  useEffect(() => {
    if (!isUserLoaded) return;
    getToken().then(async token => {
      if (!token) return;
      const [userRes, itineraryRes, itinerariesRes] = await Promise.all([
        fetch(`${API_URL}/api/user`,        { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/itinerary`,   { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/itineraries`, { headers: { Authorization: `Bearer ${token}` } }),
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
    }).catch(() => { /* silent */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollInterval) clearInterval(pollInterval); }, [pollInterval]);

  const stopPolling = () => {
    if (pollInterval) { clearInterval(pollInterval); setPollInterval(null); }
  };

  const requestLocation = () => {
    if (geoCoords) {
      // already have coords — just re-apply
      setLocationMode("nearby");
      return;
    }
    if (!navigator.geolocation) {
      showToast("error", "Your browser doesn't support geolocation.");
      return;
    }
    setGeoStatus("locating");
    setLocationMode("nearby");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoCoords({ lat: latitude, lng: longitude });
        // Reverse geocode to get city name for the city input
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const cityName = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
          const countryName = data.address?.country || "";
          if (cityName) {
            setCityInput(cityName);
            setCountryInput(countryName);
            setCityKey(k => k + 1);
          }
          setGeoLabel(cityName ? `${cityName}${countryName ? `, ${countryName}` : ""}` : "your location");
        } catch {
          setGeoLabel("your location");
        }
        setGeoStatus("ready");
      },
      () => {
        setGeoStatus("denied");
        setLocationMode("city");
        showToast("error", "Location access denied. Please allow it in your browser settings.");
      },
      { timeout: 10000 }
    );
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

  const runSearch = async (opts: {
    city: string;
    country: string;
    mode: SearchMode;
    category: string | null;
    dietary: string[];
    price: string[];
    latitude?: number | null;
    longitude?: number | null;
    radiusKm?: number;
  }) => {
    setDishes([]);
    setCity(null);
    setSelectedDish(null);
    setRestaurants([]);
    setFocusCoords(null);
    setHighlightedRestaurantId(null);
    setTimeout(() => loadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    if (opts.mode !== "local") {
      if (!opts.category) {
        showToast("error", opts.mode === "world_cuisine" ? "Please select a cuisine" : "Please select an occasion");
        return;
      }
      const allCats = opts.mode === "world_cuisine" ? WORLD_CUISINES : OCCASIONS;
      const cat = allCats.find(c => c.id === opts.category);
      const catName = cat ? `${cat.emoji} ${cat.label}` : opts.category;
      setCategoryLabel(catName);
      setStage("loading_restaurants");
      setStatusMessage(`Finding the best ${cat?.label || opts.category} spots in ${opts.city}…`);
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/rank-by-category`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            category: cat?.label || opts.category,
            category_type: opts.mode,
            city: opts.city,
            country: opts.country,
            dietary_preferences: opts.dietary,
            price_range: opts.price,
            ...(opts.latitude != null && opts.longitude != null
              ? { latitude: opts.latitude, longitude: opts.longitude, radius_km: opts.radiusKm ?? 3 }
              : {}),
          }),
        });
        if (!res.ok) throw new Error("Failed to start category search");
        const data = await res.json();
        pollJob(data.job_id, async (job) => {
          const rPayload = (job.restaurants_payload as Record<string, unknown>) || {};
          const rList = (rPayload.restaurants as Restaurant[]) || [];
          setRestaurants([...rList].sort((a, b) => a.rank - b.rank));
          setStage("restaurants");
        });
      } catch {
        showToast("error", "Failed to start search. Please try again.");
        setStage("idle");
      }
      return;
    }

    setStage("searching");
    setStatusMessage("Exploring the local food scene…");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/discover`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          city: opts.city,
          country: opts.country,
          dietary_preferences: opts.dietary,
          meal_time: null,
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSurpriseMode(false);
    setIsSurpriseResult(false);
    if (geoStatus === "locating") return;
    if (locationMode === "nearby" && !geoCoords) {
      requestLocation();
      return;
    }
    if (!cityInput.trim()) {
      showToast("error", "Please select a city from the list");
      return;
    }
    await runSearch({
      city: cityInput.trim(),
      country: countryInput.trim(),
      mode: searchMode,
      category: selectedCategory,
      dietary: useMyPrefs ? dietaryPrefs : customPrefs,
      price: priceRange,
      latitude: geoCoords?.lat ?? null,
      longitude: geoCoords?.lng ?? null,
      radiusKm,
    });
  };


  // When surpriseMode is on and dishes arrive, auto-click the top dish
  useEffect(() => {
    if (surpriseMode && stage === "dishes" && dishes.length > 0) {
      const topDish = [...dishes].sort((a, b) => a.rank - b.rank)[0];
      setSurpriseMode(false);
      setIsSurpriseResult(true);
      handleDishClick(topDish);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surpriseMode, stage, dishes]);

  const handleSurpriseMe = async () => {
    if (stage === "searching" || stage === "loading_restaurants") return;
    if (geoStatus === "locating") return;
    if (locationMode === "nearby" && !geoCoords) {
      requestLocation();
      return;
    }
    if (!cityInput.trim()) {
      showToast("error", "Please select a city or use Near me — Surprise Me will pick a dish and restaurant for you!");
      return;
    }

    // 50% local dishes, 25% world cuisine, 25% occasion
    const roll = Math.random();
    let randomMode: SearchMode;
    let randomCategory: string | null = null;

    if (roll < 0.5) {
      randomMode = "local";
    } else if (roll < 0.75) {
      randomMode = "world_cuisine";
      randomCategory = WORLD_CUISINES[Math.floor(Math.random() * WORLD_CUISINES.length)].id;
    } else {
      randomMode = "occasion";
      randomCategory = EATING_OCCASIONS[Math.floor(Math.random() * EATING_OCCASIONS.length)].id;
    }

    setSearchMode(randomMode);
    setSelectedCategory(randomCategory);
    setIsSurpriseResult(false);

    if (randomMode === "local") {
      setSurpriseMode(true);
      await runSearch({
        city: cityInput.trim(),
        country: countryInput.trim(),
        mode: "local",
        category: null,
        dietary: useMyPrefs ? dietaryPrefs : customPrefs,
        price: priceRange,
        latitude: geoCoords?.lat ?? null,
        longitude: geoCoords?.lng ?? null,
        radiusKm,
      });
    } else {
      setIsSurpriseResult(true);
      await runSearch({
        city: cityInput.trim(),
        country: countryInput.trim(),
        mode: randomMode,
        category: randomCategory,
        dietary: useMyPrefs ? dietaryPrefs : customPrefs,
        price: priceRange,
        latitude: geoCoords?.lat ?? null,
        longitude: geoCoords?.lng ?? null,
        radiusKm,
      });
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
          price_range: priceRange,
          ...(geoCoords ? { latitude: geoCoords.lat, longitude: geoCoords.lng, radius_km: radiusKm } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to start restaurant search");
      const data = await res.json();
      pollJob(data.job_id, async (job) => {
        const rPayload = (job.restaurants_payload as Record<string, unknown>) || {};
        const rList = (rPayload.restaurants as Restaurant[]) || [];
        const sortByRank = (list: Restaurant[]) =>
          [...list].sort((a, b) => a.rank - b.rank);
        if (rList.length > 0) {
          setRestaurants(sortByRank(rList));
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
            setRestaurants(sortByRank(rData.restaurants || []));
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

  const openSaveModal = (dish: Dish | null, overrideCityName?: string, overrideCountry?: string, restaurantId?: string) => {
    const dishName = dish ? dish.name : (categoryLabel || `Food in ${cityInput}`);
    const cName = overrideCityName ?? city?.name ?? cityInput;
    const cCountry = overrideCountry ?? city?.country ?? countryInput;
    if (!dishName || !cName || !cCountry) return;
    setSaveNotes("");
    setSelectedItineraryId(itineraries[0]?.id ?? "");
    setNewListName("");
    const categoryType = !dish && searchMode !== "local"
      ? (searchMode as "world_cuisine" | "occasion")
      : undefined;
    setSaveModal({ dishId: dish?.id ?? null, dishName, cityName: cName, country: cCountry, restaurantId, categoryType });
  };

  const confirmSave = async () => {
    if (!saveModal) return;
    setSaving(true);
    try {
      const token = await getToken();
      // Strip emoji and leading/trailing whitespace for DB keys on category items
      const dbDishName = saveModal.dishName.replace(/\p{Emoji_Presentation}\s*/gu, "").trim();
      const baseBody = saveModal.dishId
        ? { dish_id: saveModal.dishId, restaurant_id: saveModal.restaurantId || undefined, notes: saveNotes || undefined }
        : { dish_name: dbDishName, city_name: saveModal.cityName, country: saveModal.country, restaurant_id: saveModal.restaurantId || undefined, notes: saveNotes || undefined, category_type: saveModal.categoryType };

      let itineraryId = selectedItineraryId;

      if (!itineraryId) {
        const name = newListName.trim() || "My List";
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
      if (saveModal.dishId) setItineraryDishIds(prev => new Set([...prev, saveModal.dishId!]));
      if (saveModal.restaurantId) setSavedRestaurantIds(prev => new Set([...prev, saveModal.restaurantId!]));
      const listName = itineraries.find(t => t.id === itineraryId)?.name ?? (newListName.trim() || "list");
      showToast("success", `"${saveModal.dishName}" added to "${listName}"!`);

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

  const RANK_COLORS = ["#7c3aed", "#9333ea", "#a855f7", "#c084fc", "#e9d5ff"];
  const rankColor = (rank: number) => RANK_COLORS[(rank - 1) % RANK_COLORS.length];

  // Build map items from current restaurants list
  const mapItems = restaurants
    .filter(r => r.latitude != null && r.longitude != null)
    .map(r => ({
      id: r.id,
      dish_id: null as string | null,
      dish_name: r.name,
      city_name: cityInput,
      country: countryInput,
      notes: null as string | null,
      dish_description: r.rank_rationale ?? null,
      cuisine_type: null as string | null,
      tags: [] as string[],
      dish_rank: null as number | null,
      city_id: null as string | null,
      eaten_count: 0,
      created_at: "",
      latitude: r.latitude,
      longitude: r.longitude,
      restaurant_ids: [] as string[],
      restaurant_name: r.name,
      restaurant_id: r.id,
      color: rankColor(r.rank),
    }));

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

            {/* Step 1 — mode selector: Local Dishes prominent, two secondaries below */}
            <div className="flex flex-col gap-2 mb-5">
              {/* Primary — Local Dishes */}
              <button
                type="button"
                onClick={() => { setSearchMode("local"); setSelectedCategory(null); }}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 font-semibold text-left transition-all ${
                  searchMode === "local"
                    ? "border-primary bg-purple-50 text-primary"
                    : "border-gray-200 text-gray-700 hover:border-purple-200 hover:bg-gray-50"
                }`}
              >
                <span className="text-3xl">🌍</span>
                <div>
                  <div className="font-bold text-base leading-tight">Local dishes</div>
                  <div className="text-sm font-normal text-gray-500 mt-0.5">Discover the soul of the city — top 5 must-try dishes</div>
                </div>
                {searchMode === "local" && <span className="ml-auto text-primary text-sm">✓</span>}
              </button>

              {/* Secondary — World Cuisine + Occasion side by side */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { mode: "world_cuisine" as SearchMode, emoji: "✈️", title: "World cuisine", sub: "Foreign food in this city" },
                  { mode: "occasion" as SearchMode,      emoji: "☀️", title: "Occasion",       sub: "Brunch, rooftop, fine dining…" },
                ] as { mode: SearchMode; emoji: string; title: string; sub: string }[]).map(opt => (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => { setSearchMode(opt.mode); setSelectedCategory(null); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 font-semibold text-left transition-all ${
                      searchMode === opt.mode
                        ? "border-primary bg-purple-50 text-primary"
                        : "border-gray-200 text-gray-700 hover:border-purple-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-xl">{opt.emoji}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight">{opt.title}</div>
                      <div className="text-xs font-normal text-gray-500 hidden sm:block mt-0.5">{opt.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 — cuisine carousel */}
            {searchMode === "world_cuisine" && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select a cuisine</p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                  {WORLD_CUISINES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(prev => prev === cat.id ? null : cat.id)}
                      className={`flex-shrink-0 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-xs font-medium transition-all w-20 ${
                        selectedCategory === cat.id
                          ? "border-primary bg-purple-50 text-primary"
                          : "border-gray-100 text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-2xl">{cat.emoji}</span>
                      <span className="text-center leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2 — occasion carousel */}
            {searchMode === "occasion" && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select an occasion</p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                  {OCCASIONS.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(prev => prev === cat.id ? null : cat.id)}
                      className={`flex-shrink-0 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-xs font-medium transition-all w-20 ${
                        selectedCategory === cat.id
                          ? "border-primary bg-purple-50 text-primary"
                          : "border-gray-100 text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-2xl">{cat.emoji}</span>
                      <span className="text-center leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price range */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Price range <span className="normal-case font-normal text-gray-300">(optional — select one or more)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: "$",    label: "Budget",      sub: "Street food, casual" },
                  { id: "$$",   label: "Moderate",    sub: "Neighbourhood restaurant" },
                  { id: "$$$",  label: "Upscale",     sub: "Smart casual" },
                  { id: "$$$$", label: "Fine dining",  sub: "Tasting menus" },
                ] as { id: string; label: string; sub: string }[]).map(tier => {
                  const active = priceRange.includes(tier.id);
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setPriceRange(prev =>
                        prev.includes(tier.id) ? prev.filter(p => p !== tier.id) : [...prev, tier.id]
                      )}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                        active
                          ? "border-primary bg-purple-50 text-primary"
                          : "border-gray-200 text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-bold">{tier.id}</span>
                      <span className="text-xs font-normal hidden sm:inline">{tier.label}</span>
                      {active && <span className="text-primary text-xs">✓</span>}
                    </button>
                  );
                })}
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
            {/* Location mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setLocationMode("city")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                  locationMode === "city"
                    ? "border-primary bg-purple-50 text-primary"
                    : "border-gray-200 text-gray-600 hover:border-purple-200"
                }`}
              >
                🌍 A city
              </button>
              <button
                type="button"
                onClick={requestLocation}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                  locationMode === "nearby"
                    ? "border-primary bg-purple-50 text-primary"
                    : "border-gray-200 text-gray-600 hover:border-purple-200"
                }`}
              >
                {geoStatus === "locating" ? (
                  <span className="animate-pulse">Locating…</span>
                ) : (
                  <>📍 Near me</>
                )}
              </button>
            </div>

            {locationMode === "nearby" && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Radius</span>
                {([1, 3, 5, 10] as const).map(km => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => setRadiusKm(km)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                      radiusKm === km
                        ? "border-primary bg-purple-50 text-primary"
                        : "border-gray-200 text-gray-500 hover:border-purple-200"
                    }`}
                  >
                    &lt;{km} km
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {locationMode === "nearby" ? (
                geoStatus === "locating" ? (
                  <div className="flex-1 flex items-center px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500 animate-pulse">
                    Detecting your location…
                  </div>
                ) : geoLabel ? (
                  <div className="flex-1 flex items-center gap-2 px-4 py-3 border border-blue-200 rounded-lg bg-blue-50 text-sm text-blue-700">
                    📍 {geoLabel}
                    <button
                      type="button"
                      onClick={() => { setLocationMode("city"); setGeoCoords(null); setGeoStatus("idle"); setGeoLabel(""); }}
                      className="ml-auto text-blue-400 hover:text-blue-600 text-xs underline"
                    >
                      Change
                    </button>
                  </div>
                ) : null
              ) : (
                <CityAutocomplete
                  key={cityKey}
                  initialValue={cityInput}
                  onSelect={handleCitySelect}
                  disabled={stage === "searching" || stage === "loading_restaurants"}
                />
              )}
              <div className="flex gap-3 sm:contents">
                <button
                  type="submit"
                  disabled={stage === "searching" || stage === "loading_restaurants" || geoStatus === "locating"}
                  className="flex-1 sm:flex-none px-6 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-base sm:text-lg transition-colors"
                >
                  {stage === "searching" || stage === "loading_restaurants" ? "Searching…" : searchMode === "local" ? "Discover" : "Find restaurants"}
                </button>
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  disabled={stage === "searching" || stage === "loading_restaurants" || geoStatus === "locating"}
                  title="Pick a random dish and find the best restaurant for you"
                  className="flex-1 sm:flex-none px-5 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-lg hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-base sm:text-lg transition-all shadow-sm"
                >
                  🎲 Surprise me
                </button>
              </div>
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
                {stage === "loading_restaurants" && (activeDiscoverPrefs.length > 0 || priceRange.length > 0 || geoCoords) && (
                  <div className="mt-4 flex flex-wrap justify-center items-center gap-2">
                    <span className="text-xs text-gray-400">Applying:</span>
                    {geoCoords && (
                      <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium border border-blue-100">
                        📍 Near you
                      </span>
                    )}
                    {priceRange.map(p => (
                      <span key={p} className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full font-medium border border-amber-100">
                        {p}
                      </span>
                    ))}
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
                          <button
                            onClick={(e) => { e.stopPropagation(); openSaveModal(dish); }}
                            className={`text-xs px-4 py-2 rounded-lg transition-colors text-center ${
                              itineraryDishIds.has(dish.id)
                                ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                                : "border border-gray-200 text-gray-500 hover:border-amber-400 hover:text-amber-600"
                            }`}
                            title="Save to list"
                          >
                            {itineraryDishIds.has(dish.id) ? "✓ Saved" : "🗺️ Save"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Restaurants */}
          {stage === "restaurants" && (selectedDish || searchMode !== "local") && (
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

              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-dark mb-0.5">
                    {selectedDish
                      ? `Where locals go for ${selectedDish.name}`
                      : locationMode === "nearby" && geoLabel
                        ? `Best ${categoryLabel} near ${geoLabel}`
                        : `Best ${categoryLabel} in ${cityInput}`}
                  </h2>
                  <p className="text-gray-400 text-xs">Chosen using local reviews, reputation, and food expertise</p>
                </div>
                <button
                  onClick={() => {
                    if (searchMode !== "local") { setStage("idle"); setRestaurants([]); setFocusCoords(null); setHighlightedRestaurantId(null); }
                    else { setStage("dishes"); setSelectedDish(null); setRestaurants([]); setFocusCoords(null); setHighlightedRestaurantId(null); }
                  }}
                  className="flex-shrink-0 text-sm text-gray-500 hover:text-gray-700 mt-1"
                >
                  ← Back
                </button>
              </div>

              {restaurants.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No restaurants found yet.</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* Map */}
                  <div className="lg:col-span-2 bg-white rounded-xl shadow overflow-hidden" style={{ height: 300 }}>
                    <ItineraryMap
                      items={mapItems}
                      onPinClick={item => {
                        setHighlightedRestaurantId(item.restaurant_id ?? null);
                        if (item.latitude != null && item.longitude != null) {
                          setFocusCoords({ lat: item.latitude, lng: item.longitude });
                        }
                        document.getElementById(`r-card-${item.restaurant_id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                      selectedItem={null}
                      focusCoords={focusCoords}
                      highlightedRestaurantId={highlightedRestaurantId}
                    />
                  </div>

                  {/* Restaurant list — uncapped on mobile (natural scroll), capped on desktop */}
                  <div className="lg:col-span-1 space-y-3 lg:overflow-y-auto lg:max-h-[400px]">
                    {restaurants.map((r) => {
                      const isSurprisePick = isSurpriseResult && r.rank === 1;
                      const badge = isSurprisePick ? "Surprise!" : getRestaurantBadge(r);
                      const badgeStyle: Record<string, string> = {
                        "Surprise!":            "bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold",
                        "Hidden gem":           "bg-emerald-50 text-emerald-700",
                        "Popular with locals":  "bg-amber-50 text-amber-700",
                        "Neighborhood favorite":"bg-orange-50 text-orange-700",
                        "Tourist-heavy":        "bg-gray-100 text-gray-500",
                        "Top pick":             "bg-violet-50 text-violet-700",
                      };
                      const isHighlighted = highlightedRestaurantId === r.id;
                      return (
                        <div
                          key={r.id || r.rank}
                          id={`r-card-${r.id}`}
                          onClick={() => {
                            const next = isHighlighted ? null : r.id;
                            setHighlightedRestaurantId(next);
                            if (!isHighlighted && r.latitude != null && r.longitude != null) {
                              setFocusCoords({ lat: r.latitude, lng: r.longitude });
                            }
                          }}
                          className={`rounded-xl border cursor-pointer transition-all overflow-hidden ${
                            isSurprisePick && !isHighlighted
                              ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/30"
                              : isHighlighted
                                ? "border-primary ring-1 ring-primary bg-purple-50"
                                : "border-gray-100 hover:border-primary hover:shadow-sm bg-white"
                          }`}
                        >
                          {/* Photo */}
                          {r.photo_url && (
                            <div className="w-full h-28 overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={r.photo_url}
                                alt={r.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}

                          <div className="p-3">
                          {/* color accent + header */}
                          <div className="flex items-start gap-2 mb-1">
                            <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: rankColor(r.rank) }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h3 className="font-bold text-dark text-sm leading-snug">{r.name}</h3>
                                  {badge && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${badgeStyle[badge] ?? "bg-gray-100 text-gray-600"}`}>
                                      {badge}
                                    </span>
                                  )}
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  {r.google_rating && (
                                    <div className="flex items-center gap-0.5">
                                      <span className="text-violet-500 text-xs">★</span>
                                      <span className="font-semibold text-xs">{r.google_rating}</span>
                                    </div>
                                  )}
                                  {r.price_level && (
                                    <span className={`text-xs font-medium ${
                                      priceRange.length > 0 && priceRange.includes(r.price_level)
                                        ? "text-amber-600"
                                        : "text-gray-400"
                                    }`}>{r.price_level}</span>
                                  )}
                                </div>
                              </div>
                              {r.address && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{r.address}</p>}
                              {r.rank_rationale && (
                                <p className="text-xs text-gray-500 italic mt-1 line-clamp-2">&ldquo;{r.rank_rationale}&rdquo;</p>
                              )}
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {r.highlights.slice(0, 3).map((h, i) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">{h}</span>
                                ))}
                              </div>
                              <div className="mt-2 flex gap-2 flex-wrap">
                                <button
                                  onClick={e => { e.stopPropagation(); setDetailRestaurant(r); }}
                                  className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-lg hover:border-primary hover:text-primary transition-colors">
                                  Details →
                                </button>
                                {savedRestaurantIds.has(r.id) ? (
                                  <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg border border-green-200 font-medium">✓ Saved</span>
                                ) : (
                                  <button
                                    onClick={e => { e.stopPropagation(); openSaveModal(selectedDish, cityInput.trim(), countryInput.trim(), r.id); }}
                                    className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200 transition-colors">
                                    🗺️ Save
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          </div>{/* /p-3 */}
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}
            </div>
          )}

        </div>
        {/* Restaurant detail modal */}
        {detailRestaurant && (
          <Portal>
            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 px-4" onClick={() => setDetailRestaurant(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Photo */}
                {detailRestaurant.photo_url && (
                  <div className="w-full h-52 flex-shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detailRestaurant.photo_url} alt={detailRestaurant.name} className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="p-6 overflow-y-auto">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: rankColor(detailRestaurant.rank) }} />
                      <h2 className="text-xl font-bold text-dark leading-snug">{detailRestaurant.name}</h2>
                    </div>
                    <button onClick={() => setDetailRestaurant(null)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">✕</button>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    {detailRestaurant.google_rating && (
                      <span className="flex items-center gap-1 text-sm font-semibold text-violet-600">
                        {"★".repeat(Math.round(detailRestaurant.google_rating))}
                        <span className="text-gray-700 ml-0.5">{detailRestaurant.google_rating}</span>
                        {detailRestaurant.review_count && (
                          <span className="text-gray-400 font-normal text-xs ml-0.5">({detailRestaurant.review_count.toLocaleString()})</span>
                        )}
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
                    <p className="text-sm text-gray-600 italic mb-4 leading-relaxed">&ldquo;{detailRestaurant.rank_rationale}&rdquo;</p>
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
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">What people say</p>
                      <div className="space-y-2">
                        {detailRestaurant.reviews.map((rev, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-700">{rev.author}</span>
                              {rev.rating && <span className="text-violet-400 text-xs">{"★".repeat(Math.round(rev.rating))}</span>}
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed">{rev.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    {detailRestaurant.google_maps_url && (
                      <a href={detailRestaurant.google_maps_url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center text-sm px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition-colors">
                        📍 Open in Maps
                      </a>
                    )}
                    {savedRestaurantIds.has(detailRestaurant.id) ? (
                      <span className="flex-1 text-center text-sm px-4 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200 font-medium">✓ Saved</span>
                    ) : (
                      <button
                        onClick={() => { setDetailRestaurant(null); openSaveModal(selectedDish, cityInput.trim(), countryInput.trim(), detailRestaurant.id); }}
                        className="flex-1 text-sm px-4 py-3 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200 font-medium transition-colors">
                        🗺️ Save to list
                      </button>
                    )}
                    <button onClick={() => setDetailRestaurant(null)}
                      className="sm:flex-none text-sm px-4 py-3 border border-gray-200 text-gray-600 rounded-lg hover:border-gray-300 transition-colors">
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* Save modal */}
        {saveModal && (
          <Portal>
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-lg font-bold text-dark mb-1">Save this dish</h2>
              <p className="text-sm text-gray-500 mb-5">
                <span className="font-medium text-gray-800">{saveModal.dishName}</span>
                {" · "}{saveModal.cityName}, {saveModal.country}
              </p>

              {/* List picker */}
              <div className="mb-4">
                {itineraries.length > 0 ? (
                  <div className="space-y-1.5 mb-3">
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
                        📋 {t.name}
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
                      <span>＋</span> New list…
                      {selectedItineraryId === "" && <span className="ml-auto text-xs">✓</span>}
                    </button>
                  </div>
                ) : null}
                {(selectedItineraryId === "" || itineraries.length === 0) && (
                  <input
                    type="text"
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    placeholder="e.g. Tokyo 2026, Japan wishlist…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>

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
                  {saving ? "Saving…" : "＋ Save to list"}
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
          </Portal>
        )}
      </Layout>
    </>
  );
}
