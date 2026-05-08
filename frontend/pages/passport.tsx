import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import Link from "next/link";
import Head from "next/head";

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
}

interface Stats {
  total_dishes: number;
  cities_visited: number;
  cuisine_types: number;
  avg_rating: number | null;
}

const DIETARY_OPTIONS = [
  { id: "vegetarian",   label: "Vegetarian",          emoji: "🥦" },
  { id: "vegan",        label: "Vegan",                emoji: "🌱" },
  { id: "gluten-free",  label: "Celiac / Gluten-free", emoji: "🌾" },
  { id: "dairy-free",   label: "Dairy-free",           emoji: "🥛" },
  { id: "halal",        label: "Halal",                emoji: "☪️" },
  { id: "kosher",       label: "Kosher",               emoji: "✡️" },
  { id: "nut-free",     label: "Nut-free",             emoji: "🥜" },
  { id: "no-pork",      label: "No pork",              emoji: "🐷" },
];

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

  const load = async () => {
    try {
      const token = await getToken();
      const [passportRes, userRes] = await Promise.all([
        fetch(`${API_URL}/api/passport`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/user`,     { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (passportRes.ok) {
        const data = await passportRes.json();
        setEntries(data.entries || []);
        setStats(data.stats);
      }
      if (userRes.ok) {
        const userData = await userRes.json();
        const raw = userData.user?.dietary_notes;
        try { setDietaryPrefs(raw ? JSON.parse(raw) : []); } catch { setDietaryPrefs([]); }
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isUserLoaded) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded]);

  const toggleDietaryPref = async (id: string) => {
    const next = dietaryPrefs.includes(id)
      ? dietaryPrefs.filter(p => p !== id)
      : [...dietaryPrefs, id];
    setDietaryPrefs(next);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/api/user`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dietary_notes: JSON.stringify(next) }),
      });
      showToast("success", "Preferences saved");
    } catch {
      showToast("error", "Failed to save preferences.");
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

  const groupByCityCountry = () => {
    const groups: Record<string, { city: string; country: string; entries: PassportEntry[] }> = {};
    entries.forEach((e) => {
      const key = `${e.city_name}|${e.country}`;
      if (!groups[key]) groups[key] = { city: e.city_name, country: e.country, entries: [] };
      groups[key].entries.push(e);
    });
    return Object.values(groups);
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
              <div className="bg-white rounded-lg shadow p-5 text-center">
                <p className="text-3xl font-bold text-accent">
                  {stats.avg_rating ? `${Number(stats.avg_rating).toFixed(1)}★` : "—"}
                </p>
                <p className="text-sm text-gray-500">Avg. Rating</p>
              </div>
            </div>
          )}

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
            <div className="space-y-8">
              {groupByCityCountry().map((group) => (
                <div key={`${group.city}|${group.country}`}>
                  <h2 className="text-xl font-bold text-dark mb-3 flex items-center gap-2">
                    📍 {group.city}, {group.country}
                    <span className="text-sm font-normal text-gray-500">
                      {group.entries.length} dish{group.entries.length !== 1 ? "es" : ""}
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {group.entries.map((entry) => (
                      <div key={entry.id} className="bg-white rounded-lg shadow p-4">
                        {editingId === entry.id ? (
                          <div>
                            <p className="font-semibold text-dark mb-3">{entry.dish_name}</p>
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
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-dark">{entry.dish_name}</h3>
                                {entry.cuisine_type && (
                                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{entry.cuisine_type}</span>
                                )}
                              </div>
                              {entry.restaurant_name && (
                                <p className="text-sm text-gray-500">at {entry.restaurant_name}</p>
                              )}
                              {entry.rating && (
                                <p className="text-violet-400 mt-1">{"★".repeat(entry.rating)}{"☆".repeat(5 - entry.rating)}</p>
                              )}
                              {entry.notes && (
                                <p className="text-sm text-gray-600 mt-1 italic">&ldquo;{entry.notes}&rdquo;</p>
                              )}
                              <p className="text-xs text-gray-400 mt-2">
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
                </div>
              ))}
            </div>
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
