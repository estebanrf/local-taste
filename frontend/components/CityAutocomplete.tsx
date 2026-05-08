import { useState, useRef, useEffect, useCallback } from "react";
import { searchCities, CityOption } from "../lib/cities";

interface Props {
  onSelect: (city: string, country: string) => void;
  disabled?: boolean;
}

export default function CityAutocomplete({ onSelect, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CityOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (selected) { setResults([]); setOpen(false); return; }
    const hits = searchCities(query);
    setResults(hits);
    setOpen(hits.length > 0);
    setActiveIndex(-1);
  }, [query, selected]);

  const commit = useCallback((opt: CityOption) => {
    setSelected(opt);
    setQuery(opt.label);
    setOpen(false);
    onSelect(opt.city, opt.country);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) commit(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(null);
    setQuery(e.target.value);
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
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        disabled={disabled}
        placeholder="City, Country (e.g. Tokyo)"
        autoComplete="off"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg disabled:bg-gray-50 disabled:cursor-not-allowed"
      />
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto max-h-64"
        >
          {results.map((opt, i) => (
            <li
              key={opt.label}
              onMouseDown={() => commit(opt)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-2.5 cursor-pointer flex items-center gap-2 text-sm ${
                i === activeIndex ? "bg-purple-50 text-primary" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="font-medium">{opt.city}</span>
              <span className="text-gray-400">{opt.country}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
