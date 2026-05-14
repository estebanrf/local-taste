import { useState, useRef, useEffect, useCallback } from "react";

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
  terms: { value: string; offset: number }[];
}

interface Props {
  onSelect: (city: string, country: string) => void;
  initialValue?: string;
  disabled?: boolean;
}

// Lazy-load the Maps JS API once per page — idempotent
function loadMapsApi(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) { resolve(); return; }
    const existing = document.getElementById("lt-maps-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Maps script failed")));
      return;
    }
    const s = document.createElement("script");
    s.id = "lt-maps-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Maps script failed"));
    document.head.appendChild(s);
  });
}

export default function CityAutocomplete({ onSelect, initialValue = "", disabled }: Props) {
  const [query, setQuery] = useState(initialValue);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceRef = useRef<any>(null);

  // Load Maps API on mount
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    loadMapsApi(key)
      .then(() => setMapsReady(true))
      .catch(() => { /* silent — falls back to empty suggestions */ });
  }, []);

  // Get or create AutocompleteService once Maps is ready
  const getService = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    if (!g?.maps?.places) return null;
    if (!serviceRef.current) {
      serviceRef.current = new g.maps.places.AutocompleteService();
    }
    return serviceRef.current;
  }, []);

  // Fetch predictions with 300ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || !mapsReady) { setPredictions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(() => {
      const svc = getService();
      if (!svc) return;
      svc.getPlacePredictions(
        { input: query, types: ["(cities)"] },
        (results: Prediction[] | null, status: string) => {
          if (status === "OK" && results) {
            setPredictions(results);
            setOpen(true);
          } else {
            setPredictions([]);
            setOpen(false);
          }
          setActiveIndex(-1);
        }
      );
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mapsReady, getService]);

  const commit = useCallback((pred: Prediction) => {
    // terms: [city, (optional region), country]
    const city = pred.terms[0]?.value ?? pred.structured_formatting.main_text;
    const country = pred.terms[pred.terms.length - 1]?.value ?? "";
    setQuery(pred.description);
    setPredictions([]);
    setOpen(false);
    onSelect(city, country);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && predictions[activeIndex]) commit(predictions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Scroll active item into view
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
        onChange={e => { setQuery(e.target.value); }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => { if (predictions.length > 0) setOpen(true); }}
        disabled={disabled}
        placeholder="Search any city…"
        autoComplete="off"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg disabled:bg-gray-50 disabled:cursor-not-allowed"
      />
      {open && predictions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-[1000] left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto max-h-64"
        >
          {predictions.map((pred, i) => (
            <li
              key={pred.place_id}
              onMouseDown={() => commit(pred)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-2.5 cursor-pointer flex items-center gap-2 text-sm ${
                i === activeIndex ? "bg-purple-50 text-primary" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="font-medium">{pred.structured_formatting.main_text}</span>
              <span className="text-gray-400">{pred.structured_formatting.secondary_text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
