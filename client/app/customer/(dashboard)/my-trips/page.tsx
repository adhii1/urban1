'use client';

import { useState } from 'react';
import RouteMap from '@/components/shared/RouteMap';
import { type StopLike } from '@/lib/geo';
import { MapPin, User, Clock, ArrowLeft, Bus, Loader, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { useCustomerTrips, useCustomerTrip } from '@/lib/hooks/useCustomerQueries';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  SCHEDULED: { bg: '#DBEAFE', color: '#2563EB' },
  IN_PROGRESS: { bg: '#DCFCE7', color: '#16C15D' },
  COMPLETED: { bg: '#F1F5F9', color: '#64748B' },
  CANCELLED: { bg: '#FEE2E2', color: '#EF4444' },
};

const MANIFEST_STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: '#FEF3C7', color: '#B45309', label: 'Pickup pending' },
  BOARDED: { bg: '#DBEAFE', color: '#2563EB', label: 'On board' },
  DROPPED: { bg: '#DCFCE7', color: '#16C15D', label: 'Dropped off' },
  'NO_SHOW': { bg: '#FEE2E2', color: '#EF4444', label: 'No-show' },
};

const PAGE_SIZE = 10;

export default function CustomerMyTripsPage() {
  const [filter, setFilter] = useState('all');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: tripsData, isLoading, isError, error } = useCustomerTrips(page, PAGE_SIZE);
  const { data: selectedTrip, isLoading: tripLoading } = useCustomerTrip(selectedTripId || '');

  const trips = tripsData?.data || [];
  const meta = tripsData?.meta;

  const filteredTrips =
    filter === 'all'
      ? trips
      : filter === 'upcoming'
        ? trips.filter((t) => t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS')
        : trips.filter((t) => t.status === filter.toUpperCase());

  if (selectedTripId && selectedTrip) {
    const route = selectedTrip.routeId || {};
    const stops: StopLike[] = route.stops || [];
    const myEntry = selectedTrip.myEntry;
    const pickupSequence = myEntry?.pickupStop?.sequenceOrder ?? null;
    const dropSequence = myEntry?.dropStop?.sequenceOrder ?? null;
    const driver = selectedTrip.driverId;
    const manifestStatus = myEntry?.status ? MANIFEST_STATUS_COLORS[myEntry.status] : null;
    const tripStatus = STATUS_COLORS[selectedTrip.status || 'COMPLETED'] || STATUS_COLORS.COMPLETED;

    return (
      <div>
        <button
          onClick={() => setSelectedTripId(null)}
          style={{
            background: 'none', border: 'none', color: '#16C15D', fontWeight: 600,
            fontSize: '13px', cursor: 'pointer', marginBottom: '12px',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}
        >
          <ArrowLeft size={14} /> Back to trips
        </button>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>Trip Details</h2>

        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{route.name || 'Trip'}</span>
            <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '10px', fontWeight: 600, background: tripStatus.bg, color: tripStatus.color }}>
              {selectedTrip.status}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#F0FDF4', borderRadius: '10px' }}>
              <MapPin size={14} color="#16C15D" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Pickup</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{myEntry?.pickupStop?.stopName || '—'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#EFF6FF', borderRadius: '10px' }}>
              <MapPin size={14} color="#3B82F6" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: '#64748B' }}>Drop</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{myEntry?.dropStop?.stopName || '—'}</div>
              </div>
            </div>
            {manifestStatus && (
              <div style={{ padding: '8px 12px', background: manifestStatus.bg, borderRadius: '10px', fontSize: '12px', fontWeight: 600, color: manifestStatus.color }}>
                {manifestStatus.label}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <RouteMap stops={stops} accentPickupSequence={pickupSequence} accentDropSequence={dropSequence} height={220} />
          </div>

          {driver && (
            <div style={{ padding: '10px', background: '#F8FAFC', borderRadius: '10px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <User size={14} color="#64748B" />
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>Driver</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                    {driver.name}{driver.vehicleNumber ? ` · ${driver.vehicleNumber}` : ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748B' }}>
            <Clock size={14} />
            {selectedTrip.tripDate
              ? new Date(selectedTrip.tripDate).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
              : '—'}
          </div>

          {/* Fare and Trip Details */}
          {selectedTrip.fare && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginBottom: '8px' }}>FARE DETAILS</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Estimated Fare</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>₹{selectedTrip.fare.estimated}</span>
              </div>
              {selectedTrip.fare.final && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Final Fare</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#16C15D' }}>₹{selectedTrip.fare.final}</span>
                </div>
              )}
              {selectedTrip.fare.details && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '11px', color: '#94A3B8' }}>
                    <span>Distance</span>
                    <span>{selectedTrip.fare.details.distanceKm} km</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94A3B8' }}>
                    <span>Duration</span>
                    <span>{selectedTrip.fare.details.durationMinutes} min</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tripLoading && selectedTripId) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Loader size={24} color="#16C15D" />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>My Trips</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
        {['all', 'upcoming', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none',
              background: filter === f ? '#16C15D' : '#F1F5F9',
              color: filter === f ? '#FFF' : '#64748B',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Loader size={24} color="#16C15D" />
        </div>
      ) : isError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '32px', color: '#EF4444', fontSize: '12px' }}>
          <AlertCircle size={14} /> {(error as any)?.message || 'Failed to load trips'}
        </div>
      ) : filteredTrips.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontSize: '12px' }}>No trips found.</p>
      ) : (
        <>
          {filteredTrips.map((trip, i) => {
            const sc = STATUS_COLORS[trip.status || 'COMPLETED'] || STATUS_COLORS.COMPLETED;
            const pickupName = trip.myEntry?.pickupStop?.stopName;
            const dropName = trip.myEntry?.dropStop?.stopName;
            return (
              <div
                key={trip._id || i}
                onClick={() => setSelectedTripId(trip._id)}
                style={{
                  background: '#FFF', borderRadius: '14px', padding: '16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '12px',
                  cursor: 'pointer', border: '1px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Bus size={14} color="#16C15D" />
                    {trip.routeId?.name || 'Trip'}
                  </span>
                  <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 600, background: sc.bg, color: sc.color }}>
                    {trip.status}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151' }}>
                    <MapPin size={12} color="#16C15D" /> {pickupName || '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151' }}>
                    <MapPin size={12} color="#EF4444" /> {dropName || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', color: '#64748B' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {trip.tripDate ? new Date(trip.tripDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                  </span>
                  {trip.driverId && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={12} />
                      {trip.driverId.name}
                    </span>
                  )}
                </div>
                {trip.fare && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #F1F5F9', fontSize: '11px' }}>
                    <span style={{ color: '#64748B' }}>
                      {trip.fare.details?.distanceKm && `${trip.fare.details.distanceKm} km`}
                      {trip.fare.details?.durationMinutes && ` · ${trip.fare.details.durationMinutes} min`}
                    </span>
                    <span style={{ fontWeight: 600, color: trip.fare.final ? '#16C15D' : '#0F172A' }}>
                      ₹{trip.fare.final || trip.fare.estimated}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
                  background: page <= 1 ? '#F1F5F9' : '#16C15D', color: page <= 1 ? '#94A3B8' : '#FFF',
                  border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
                  background: page >= meta.totalPages ? '#F1F5F9' : '#16C15D',
                  color: page >= meta.totalPages ? '#94A3B8' : '#FFF',
                  border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                  cursor: page >= meta.totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
