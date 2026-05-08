import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapItem {
  id: string;
  dish_name: string;
  city_name: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  eaten_count: number;
}

interface Props {
  items: MapItem[];
  onPinClick: (item: MapItem) => void;
  selectedItem: MapItem | null;
}

function makeIcon(color: string, size: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function MapFlyTo({ items }: { items: MapItem[] }) {
  const map = useMap();
  useEffect(() => {
    const pinned = items.filter(i => i.latitude !== null && i.longitude !== null);
    if (pinned.length === 0) return;
    if (pinned.length === 1) {
      map.flyTo([pinned[0].latitude!, pinned[0].longitude!], 13, { duration: 0.8 });
    } else {
      const bounds = L.latLngBounds(pinned.map(i => [i.latitude!, i.longitude!] as [number, number]));
      map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);
  return null;
}

export default function ItineraryMap({ items, onPinClick, selectedItem }: Props) {
  const pinned = items.filter(i => i.latitude !== null && i.longitude !== null);

  return (
    <MapContainer
      center={[20, 10]}
      zoom={2}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapFlyTo items={items} />
      {pinned.map(item => {
        const isSelected = selectedItem?.id === item.id;
        const eaten = item.eaten_count > 0;
        const color = isSelected ? "#7c3aed" : eaten ? "#22c55e" : "#f59e0b";
        const size = isSelected ? 28 : 22;
        return (
          <Marker
            key={item.id}
            position={[item.latitude!, item.longitude!]}
            icon={makeIcon(color, size)}
            eventHandlers={{ click: () => onPinClick(item) }}
          >
            <Popup>
              <div style={{ minWidth: 140 }}>
                <p style={{ fontWeight: 600, marginBottom: 2 }}>{item.dish_name}</p>
                <p style={{ color: "#6b7280", fontSize: 12 }}>{item.city_name}, {item.country}</p>
                {item.eaten_count > 0 && (
                  <p style={{ color: "#16a34a", fontSize: 12, marginTop: 4 }}>✓ Tried {item.eaten_count}×</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
      {pinned.length === 0 && items.length > 0 && (
        <div
          style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "4px 10px",
            fontSize: 12, color: "#6b7280", zIndex: 1000, pointerEvents: "none",
          }}
        >
          Pins appear after searching for restaurants
        </div>
      )}
    </MapContainer>
  );
}
