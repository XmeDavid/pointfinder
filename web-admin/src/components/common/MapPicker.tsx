import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Pencil, EyeOff, Wifi, WifiOff } from "lucide-react";

// Fix Leaflet default marker icon issue with bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapPickerProps {
  value: { lat: number; lng: number };
  onChange: (lat: number, lng: number) => void;
  className?: string;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [map, lat, lng]);
  return null;
}

export function MapPicker({ value, onChange, className }: MapPickerProps) {
  return (
    <div className={className}>
      <MapContainer
        center={[value.lat, value.lng]}
        zoom={15}
        style={{ height: "100%", width: "100%", borderRadius: "0.375rem" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[value.lat, value.lng]} />
        <ClickHandler onChange={onChange} />
        <RecenterMap lat={value.lat} lng={value.lng} />
      </MapContainer>
    </div>
  );
}

// Read-only map for displaying multiple markers
interface BaseMarker {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  nfcLinked: boolean;
  hidden: boolean;
  fixedChallengeName?: string;
}

interface BaseMapViewProps {
  bases: BaseMarker[];
  className?: string;
  onEdit?: (baseId: string) => void;
}

const greenIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function BaseMapView({ bases, className, onEdit }: BaseMapViewProps) {
  const [userLocation, setUserLocation] = useState<[number, number]>([40.08789650218038, -8.869461715221407]);

  useEffect(() => {
    if (bases.length === 0 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        () => {
          // Geolocation failed, use fallback
          setUserLocation([40.08789650218038, -8.869461715221407]);
        }
      );
    }
  }, [bases.length]);

  const center: [number, number] = bases.length > 0
    ? [bases.reduce((s, b) => s + b.lat, 0) / bases.length, bases.reduce((s, b) => s + b.lng, 0) / bases.length]
    : userLocation;

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {bases.map((base) => (
          <Marker key={base.id} position={[base.lat, base.lng]} icon={greenIcon}>
            <Popup>
              <div className="min-w-[200px] max-w-[280px]">
                <p className="text-sm font-semibold leading-tight">{base.name}</p>
                {base.description && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{base.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {base.lat.toFixed(5)}, {base.lng.toFixed(5)}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {base.hidden && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-gray-300 bg-gray-50 text-gray-600">
                      <EyeOff className="h-3 w-3" />
                      Hidden
                    </span>
                  )}
                  {base.fixedChallengeName && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded border border-blue-200 bg-blue-50 text-blue-700 max-w-[160px]">
                      <span className="truncate">Fixed: {base.fixedChallengeName}</span>
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border ${
                    base.nfcLinked
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    {base.nfcLinked ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {base.nfcLinked ? "NFC linked" : "NFC not linked"}
                  </span>
                </div>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(base.id)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit Base
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
