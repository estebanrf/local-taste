import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface MapItem {
  id: string;
  dish_id: string | null;
  dish_name: string;
  city_name: string;
  country: string;
  notes: string | null;
  dish_description: string | null;
  cuisine_type: string | null;
  tags: string[];
  dish_rank: number | null;
  city_id: string | null;
  eaten_count: number;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  restaurant_ids: string[];
  restaurant_name?: string | null;
}

interface Props {
  items: MapItem[];
  onPinClick: (item: MapItem) => void;
  selectedItem: MapItem | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMarker = any;

export default function ItineraryMap({ items, onPinClick, selectedItem }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap>(null);
  const markersRef = useRef<LeafletMarker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: LeafletMap;
    import("leaflet").then((L) => {
      map = L.map(containerRef.current!, { scrollWheelZoom: false }).setView([20, 10], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      markersRef.current.forEach((m: LeafletMarker) => m.remove());
      markersRef.current = [];

      const pinned = items.filter(i => i.latitude !== null && i.longitude !== null);

      pinned.forEach(item => {
        const isSelected = selectedItem?.id === item.id;
        const eaten = item.eaten_count > 0;
        const color = isSelected ? "#7c3aed" : eaten ? "#22c55e" : "#f59e0b";
        const size = isSelected ? 28 : 22;

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -(size / 2 + 4)],
        });

        const marker = L.marker([item.latitude as number, item.longitude as number], { icon })
          .bindPopup(`
            <div style="min-width:140px">
              <p style="font-weight:600;margin-bottom:2px">${item.restaurant_name ?? item.dish_name}</p>
              ${item.restaurant_name ? `<p style="color:#374151;font-size:12px;margin-bottom:2px">${item.dish_name}</p>` : ""}
              <p style="color:#6b7280;font-size:12px">${item.city_name}, ${item.country}</p>
              ${item.eaten_count > 0 ? `<p style="color:#16a34a;font-size:12px;margin-top:4px">✓ Tried ${item.eaten_count}×</p>` : ""}
            </div>
          `)
          .on("click", () => onPinClick(item))
          .addTo(map);
        markersRef.current.push(marker);
      });

      if (pinned.length === 1) {
        map.flyTo([pinned[0].latitude as number, pinned[0].longitude as number], 13, { duration: 0.8 });
      } else if (pinned.length > 1) {
        const bounds = L.latLngBounds(pinned.map((i: MapItem) => [i.latitude as number, i.longitude as number]));
        map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8 });
      }
    });
  }, [items, selectedItem, onPinClick]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      {items.filter(i => i.latitude !== null).length === 0 && items.length > 0 && (
        <div style={{
          position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "4px 10px",
          fontSize: 12, color: "#6b7280", zIndex: 1000, pointerEvents: "none",
        }}>
          Pins appear after searching for restaurants
        </div>
      )}
    </div>
  );
}
