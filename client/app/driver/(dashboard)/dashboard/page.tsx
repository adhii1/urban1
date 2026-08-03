'use client';

import { useState } from 'react';
import { useDriverTrips, useStartTrip } from '@/lib/hooks/useDriverQueries';
import { MapPin, Users, Play, Clock, Loader, AlertCircle } from 'lucide-react';

export default function DriverDashboardPage() {
  const [scope, setScope] = useState('today');
  const { data: tripsData, isLoading, isError, error } = useDriverTrips(1, 50, scope);
  const startTripMutation = useStartTrip();

  const trips = tripsData || { data: [], meta: undefined };

  const statusColors: Record<string, string> = {
    SCHEDULED: '#F59E0B',
    IN_PROGRESS: '#16C15D',
    COMPLETED: '#64748B',
  };

  if (isLoading) {
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF' }}>Trips</h2>
          <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <Loader size={24} color="#16C15D" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF' }}>Trips</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '32px', color: '#EF4444', fontSize: '12px' }}>
          <AlertCircle size={14} /> {(error as any)?.message || 'Failed to load trips'}
        </div>
      </div>
    );
  }

  const data = trips.data || [];

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF' }}>Trips</h2>
        <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[['today', 'Today'], ['upcoming', 'Upcoming']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setScope(val)}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none',
              background: scope === val ? '#16C15D' : 'rgba(255,255,255,0.08)',
              color: scope === val ? '#FFF' : '#94A3B8',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '40px',
          textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <MapPin size={32} color="rgba(255,255,255,0.2)" style={{ marginBottom: '12px' }} />
          <p style={{ fontSize: '13px', color: '#94A3B8' }}>No trips scheduled for today.</p>
        </div>
      ) : (
        data.map((trip) => (
          <div key={trip._id} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px',
            border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{
                fontSize: '10px', fontWeight: 600, color: statusColors[trip.status] || '#94A3B8',
                background: `${statusColors[trip.status] || '#94A3B8'}20`,
                padding: '4px 10px', borderRadius: '12px',
              }}>
                {trip.status === 'IN_PROGRESS' ? '🟢 ' : trip.status === 'SCHEDULED' ? '🟡 ' : ''}{trip.status}
              </span>
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                {trip.scheduledTime || '--:--'}
              </span>
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#FFF', marginBottom: '8px' }}>
              {trip.route?.name || trip.routeId?.name || 'Unnamed Route'}
            </h3>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} color="#16C15D" />
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  {trip.route?.stops?.length || 0} stops
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} color="#3B82F6" />
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  {trip.manifest?.length || 0} passengers
                </span>
              </div>
            </div>

            {trip.status === 'SCHEDULED' && (
              <button
                onClick={() => startTripMutation.mutate(trip._id)}
                disabled={startTripMutation.isPending}
                style={{
                  width: '100%', padding: '12px',
                  background: startTripMutation.isPending ? '#16A04E' : '#16C15D',
                  color: '#FFF', border: 'none', borderRadius: '10px', fontWeight: 700,
                  fontSize: '13px', cursor: startTripMutation.isPending ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {startTripMutation.isPending ? (
                  <><Loader size={14} /> Starting...</>
                ) : (
                  <><Play size={14} /> Start Trip</>
                )}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
