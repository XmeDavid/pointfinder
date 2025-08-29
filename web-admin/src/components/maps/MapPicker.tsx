"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

L.Marker.prototype.options.icon = DefaultIcon;

interface MapClickHandlerProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

function MapClickHandler({ onLocationSelect }: MapClickHandlerProps) {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface MapPickerProps {
  onLocationSelect: (lat: number, lng: number) => void;
  initialLocation?: { lat: number; lng: number };
  height?: string;
  className?: string;
}

export default function MapPicker({
  onLocationSelect,
  initialLocation,
  height = "300px",
  className = "",
}: MapPickerProps) {
  const [selectedPosition, setSelectedPosition] = useState<[number, number] | null>(
    initialLocation ? [initialLocation.lat, initialLocation.lng] : null
  );

  const center: [number, number] = selectedPosition || [38.7223, -9.1393]; // Default to Lisbon

  const handleLocationSelect = (lat: number, lng: number) => {
    const position: [number, number] = [lat, lng];
    setSelectedPosition(position);
    onLocationSelect(lat, lng);
  };

  useEffect(() => {
    if (initialLocation && !selectedPosition) {
      setSelectedPosition([initialLocation.lat, initialLocation.lng]);
    }
  }, [initialLocation, selectedPosition]);

  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <div className="mb-2 text-sm text-gray-600">
        Click on the map to select a location for the base
      </div>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        className="rounded-lg border border-gray-300"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapClickHandler onLocationSelect={handleLocationSelect} />
        
        {selectedPosition && (
          <Marker position={selectedPosition} icon={DefaultIcon} />
        )}
      </MapContainer>
      
      {selectedPosition && (
        <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
          <strong>Selected coordinates:</strong> {selectedPosition[0].toFixed(6)}, {selectedPosition[1].toFixed(6)}
        </div>
      )}
    </div>
  );
}