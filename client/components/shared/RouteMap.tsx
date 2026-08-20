'use client';

/**
 * RouteMap — Leaflet + OpenStreetMap based (free, no API key required)
 * Replaces the Google Maps version.
 */

import { useMemo, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { StopLike } from '@/lib/geo';
import { normalizeStops as normalizeStopsGeo } from '@/lib/geo';

export type RouteMapVariant = 'default' | 'start' | 'end' | 'next' | 'pickup' | 'drop' | 'pending';

export type RouteMapProps = {
  stops: StopLike[];
  height?: number;
  variantByOrder?: Record<number, RouteMapVariant>;
  nextSequence?: number | null;
  accentPickupSequence?: number | null;
  accentDropSequence?: number | null;
  fallback?: React.ReactNode;
};

const VARIANT_COLORS: Record<RouteMapVariant, string> = {
  default: '#3B82F6',
  start: '#16C15D',
  end: '#EF4444',
  next: '#F59E0B',
  pickup: '#16C15D',
  drop: '#EF4444',
  pending: '#FB923C',
};

function normalizeStopsLocal(stops: StopLike[]): Array<{ lat: number; lng: number; name: string; order: number }> {
  const normalized = normalizeStopsGeo(stops);
  return normalized.map((item) => ({
    lat: item.latlng!.lat,
    lng: item.latlng!.lng,
    name: item.stop.stopName || item.stop.name || `Stop ${item.order}`,
    order: item.order,
  }));
}

export default function RouteMap({ stops, height = 240, variantByOrder, nextSequence, accentPickupSequence, accentDropSequence, fallback }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const normalized = useMemo(() => normalizeStopsLocal(stops), [stops]);

  useEffect(() => {
    if (!containerRef.current || normalized.length === 0) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(containerRef.current, { zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    const latLngs: L.LatLngExpression[] = [];

    normalized.forEach((stop, idx) => {
      const defaultVariant: RouteMapVariant = idx === 0 ? 'start' : idx === normalized.length - 1 ? 'end' : 'default';
      const variant: RouteMapVariant = variantByOrder?.[stop.order] ?? (nextSequence === stop.order ? 'next' : accentPickupSequence === stop.order ? 'pickup' : accentDropSequence === stop.order ? 'drop' : defaultVariant);
      const color = VARIANT_COLORS[variant];
      const size = variant === 'next' || variant === 'pending' ? 28 : 22;

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;">${stop.order}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      L.marker([stop.lat, stop.lng], { icon }).addTo(map).bindTooltip(stop.name, { direction: 'top', offset: [0, -12] });
      latLngs.push([stop.lat, stop.lng]);
    });

    // Draw route line
    if (latLngs.length > 1) {
      L.polyline(latLngs, { color: '#3B82F6', weight: 4, opacity: 0.7 }).addTo(map);
    }

    // Fit bounds
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30] });
    }

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [normalized, variantByOrder, nextSequence, accentPickupSequence, accentDropSequence]);

  if (normalized.length === 0) {
    return fallback ? <>{fallback}</> : (
      <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(148,163,184,0.1)', fontSize: '12px', color: '#64748B', textAlign: 'center' }}>
        Map view unavailable — no stop coordinates yet.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height, borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }} />
  );
}
