import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
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

export default function Explore() {
  const { getToken } = useAuth();
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantJobId, setRestaurantJobId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

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
      showToast("error", "Please enter both a city and country");
      return;
    }

    setStage("searching");
    setStatusMessage("Researching local food scene…");
    setDishes([]);
    setCity(null);
    setSelectedDish(null);
    setRestaurants([]);

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/discover`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityInput.trim(), country: countryInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to start discovery");
      const data = await res.json();
      setJobId(data.job_id);

      pollJob(data.job_id, async (job) => {
        // Load dishes from DB
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
        }),
      });
      if (!res.ok) throw new Error("Failed to start restaurant search");
      const data = await res.json();
      setRestaurantJobId(data.job_id);

      pollJob(data.job_id, async (job) => {
        const rPayload = (job.restaurants_payload as Record<string, unknown>) || {};
        const rList = (rPayload.restaurants as Restaurant[]) || [];
        if (rList.length > 0) {
          setRestaurants(rList);
          setStage("restaurants");
        } else {
          // Fall back to direct fetch
          const token2 = await getToken();
          const rRes = await fetch(`${API_URL}/api/dishes/${dish.id}/restaurants`, {
            headers: { Authorization: `Bearer ${token2}` },
          });
          if (rRes.ok) {
            const rData = await rRes.json();
            setRestaurants(rData.restaurants || []);
          }
          setStage("restaurants");
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

  const rankColor = (rank: number) => {
    if (rank === 1) return "bg-violet-400 text-white";
    if (rank === 2) return "bg-gray-300 text-gray-700";
    if (rank === 3) return "bg-purple-300 text-white";
    return "bg-gray-100 text-gray-600";
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

          {/* Search form */}
          <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder="City (e.g. Tokyo)"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg"
              />
              <input
                type="text"
                value={countryInput}
                onChange={(e) => setCountryInput(e.target.value)}
                placeholder="Country (e.g. Japan)"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg"
              />
              <button
                type="submit"
                disabled={stage === "searching" || stage === "loading_restaurants"}
                className="px-8 py-3 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
              >
                {stage === "searching" ? "Searching…" : "Discover"}
              </button>
            </div>
          </form>

          {/* Loading state */}
          {(stage === "searching" || stage === "loading_restaurants") && (
            <div className="bg-white rounded-lg shadow p-12 text-center mb-8">
              <div className="text-4xl mb-4 animate-strong-pulse">🤖</div>
              <p className="text-lg font-medium text-gray-700 mb-2">{statusMessage}</p>
              <p className="text-sm text-gray-500">Our AI is researching — usually takes 20-40 seconds</p>
              <div className="flex justify-center gap-2 mt-4">
                <div className="w-2 h-2 bg-primary rounded-full animate-strong-pulse" />
                <div className="w-2 h-2 bg-primary rounded-full animate-strong-pulse" style={{ animationDelay: "0.3s" }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-strong-pulse" style={{ animationDelay: "0.6s" }} />
              </div>
            </div>
          )}

          {/* Dishes */}
          {(stage === "dishes" || stage === "restaurants" || stage === "loading_restaurants") && city && dishes.length > 0 && (
            <div className="mb-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-dark">
                  Must-try dishes in {city.name}, {city.country}
                </h2>
                {city.description && <p className="text-gray-600 mt-1">{city.description}</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {dishes.map((dish) => (
                  <div
                    key={dish.id}
                    onClick={() => handleDishClick(dish)}
                    className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                      selectedDish?.id === dish.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${rankColor(dish.rank)}`}>
                        {dish.rank}
                      </span>
                      {dish.in_passport && <span title="In your passport" className="text-lg">🛂</span>}
                    </div>
                    <h3 className="font-semibold text-dark mb-1">{dish.name}</h3>
                    {dish.cuisine_type && (
                      <p className="text-xs text-gray-500 mb-2">{dish.cuisine_type}</p>
                    )}
                    <p className="text-sm text-gray-600 line-clamp-3">{dish.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {dish.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{tag}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDishClick(dish); }}
                        className="flex-1 text-xs py-1.5 bg-primary text-white rounded hover:bg-purple-700 transition-colors"
                      >
                        Find places →
                      </button>
                      {!dish.in_passport && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddToPassport(dish); }}
                          className="text-xs px-2 py-1.5 border border-gray-300 text-gray-600 rounded hover:border-primary hover:text-primary transition-colors"
                          title="Add to passport"
                        >
                          🛂
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Restaurants */}
          {stage === "restaurants" && selectedDish && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-dark">
                    Best places for {selectedDish.name}
                  </h2>
                  <p className="text-gray-500 text-sm mt-1">AI-ranked by rating, reviews & local reputation</p>
                </div>
                <button
                  onClick={() => { setStage("dishes"); setSelectedDish(null); setRestaurants([]); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to dishes
                </button>
              </div>

              {restaurants.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No restaurants found yet.</p>
              ) : (
                <div className="space-y-4">
                  {restaurants.map((r) => (
                    <div key={r.id || r.rank} className="flex items-start gap-4 p-4 rounded-lg border border-gray-100 hover:border-primary transition-colors">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${rankColor(r.rank)}`}>
                        {r.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-dark">{r.name}</h3>
                            {r.address && <p className="text-sm text-gray-500 mt-0.5">{r.address}</p>}
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
                            {r.price_level && <p className="text-gray-500 text-sm">{r.price_level}</p>}
                          </div>
                        </div>
                        {r.rank_rationale && (
                          <p className="text-sm text-gray-600 mt-2 italic">{r.rank_rationale}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.highlights.slice(0, 4).map((h, i) => (
                            <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs">{h}</span>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-3">
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
                          {!selectedDish.in_passport && (
                            <button
                              onClick={() => handleAddToPassport(selectedDish)}
                              className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                            >
                              🛂 Add to Passport
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Layout>
    </>
  );
}
