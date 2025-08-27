"use client";

import dynamic from "next/dynamic";
import React, { useMemo } from "react";

const MapContainer = dynamic(
  async () => (await import("react-leaflet")).MapContainer,
  { ssr: false }
);
const TileLayer = dynamic(async () => (await import("react-leaflet")).TileLayer, {
  ssr: false,
});
const Marker = dynamic(async () => (await import("react-leaflet")).Marker, {
  ssr: false,
});
// Import hook directly since it's not a component
import { useMapEvents } from "react-leaflet";

export type LatLng = { lat: number; lng: number };

function ClickHandler({ onSelect }: { onSelect: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

export default function LocationPickerMap({
  value,
  onChange,
  className,
}: {
  value?: LatLng | null;
  onChange: (p: LatLng) => void;
  className?: string;
}) {
  const center = useMemo<LatLng>(() => value || { lat: 46.8182, lng: 8.2275 }, [value]);
  return (
    <div className={className}>
      <MapContainer center={center} zoom={7} className="w-full h-full rounded">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={onChange} />
        {value && <Marker position={{ lat: value.lat, lng: value.lng }} />}
      </MapContainer>
    </div>
  );
}


