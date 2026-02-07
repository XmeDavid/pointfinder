"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Base, Team, TeamLocation } from "@/types";

// Fix for default markers in Next.js
const DefaultIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

const BaseIcon = L.icon({
  iconUrl: "/leaflet/marker-icon-red.png",
  iconRetinaUrl: "/leaflet/marker-icon-red-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const TeamIcon = L.icon({
  iconUrl: "/leaflet/marker-icon-green.png", 
  iconRetinaUrl: "/leaflet/marker-icon-green-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapClickHandlerProps {
  onMapClick?: (lat: number, lng: number) => void;
}

function MapClickHandler({ onMapClick }: MapClickHandlerProps) {
  useMapEvents({
    click: (e) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

interface FitBoundsProps {
  positions: Array<[number, number]>;
}

function FitBounds({ positions }: FitBoundsProps) {
  const map = useMap();
  
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, positions]);
  
  return null;
}

interface InteractiveMapProps {
  bases?: Base[];
  teams?: Team[];
  teamLocations?: TeamLocation[];
  onMapClick?: (lat: number, lng: number) => void;
  height?: string;
  center?: [number, number];
  zoom?: number;
  className?: string;
}

export default function InteractiveMap({
  bases = [],
  teams: _teams = [], // Used for potential future features
  teamLocations = [],
  onMapClick,
  height = "400px",
  center = [38.7223, -9.1393], // Default to Lisbon, Portugal
  zoom = 13,
  className = "",
}: InteractiveMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Create positions array for fitting bounds
  const allPositions: Array<[number, number]> = [
    ...bases.map(base => [base.latitude, base.longitude] as [number, number]),
    ...teamLocations.map(loc => [loc.latitude, loc.longitude] as [number, number]),
  ];

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Map click handler */}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        
        {/* Fit bounds to show all markers */}
        {allPositions.length > 0 && <FitBounds positions={allPositions} />}
        
        {/* Base markers */}
        {bases.map((base) => (
          <Marker
            key={base.id}
            position={[base.latitude, base.longitude]}
            icon={BaseIcon}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-gray-900">{base.name}</h3>
                {base.description && (
                  <p className="text-sm text-gray-600 mt-1">{base.description}</p>
                )}
                <div className="mt-2 space-y-1 text-xs text-gray-500">
                  <p>📍 {base.latitude.toFixed(4)}, {base.longitude.toFixed(4)}</p>
                  <p>🔑 UUID: {base.uuid.slice(0, 8)}...</p>
                  <p className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    base.nfcLinked 
                      ? "bg-green-100 text-green-800" 
                      : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {base.nfcLinked ? "✅ NFC Linked" : "⏳ Not Linked"}
                  </p>
                  {base.isLocationDependent && (
                    <p>📍 Location-dependent</p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        
        {/* Team location markers */}
        {teamLocations.map((location) => (
          <Marker
            key={`${location.teamId}-${location.timestamp}`}
            position={[location.latitude, location.longitude]}
            icon={TeamIcon}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-gray-900">{location.teamName}</h3>
                <div className="mt-2 space-y-1 text-xs text-gray-500">
                  <p>📍 {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</p>
                  <p>📱 Device: {location.deviceId}</p>
                  <p>🎯 Accuracy: ±{location.accuracy}m</p>
                  <p>🕒 {formatTime(location.timestamp)}</p>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}