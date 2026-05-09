export const DIETARY_OPTIONS = [
  { id: "vegetarian",  label: "Vegetarian",          emoji: "🥦" },
  { id: "vegan",       label: "Vegan",                emoji: "🌱" },
  { id: "gluten-free", label: "Celiac / Gluten-free", emoji: "🌾" },
  { id: "dairy-free",  label: "Dairy-free",           emoji: "🥛" },
  { id: "halal",       label: "Halal",                emoji: "☪️" },
  { id: "kosher",      label: "Kosher",               emoji: "✡️" },
  { id: "nut-free",    label: "Nut-free",             emoji: "🥜" },
  { id: "no-pork",     label: "No pork",              emoji: "🐷" },
];

export function parseDietaryPrefs(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}
