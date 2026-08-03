'use client';

import { useMemo } from 'react';
import RouteMap, { type RouteMapVariant } from '@/components/shared/RouteMap';
import {
  getTripPhase,
  nextStopSequence,
  pendingCountAtStop,
  stopDisplayName,
  type ManifestEntry,
  type StopLike,
  type TripPhase,
} from '@/lib/geo';

export type TripManifestMapProps = {
  stops: StopLike[];
  manifest: ManifestEntry[];
  phase?: TripPhase;
  height?: number;
};

export default function TripManifestMap({
  stops,
  manifest,
  phase,
  height,
}: TripManifestMapProps) {
  const derivedPhase = phase ?? getTripPhase(manifest);
  const next = nextStopSequence(manifest, derivedPhase);

  const variantByOrder = useMemo<Record<number, RouteMapVariant>>(() => {
    const map: Record<number, RouteMapVariant> = {};
    for (const s of stops) {
      if (typeof s.sequenceOrder !== 'number') continue;
      const pending = pendingCountAtStop(manifest, s.sequenceOrder, derivedPhase);
      if (s.sequenceOrder === next) {
        map[s.sequenceOrder] = 'next';
      } else if (pending > 0) {
        map[s.sequenceOrder] = 'pending';
      }
    }
    return map;
  }, [stops, manifest, derivedPhase, next]);

  const fallback = (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '12px',
        padding: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {stops.map((s, i) => {
        const order = s.sequenceOrder ?? i + 1;
        const pending = pendingCountAtStop(manifest, order, derivedPhase);
        return (
          <div
            key={order}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 0',
              borderBottom:
                i < stops.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
          >
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                fontSize: '10px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: order === next ? '#F59E0B20' : 'rgba(255,255,255,0.05)',
                color: order === next ? '#F59E0B' : '#94A3B8',
              }}
            >
              {order}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#FFF', fontWeight: 500 }}>
                {stopDisplayName(s, i)}
              </div>
              {pending > 0 && (
                <div style={{ fontSize: '10px', color: '#FB923C' }}>
                  {pending} {derivedPhase === 'PICKUP' ? 'boarding' : 'to drop'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <RouteMap
      stops={stops}
      height={height}
      variantByOrder={variantByOrder}
      nextSequence={next}
      fallback={fallback}
    />
  );
}
