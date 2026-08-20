'use client';

/**
 * StopMapPicker — Leaflet + OpenStreetMap based (free, no API key)
 * Replaces the Google Maps version.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

export default function StopMapPicker({ stops, selectedIndex, onMapClick, height = 280 }: StopMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(containerRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    // Place markers for all stops with coordinates
    const latLngs: L.LatLngExpression[] = [];
    stops.forEach((stop, idx) => {
      if (stop.lat == null || stop.lng == null) return;
      const isSelected = idx === selectedIndex;
      const color = isSelected ? '#16C15D' : '#3B82F6';
      const size = isSelected ? 28 : 22;
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;">${idx + 1}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      L.marker([stop.lat, stop.lng], { icon }).addTo(map).bindTooltip(stop.name || `Stop ${idx + 1}`, { direction: 'top' });
      latLngs.push([stop.lat, stop.lng]);
    });

    // Fit bounds
    if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30] });
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 13);
    } else {
      map.setView([12.9716, 77.5946], 11); // Default: Bangalore
    }

    // Click handler
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [stops, selectedIndex, onMapClick]);

  return (
    <div ref={containerRef} style={{ width: '100%', height, borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color, #E2E8F0)' }} />
  );
}
