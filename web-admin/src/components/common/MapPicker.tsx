import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  lat: number;
  lng: number;
  nfcLinked: boolean;
}

interface BaseMapViewProps {
  bases: BaseMarker[];
  className?: string;
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

export function BaseMapView({ bases, className }: BaseMapViewProps) {
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
          <Marker key={base.id} position={[base.lat, base.lng]} icon={greenIcon} />
        ))}
      </MapContainer>
    </div>
  );
}
