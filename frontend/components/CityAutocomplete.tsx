import { useState, useRef, useEffect, useCallback } from "react";

interface Suggestion {
  placePrediction: {
    placeId: string;
    text: { text: string };
    mainText: { text: string };
    secondaryText: { text: string };
  };
}

interface Props {
  onSelect: (city: string, country: string) => void;
  initialValue?: string;
  disabled?: boolean;
}

function loadMapsApi(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps) { resolve(); return; }
    const existing = document.getElementById("lt-maps-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject());
      return;
    }
    const s = document.createElement("script");
    s.id = "lt-maps-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject();
    document.head.appendChild(s);
  });
}

export default function CityAutocomplete({ onSelect, initialValue = "", disabled }: Props) {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSearch = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);

  // Sync if parent loads initialValue asynchronously (e.g. Passport page)
  useEffect(() => { setQuery(initialValue); }, [initialValue]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    loadMapsApi(key)
      .then(() => setMapsReady(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipNextSearch.current) { skipNextSearch.current = false; return; }
    if (!query.trim() || !mapsReady) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { AutocompleteSuggestion } = await (window as any).google.maps.importLibrary("places");
        const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedPrimaryTypes: ["locality"],
        });
        setSuggestions(results as Suggestion[]);
        setOpen((results as Suggestion[]).length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mapsReady]);

  const commit = useCallback((s: Suggestion) => {
    const city = s.placePrediction.mainText.text;
    const parts = s.placePrediction.secondaryText.text.split(", ");
    const country = parts[parts.length - 1] ?? "";
    skipNextSearch.current = true;
    setQuery(s.placePrediction.text.text);
    setSuggestions([]);
    setOpen(false);
    onSelect(city, country);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) commit(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        disabled={disabled}
        placeholder="Search any city…"
        autoComplete="off"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg disabled:bg-gray-50 disabled:cursor-not-allowed"
      />
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-[1000] left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto max-h-64"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placePrediction.placeId}
              onMouseDown={() => commit(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-2.5 cursor-pointer flex items-center gap-2 text-sm ${
                i === activeIndex ? "bg-purple-50 text-primary" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="font-medium">{s.placePrediction.mainText.text}</span>
              <span className="text-gray-400">{s.placePrediction.secondaryText.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
