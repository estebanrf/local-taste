import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Layout from "../components/Layout";
import { API_URL } from "../lib/config";
import { showToast } from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import OnboardingWizard from "../components/OnboardingWizard";
import Link from "next/link";
import Head from "next/head";
import { DIETARY_OPTIONS, parseDietaryPrefs } from "../lib/dietary";

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
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

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
        const u = userData.user;
        const prefs = parseDietaryPrefs(u?.dietary_notes);
        setDietaryPrefs(prefs);
        setDisplayName(u?.display_name || "");
        setHomeCity(u?.home_city || "");
        // Show wizard if newly created or profile clearly not filled in
        if (userData.created || !u?.home_city) setShowWizard(true);
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
    const next = dietaryPrefs.includes(id) ? dietaryPrefs.filter(p => p !== id) : [...dietaryPrefs, id];
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
      setDietaryPrefs(dietaryPrefs);
      showToast("error", "Failed to save preferences.");
    }
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
      if (!res.ok) throw new Error("Failed to save");
      showToast("success", "Profile saved!");
    } catch {
      showToast("error", "Failed to save profile");
    } finally {
      setSaving(false);
    }
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
    } catch {
      showToast("error", "Failed to save profile.");
    }
  };

  // ── Passport completion score ─────────────────────────────────────────────

  const completionSteps: { label: string; done: boolean }[] = [
    { label: "Display name set",        done: !!displayName.trim() },
    { label: "Home city set",           done: !!homeCity.trim() },
    { label: "Dietary prefs set",       done: dietaryPrefs.length > 0 },
    { label: "First dish logged",       done: (stats?.total_dishes ?? 0) >= 1 },
    { label: "3+ dishes logged",        done: (stats?.total_dishes ?? 0) >= 3 },
    { label: "2+ cities explored",      done: (stats?.cities_visited ?? 0) >= 2 },
  ];
  const completionPct = Math.round((completionSteps.filter(s => s.done).length / completionSteps.length) * 100);

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
        <button key={s} type="button" onClick={() => onChange(s === value ? 0 : s)}
          className={`text-2xl transition-colors ${s <= value ? "text-violet-400" : "text-gray-200 hover:text-violet-200"}`}>
          ★
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Head><title>My Passport - Local Taste</title></Head>
      {showWizard && (
        <OnboardingWizard
          initialDisplayName={displayName}
          onComplete={handleWizardComplete}
          onSkip={() => setShowWizard(false)}
        />
      )}
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-dark">🛂 My Passport</h1>
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

          {/* Passport completion */}
          {!loading && completionPct < 100 && (
            <div className="bg-white rounded-xl shadow p-5 mb-8">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-bold text-dark">Passport completion</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Complete your profile to get the most out of Local Taste</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-primary">{completionPct}%</span>
                  <button
                    onClick={() => setShowWizard(true)}
                    className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-purple-700 font-medium transition-colors whitespace-nowrap"
                  >
                    Complete ↗
                  </button>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-primary to-purple-400 rounded-full transition-all duration-500"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              {/* Step checklist */}
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {completionSteps.map(s => (
                  <span key={s.label} className={`text-xs flex items-center gap-1 ${s.done ? "text-green-600" : "text-gray-400"}`}>
                    {s.done ? "✓" : "○"} {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!loading && completionPct === 100 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 mb-8 flex items-center gap-3">
              <span className="text-xl">🛂</span>
              <p className="text-sm font-semibold text-green-700">Passport fully activated — enjoy the journey!</p>
            </div>
          )}

          {/* Profile */}
          <div className="bg-white rounded-xl shadow p-6 mb-8">
            <h2 className="text-lg font-bold text-dark mb-4">Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Home City</label>
                <input type="text" value={homeCity} onChange={e => setHomeCity(e.target.value)}
                  placeholder="e.g. Barcelona, Spain"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <button onClick={handleSaveProfile} disabled={saving}
              className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors text-sm">
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
                  <button key={opt.id} type="button" onClick={() => toggleDietaryPref(opt.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      active ? "border-primary bg-purple-50 text-primary" : "border-gray-200 text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                    }`}>
                    <span className="text-lg">{opt.emoji}</span>
                    <span>{opt.label}</span>
                    {active && <span className="ml-auto text-primary text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Passport entries */}
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
          ) : (() => {
            const cities = Array.from(new Set(entries.map(e => e.city_name))).sort();
            const filtered = cityFilter === "all" ? entries : entries.filter(e => e.city_name === cityFilter);
            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            const safePage = Math.min(currentPage, totalPages);
            const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
            return (
            <>
              {/* Filter + count bar */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <select
                  value={cityFilter}
                  onChange={e => { setCityFilter(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="all">All cities ({entries.length})</option>
                  {cities.map(c => (
                    <option key={c} value={c}>{c} ({entries.filter(e => e.city_name === c).length})</option>
                  ))}
                </select>
                <span className="text-sm text-gray-500">
                  {filtered.length} entr{filtered.length !== 1 ? "ies" : "y"}
                  {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
                </span>
              </div>

            <div className="space-y-3">
              {paged.map(entry => (
                <div key={entry.id} className="bg-white rounded-lg shadow p-4">
                  {editingId === entry.id ? (
                    <div>
                      <p className="font-semibold text-dark mb-1">{entry.dish_name}</p>
                      <p className="text-xs text-gray-400 mb-3">📍 {entry.city_name}, {entry.country}</p>
                      <div className="mb-3">
                        <label className="text-sm text-gray-600 mb-1 block">Your rating</label>
                        <StarRating value={editRating} onChange={setEditRating} />
                      </div>
                      <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                        placeholder="Notes, memories, recommendations…" rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3" />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(entry.id)}
                          className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-purple-700">Save</button>
                        <button onClick={() => setEditingId(null)}
                          className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:border-gray-400">Cancel</button>
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
                        <button onClick={() => startEdit(entry)}
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:border-primary hover:text-primary">Edit</button>
                        <button onClick={() => setConfirmDeleteId(entry.id)}
                          className="text-xs px-3 py-1.5 border border-red-200 text-red-400 rounded-lg hover:border-red-400 hover:text-red-600">Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >← Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        p === safePage ? "bg-primary text-white" : "border border-gray-300 text-gray-600 hover:border-primary hover:text-primary"
                      }`}
                    >{p}</button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >Next →</button>
                </div>
              )}
            </>
            );
          })()}
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
