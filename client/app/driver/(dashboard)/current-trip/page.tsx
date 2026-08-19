'use client';

import { useMemo } from 'react';
import { useDriverTrips, useDriverTrip, useStartTrip, useCompleteTrip, useUpdateManifest } from '@/lib/hooks/useDriverQueries';
import TripManifestMap from '@/components/shared/TripManifestMap';
import {
  getTripPhase,
  nextStopSequence,
  pendingCountAtStop,
  stopDisplayName,
  type ManifestEntry,
  type StopLike,
  type TripPhase,
} from '@/lib/geo';
import { MapPin, Play, CheckCircle, Users, Loader, AlertCircle } from 'lucide-react';

export default function DriverCurrentTripPage() {
  const { data: tripsData, isLoading, isError, error } = useDriverTrips(1, 50);
  const startTripMutation = useStartTrip();
  const completeTripMutation = useCompleteTrip();
  const updateManifestMutation = useUpdateManifest();

  const activeTripFromList = useMemo(() => {
    if (!tripsData?.data) return null;
    return tripsData.data.find(
      (t) => t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS',
    ) || null;
  }, [tripsData?.data]);

  const activeTripId = activeTripFromList?._id;
  const isInProgress = activeTripFromList?.status === 'IN_PROGRESS';

  const { data: tripDetail, isLoading: detailLoading } = useDriverTrip(
    activeTripId || '',
  );

  const currentTrip = tripDetail || activeTripFromList;

  const stops: StopLike[] = useMemo(
    () => (currentTrip ? currentTrip.route?.stops || currentTrip.routeId?.stops || [] : []),
    [currentTrip],
  );
  const manifest: ManifestEntry[] = useMemo(
    () => (currentTrip ? (currentTrip.manifest || []).filter((m: ManifestEntry) => m.customer) : []),
    [currentTrip],
  );
  const phase: TripPhase = useMemo(() => getTripPhase(manifest), [manifest]);
  const next: number | null = useMemo(() => nextStopSequence(manifest, phase), [manifest, phase]);
  const nextStop: StopLike | null = useMemo(() => {
    if (next == null) return null;
    return stops.find((s) => s.sequenceOrder === next) || null;
  }, [stops, next]);

  const isActing = startTripMutation.isPending || completeTripMutation.isPending || updateManifestMutation.isPending;

  if (isLoading) {
    return (
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '16px' }}>Current Trip</h2>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <Loader size={24} color="#16C15D" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '16px' }}>Current Trip</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '32px', color: '#EF4444', fontSize: '12px' }}>
          <AlertCircle size={14} /> {(error as any)?.message || 'Failed to load'}
        </div>
      </div>
    );
  }

  if (!currentTrip) {
    return (
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '16px' }}>Current Trip</h2>
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '40px',
          textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <MapPin size={32} color="rgba(255,255,255,0.2)" style={{ marginBottom: '12px' }} />
          <p style={{ fontSize: '13px', color: '#94A3B8' }}>No active trip. Check Dashboard for scheduled trips.</p>
        </div>
      </div>
    );
  }

  const phaseLabel: Record<TripPhase, string> = {
    PICKUP: 'Pickup phase',
    DROP: 'Drop-off phase',
    DONE: 'All passengers dropped',
  };

  const bannerText = (() => {
    if (phase === 'DONE') return 'Everyone has been dropped off — you can complete the trip.';
    const count = next != null ? pendingCountAtStop(manifest, next, phase) : 0;
    if (next == null) return 'No pending passengers in this phase.';
    return `Next ${phase === 'PICKUP' ? 'pickup' : 'drop'}: ${stopDisplayName(nextStop)} — ${count} ${phase === 'PICKUP' ? 'waiting' : 'to drop'}`;
  })();

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '16px' }}>Current Trip</h2>

      {updateManifestMutation.isError && (
        <div style={{
          padding: '10px', marginBottom: '16px', background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
          color: '#EF4444', fontSize: '12px', textAlign: 'center',
        }}>
          {(updateManifestMutation.error as any)?.message || 'Action failed'}
        </div>
      )}

      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '16px',
        border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: 'monospace' }}>
            #{currentTrip._id?.slice(-6).toUpperCase()}
          </span>
          <span style={{
            fontSize: '11px', fontWeight: 600,
            color: currentTrip.status === 'IN_PROGRESS' ? '#16C15D' : '#F59E0B',
          }}>
            {currentTrip.status}
          </span>
        </div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#FFF', marginBottom: '4px' }}>
          {currentTrip.route?.name || currentTrip.routeId?.name || 'Route'}
        </h3>
        {currentTrip.status === 'IN_PROGRESS' && (
          <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px' }}>
            {phaseLabel[phase]}
          </p>
        )}

        <div style={{ marginBottom: '12px' }}>
          <TripManifestMap stops={stops} manifest={manifest} phase={phase} height={240} />
        </div>

        {currentTrip.status === 'IN_PROGRESS' && (
          <div style={{
            padding: '10px 12px',
            background: phase === 'DONE' ? 'rgba(22,193,93,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${phase === 'DONE' ? 'rgba(22,193,93,0.25)' : 'rgba(245,158,11,0.25)'}`,
            borderRadius: '10px', fontSize: '12px',
            color: phase === 'DONE' ? '#16C15D' : '#F59E0B', fontWeight: 600,
          }}>
            {bannerText}
          </div>
        )}
      </div>

      {manifest.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '16px',
          border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px',
        }}>
          <p style={{
            fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, marginBottom: '12px',
          }}>
            <Users size={11} style={{ marginRight: 6, verticalAlign: -1 }} />
            Passengers ({manifest.length})
          </p>
          {detailLoading && manifest.length > 0 && (
            <p style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center', marginBottom: '8px' }}>
              <Loader size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Refreshing...
            </p>
          )}
          {manifest.map((entry, i) => {
            const customerId =
              (entry.customer && (entry.customer as { _id?: string })._id) ||
              (entry.customer as string);
            const customerName =
              (entry.customer && (entry.customer as { name?: string }).name) || 'Passenger';
            const targetStop = phase === 'PICKUP' ? entry.pickupStop : entry.dropStop;
            const statusColor: Record<string, string> = {
              PENDING: '#F59E0B', BOARDED: '#3B82F6', DROPPED: '#16C15D', 'NO_SHOW': '#EF4444',
            };
            return (
              <div key={customerId || i} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0',
                borderBottom: i < manifest.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'rgba(22,193,93,0.12)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#16C15D',
                }}>
                  {customerName[0]?.toUpperCase() || 'P'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#FFF', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {customerName}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                    {phase === 'PICKUP' ? 'Pickup' : 'Drop'}: {stopDisplayName(targetStop)}
                  </div>
                </div>
                <div style={{
                  fontSize: '10px', fontWeight: 700, color: statusColor[entry.status] || '#94A3B8',
                  padding: '2px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
                }}>
                  {entry.status}
                </div>
                {isInProgress && entry.status === 'PENDING' && phase === 'PICKUP' && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      disabled={isActing}
                      onClick={() => updateManifestMutation.mutate({ tripId: currentTrip._id, customerId, action: 'board' })}
                      style={{
                        padding: '6px 10px', background: '#16C15D', color: '#FFF', border: 'none',
                        borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                        cursor: isActing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Board
                    </button>
                    <button
                      disabled={isActing}
                      onClick={() => updateManifestMutation.mutate({ tripId: currentTrip._id, customerId, action: 'no-show' })}
                      style={{
                        padding: '6px 10px', background: 'rgba(239,68,68,0.15)', color: '#EF4444',
                        border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px',
                        fontSize: '10px', fontWeight: 700,
                        cursor: isActing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      No-show
                    </button>
                  </div>
                )}
                {isInProgress && entry.status === 'BOARDED' && phase === 'DROP' && (
                  <button
                    disabled={isActing}
                    onClick={() => updateManifestMutation.mutate({ tripId: currentTrip._id, customerId, action: 'drop' })}
                    style={{
                      padding: '6px 10px', background: '#3B82F6', color: '#FFF', border: 'none',
                      borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                      cursor: isActing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Drop
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        {currentTrip.status === 'SCHEDULED' && (
          <button
            onClick={() => startTripMutation.mutate(currentTrip._id)}
            disabled={isActing}
            style={{
              flex: 1, padding: '14px',
              background: isActing ? '#16A04E' : '#16C15D',
              color: '#FFF', border: 'none', borderRadius: '12px', fontWeight: 700,
              fontSize: '13px', cursor: isActing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {isActing ? <><Loader size={16} /> Starting...</> : <><Play size={16} /> Start Trip</>}
          </button>
        )}
        {currentTrip.status === 'IN_PROGRESS' && (
          <button
            onClick={() => completeTripMutation.mutate(currentTrip._id)}
            disabled={isActing}
            style={{
              flex: 1, padding: '14px',
              background: isActing ? '#14A044' : '#16C15D',
              color: '#FFF', border: 'none', borderRadius: '12px', fontWeight: 700,
              fontSize: '13px', cursor: isActing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {isActing ? <><Loader size={16} /> Completing...</> : <><CheckCircle size={16} /> Complete Trip</>}
          </button>
        )}
      </div>
    </div>
  );
}
