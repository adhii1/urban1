'use client';

import { useEffect } from 'react';
import {
  APIProvider,
  Map,
  Marker,
  useMap,
} from '@vis.gl/react-google-maps';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export type PickerStop = {
  name: string;
  lat: number | null;
  lng: number | null;
};

export type StopMapPickerProps = {
  stops: PickerStop[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onMapClick: (lat: number, lng: number) => void;
  height?: number;
};

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('click', (e: any) => {
      if (e?.latLng) onMapClick(e.latLng.lat(), e.latLng.lng());
    });
    return () => listener.remove();
  }, [map, onMapClick]);
  return null;
}

function BoundsFitter({ stops }: { stops: PickerStop[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const valid = stops.filter((s) => s.lat != null && s.lng != null) as Array<
      PickerStop & { lat: number; lng: number }
    >;
    if (valid.length === 0) {
      map.setCenter({ lat: 12.9716, lng: 77.5946 });
      map.setZoom(11);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    for (const s of valid) bounds.extend({ lat: s.lat, lng: s.lng });
    if (valid.length === 1) {
      map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(13);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [map, stops]);
  return null;
}

export default function StopMapPicker({
  stops,
  selectedIndex,
  onMapClick,
  height = 280,
}: StopMapPickerProps) {
  if (!API_KEY) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-2, #1f2937)',
          color: 'var(--text-light, #94A3B8)',
          borderRadius: '10px',
          fontSize: '12px',
          textAlign: 'center',
          padding: '12px',
        }}
      >
        Map picker unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable coordinate picking.
      </div>
    );
  }
  return (
    <APIProvider apiKey={API_KEY}>
      <div
        style={{
          width: '100%',
          height,
          borderRadius: '10px',
          overflow: 'hidden',
          border: '1px solid var(--border-color, #E2E8F0)',
        }}
      >
        <Map
          disableDefaultUI
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%' }}
        >
          <BoundsFitter stops={stops} />
          <MapClickHandler onMapClick={onMapClick} />
          {stops.map((s, i) => {
            if (s.lat == null || s.lng == null) return null;
            return (
              <Marker
                key={i}
                position={{ lat: s.lat, lng: s.lng }}
                zIndex={selectedIndex === i ? 2000 : 100 + i}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: selectedIndex === i ? 18 : 12,
                  fillColor: selectedIndex === i ? '#F59E0B' : '#3B82F6',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                }}
                label={{
                  text: String(i + 1),
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: '700',
                }}
              />
            );
          })}
        </Map>
      </div>
    </APIProvider>
  );
}
