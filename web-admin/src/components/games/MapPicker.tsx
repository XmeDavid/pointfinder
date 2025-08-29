"use client";

import React from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import { Icon } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Base {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  uuid: string;
  isLocationDependent: boolean;
  nfcLinked: boolean;
  enigmaId?: string;
}

interface MapPickerProps {
  bases: Base[];
  selectedBase: Base | null;
  onBaseSelect: (base: Base | null) => void;
  onLocationSelect: (location: { lat: number; lng: number }) => void;
  center: { lat: number; lng: number };
  onCenterChange: (center: { lat: number; lng: number }) => void;
}

// Custom marker icon
const createCustomIcon = (color: string) => {
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${color}"/>
        <circle cx="12" cy="9" r="2.5" fill="white"/>
      </svg>
    `)}`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};

// Map click handler component
function MapClickHandler({ onLocationSelect }: { onLocationSelect: (location: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Map center handler component
function MapCenterHandler({ onCenterChange }: { onCenterChange: (center: { lat: number; lng: number }) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const center = map.getCenter();
      onCenterChange({ lat: center.lat, lng: center.lng });
    },
  });
  return null;
}

export default function MapPicker({
  bases,
  selectedBase,
  onBaseSelect,
  onLocationSelect,
  center,
  onCenterChange,
}: MapPickerProps) {
  // Auto-center map is handled by the interactive components

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="w-full h-full"
      style={{ height: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <MapClickHandler onLocationSelect={onLocationSelect} />
      <MapCenterHandler onCenterChange={onCenterChange} />

      {/* Render base markers */}
      {bases.map((base) => {
        const isSelected = selectedBase?.id === base.id;
        const isLinked = base.nfcLinked;
        
        let color = "#3B82F6"; // Blue for unlinked
        if (isLinked) {
          color = "#10B981"; // Green for linked
        }
        if (isSelected) {
          color = "#EF4444"; // Red for selected
        }

        return (
          <Marker
            key={base.id}
            position={[base.latitude, base.longitude]}
            icon={createCustomIcon(color)}
            eventHandlers={{
              click: () => onBaseSelect(base),
            }}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-gray-900">{base.name}</h3>
                {base.description && (
                  <p className="text-sm text-gray-600 mt-1">{base.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {base.latitude.toFixed(4)}, {base.longitude.toFixed(4)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    isLinked 
                      ? "bg-green-100 text-green-800" 
                      : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {isLinked ? "NFC Linked" : "NFC Unlinked"}
                  </span>
                  {base.isLocationDependent && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Location-dependent
                    </span>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
