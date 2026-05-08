import { useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { API_URL } from "../lib/config";
import Layout from "../components/Layout";
import { Skeleton, SkeletonCard } from "../components/Skeleton";
import { showToast } from "../components/Toast";
import Link from "next/link";
import Head from "next/head";

interface PassportStats {
  total_dishes: number;
  cities_visited: number;
  cuisine_types: number;
  avg_rating: number | null;
}

interface PassportEntry {
  id: string;
  dish_name: string;
  city_name: string;
  country: string;
  cuisine_type: string;
  tasted_at: string;
  rating: number | null;
  restaurant_name: string | null;
}

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [stats, setStats] = useState<PassportStats | null>(null);
  const [recentEntries, setRecentEntries] = useState<PassportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");

  useEffect(() => {
    async function loadData() {
      if (!isLoaded || !user) return;
      try {
        const token = await getToken();
        if (!token) return;

        const [userRes, passportRes] = await Promise.all([
          fetch(`${API_URL}/api/user`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/passport`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (userRes.ok) {
          const data = await userRes.json();
          const u = data.user;
          setDisplayName(u.display_name || "");
          setHomeCity(u.home_city || "");
          setDietaryNotes(u.dietary_notes || "");
        }

        if (passportRes.ok) {
          const data = await passportRes.json();
          setStats(data.stats);
          setRecentEntries((data.entries || []).slice(0, 5));
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isLoaded, user, getToken]);

  const handleSave = async () => {
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
        body: JSON.stringify({ display_name: displayName.trim(), home_city: homeCity || null, dietary_notes: dietaryNotes || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      showToast("success", "Profile saved!");
    } catch {
      showToast("error", "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const ratingStars = (r: number | null) =>
    r ? "★".repeat(r) + "☆".repeat(5 - r) : "—";

  return (
    <>
      <Head><title>Dashboard - Local Taste</title></Head>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-dark mb-8">Dashboard</h1>

          {loading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg shadow p-6">
                    <Skeleton className="h-4 w-3/4 mx-auto mb-3" />
                    <Skeleton className="h-8 w-1/2 mx-auto" />
                  </div>
                ))}
              </div>
              <SkeletonCard />
            </div>
          ) : (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <p className="text-sm text-gray-500 mb-1">Dishes Tried</p>
                  <p className="text-3xl font-bold text-primary">{stats?.total_dishes ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <p className="text-sm text-gray-500 mb-1">Cities Visited</p>
                  <p className="text-3xl font-bold text-dark">{stats?.cities_visited ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <p className="text-sm text-gray-500 mb-1">Cuisine Types</p>
                  <p className="text-3xl font-bold text-dark">{stats?.cuisine_types ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <p className="text-sm text-gray-500 mb-1">Avg. Rating</p>
                  <p className="text-3xl font-bold text-accent">
                    {stats?.avg_rating ? Number(stats.avg_rating).toFixed(1) : "—"}
                  </p>
                </div>
              </div>

              {/* Quick actions */}
              <div className="bg-white rounded-lg shadow p-6 mb-8 flex flex-col sm:flex-row gap-4">
                <Link href="/explore" className="flex-1">
                  <button className="w-full px-6 py-4 bg-primary text-white rounded-lg hover:bg-purple-700 font-semibold text-lg transition-colors">
                    🔍 Explore a City
                  </button>
                </Link>
                <Link href="/passport" className="flex-1">
                  <button className="w-full px-6 py-4 border-2 border-primary text-primary rounded-lg hover:bg-primary hover:text-white font-semibold text-lg transition-colors">
                    🛂 My Food Passport
                  </button>
                </Link>
              </div>

              {/* Recent passport entries */}
              {recentEntries.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-dark">Recently Tasted</h2>
                    <Link href="/passport" className="text-sm text-primary hover:underline">View all →</Link>
                  </div>
                  <div className="space-y-3">
                    {recentEntries.map((e) => (
                      <div key={e.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{e.dish_name}</p>
                          <p className="text-sm text-gray-500">
                            {e.city_name}, {e.country}
                            {e.restaurant_name ? ` · ${e.restaurant_name}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-violet-500 text-sm">{ratingStars(e.rating)}</p>
                          <p className="text-xs text-gray-400">{new Date(e.tasted_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Profile settings */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-dark mb-6">Profile</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dietary notes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={dietaryNotes}
                      onChange={(e) => setDietaryNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. vegetarian, nut allergy, halal..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {saving ? "Saving…" : "Save Profile"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Layout>
    </>
  );
}
