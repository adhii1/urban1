'use client';

import { useMemo, useEffect } from 'react';
import {
  APIProvider,
  Map,
  Marker,
  Polyline,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  GOOGLE_MAPS_KEY,
  hasGoogleMapsKey,
  normalizeStops,
  stopDisplayName,
  type StopLike,
} from '@/lib/geo';

const VARIANT_COLORS = {
  default: { fill: '#3B82F6', stroke: '#1E3A8A' },
  start: { fill: '#16C15D', stroke: '#0F7A3B' },
  end: { fill: '#EF4444', stroke: '#991B1B' },
  next: { fill: '#F59E0B', stroke: '#B45309' },
  pickup: { fill: '#16C15D', stroke: '#0F7A3B' },
  drop: { fill: '#EF4444', stroke: '#991B1B' },
  pending: { fill: '#FB923C', stroke: '#9A3412' },
};

export type RouteMapVariant =
  | 'default'
  | 'start'
  | 'end'
  | 'next'
  | 'pickup'
  | 'drop'
  | 'pending';

export type RouteMapProps = {
  stops: StopLike[];
  height?: number;
  variantByOrder?: Record<number, RouteMapVariant>;
  nextSequence?: number | null;
  accentPickupSequence?: number | null;
  accentDropSequence?: number | null;
  fallback?: React.ReactNode;
};

const FALLBACK_HEIGHT = 240;

function FitBounds({ stops }: { stops: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || stops.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const p of stops) bounds.extend(p);
    if (stops.length === 1) {
      map.setCenter(stops[0]);
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [map, stops]);
  return null;
}

export default function RouteMap({
  stops,
  height = FALLBACK_HEIGHT,
  variantByOrder,
  nextSequence,
  accentPickupSequence,
  accentDropSequence,
  fallback,
}: RouteMapProps) {
  const normalized = useMemo(() => normalizeStops(stops), [stops]);
  const hasCoords = normalized.length > 0;

  if (!hasGoogleMapsKey || !hasCoords) {
    return (
      <>
        {fallback ?? (
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(148, 163, 184, 0.1)',
              fontSize: '12px',
              color: '#64748B',
              textAlign: 'center',
            }}
          >
            {!hasGoogleMapsKey
              ? 'Map view unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable.'
              : 'Map view unavailable — no stop coordinates yet.'}
          </div>
        )}
      </>
    );
  }

  const fitBoundsStops = useMemo(
    () => normalized.map((n) => n.latlng!),
    [normalized]
  );

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <div
        style={{
          width: '100%',
          height,
          borderRadius: '14px',
          overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <Map
          disableDefaultUI
          gestureHandling="greedy"
          defaultCenter={{ lat: 12.9716, lng: 77.5946 }}
          defaultZoom={12}
          style={{ width: '100%', height: '100%' }}
        >
          <FitBounds stops={fitBoundsStops} />
          <Polyline
            path={fitBoundsStops}
            strokeColor="#3B82F6"
            strokeOpacity={0.7}
            strokeWeight={4}
          />
          {normalized.map(({ stop, order, latlng }, idx) => {
            const defaultVariant =
              idx === 0 ? 'start' : idx === normalized.length - 1 ? 'end' : 'default';
            const variant: RouteMapVariant =
              variantByOrder?.[order] ??
              (nextSequence === order
                ? 'next'
                : accentPickupSequence === order
                  ? 'pickup'
                  : accentDropSequence === order
                    ? 'drop'
                    : defaultVariant);
            const colors = VARIANT_COLORS[variant];
            const isEmphasized = variant === 'next' || variant === 'pending';
            return (
              <Marker
                key={`${order}-${idx}`}
                position={latlng!}
                zIndex={isEmphasized ? 1000 : order}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: isEmphasized ? 18 : 14,
                  fillColor: colors.fill,
                  fillOpacity: 1,
                  strokeColor: colors.stroke,
                  strokeWeight: 2,
                }}
                label={{
                  text: String(order),
                  color: '#FFFFFF',
                  fontSize: isEmphasized ? '13px' : '12px',
                  fontWeight: '700',
                }}
                title={stopDisplayName(stop, idx)}
              />
            );
          })}
        </Map>
      </div>
    </APIProvider>
  );
}
