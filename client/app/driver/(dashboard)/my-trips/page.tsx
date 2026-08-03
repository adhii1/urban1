'use client';

import { useState } from 'react';
import { useDriverTrips, useDriverEarnings } from '@/lib/hooks/useDriverQueries';
import { MapPin, Users, Loader, AlertCircle, ChevronLeft, ChevronRight, DollarSign, Clock, TrendingUp } from 'lucide-react';

const PAGE_SIZE = 10;

export default function DriverMyTripsPage() {
  const [scope, setScope] = useState('today');
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const { data: tripsData, isLoading, isError, error } = useDriverTrips(page, PAGE_SIZE, scope);
  const { data: earnings } = useDriverEarnings(scope);

  const trips = tripsData?.data || [];
  const meta = tripsData?.meta;

  const statusColors: Record<string, string> = {
    SCHEDULED: '#F59E0B',
    IN_PROGRESS: '#16C15D',
    COMPLETED: '#64748B',
    CANCELLED: '#EF4444',
  };

  const filtered = trips.filter((t) => (filter === 'ALL' ? true : t.status === filter));

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '16px' }}>My Trips</h2>

      {/* Earnings Summary Card */}
      {earnings && earnings.totalTrips > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(22,193,93,0.15) 0%, rgba(22,193,93,0.05) 100%)',
          border: '1px solid rgba(22,193,93,0.3)',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Earnings Summary ({scope === 'today' ? 'Today' : scope === 'upcoming' ? 'Upcoming' : 'All Time'})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <DollarSign size={14} color="#16C15D" />
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>Total Earnings</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#16C15D' }}>
                ₹{earnings.totalEarnings}
              </div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <TrendingUp size={14} color="#3B82F6" />
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>Total Trips</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#3B82F6' }}>
                {earnings.totalTrips}
              </div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <MapPin size={14} color="#F59E0B" />
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>Distance</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#F59E0B' }}>
                {earnings.totalDistance} km
              </div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Clock size={14} color="#EF4444" />
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>Time</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>
                {Math.floor(earnings.totalDuration / 60)}h {earnings.totalDuration % 60}m
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto' }}>
        {['today', 'upcoming', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => { setScope(s); setPage(1); }}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none',
              background: scope === s ? '#16C15D' : 'rgba(255,255,255,0.08)',
              color: scope === s ? '#FFF' : '#94A3B8',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
        {['ALL', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none',
              background: filter === f ? '#16C15D' : 'rgba(255,255,255,0.08)',
              color: filter === f ? '#FFF' : '#94A3B8',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {f === 'ALL' ? 'All' : f.replace('_', ' ')}
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
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '32px',
          textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <MapPin size={24} color="rgba(255,255,255,0.2)" style={{ marginBottom: '8px' }} />
          <p style={{ fontSize: '12px', color: '#94A3B8' }}>No trips found.</p>
        </div>
      ) : (
        <>
          {filtered.map((trip, i) => (
            <div key={trip._id || i} style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px',
              border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
                  #{(trip._id || '').slice(-6).toUpperCase()}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: statusColors[trip.status] || '#94A3B8' }}>
                  {trip.status?.replace('_', ' ')}
                </span>
              </div>
              <h4 style={{ fontSize: '13px', color: '#FFF', fontWeight: 600, marginBottom: '4px' }}>
                {trip.route?.name || trip.routeId?.name || 'Route'}
              </h4>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>
                {new Date(trip.tripDate || Date.now()).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={12} /> {trip.manifest?.length || 0} passengers
                </span>
                {trip.route?.stops && (
                  <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> {trip.route.stops.length} stops
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
                  background: page <= 1 ? 'rgba(255,255,255,0.05)' : '#16C15D',
                  color: page <= 1 ? '#64748B' : '#FFF',
                  border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px',
                  background: page >= meta.totalPages ? 'rgba(255,255,255,0.05)' : '#16C15D',
                  color: page >= meta.totalPages ? '#64748B' : '#FFF',
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
