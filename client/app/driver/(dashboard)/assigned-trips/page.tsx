'use client';

import { useState, useEffect } from 'react';
import { MapPin, Users, Clock, Navigation, Check, X, Loader, Calendar } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useToast } from '@/stores/toastStore';

interface Passenger {
  _id: string;
  customerId: { _id: string; name: string } | null;
  pickupLocation: { address: string; coordinates: number[] };
  dropLocation: { address: string; coordinates: number[] };
  pickupOrder: number;
  otp: { code: string; verified: boolean };
  status: string;
}

interface AssignedTrip {
  _id: string;
  serviceDate: string;
  pickupTime: string;
  status: string;
  assignmentStatus: string;
  passengers: Passenger[];
  navigationUrl: string;
}

export default function AssignedTripsPage() {
  const { showToast } = useToast();
  const [trips, setTrips] = useState<AssignedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTrips = async () => {
    try {
      const res = await api.get<AssignedTrip[]>('/driver/assigned-trips');
      setTrips(res.data || []);
    } catch {
      showToast('Failed to load assigned trips', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrips(); }, []);

  const handleAccept = async (tripId: string) => {
    setActionLoading(tripId);
    try {
      await api.post(`/driver/trips/${tripId}/accept`, {});
      showToast('Trip accepted!', 'success');
      fetchTrips();
    } catch (err: any) {
      showToast(err.message || 'Failed to accept', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (tripId: string) => {
    setActionLoading(tripId);
    try {
      await api.post(`/driver/trips/${tripId}/reject`, {});
      showToast('Trip rejected. Reassigning to another driver.', 'info');
      fetchTrips();
    } catch (err: any) {
      showToast(err.message || 'Failed to reject', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}><Loader size={20} className="animate-spin" /> Loading trips...</div>;

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>Assigned Trips</h2>
      <p style={{ fontSize: '13px', color: '#475569', marginBottom: '24px' }}>Your upcoming trip assignments. Accept to lock in, or reject to pass to the next driver.</p>

      {trips.length === 0 ? (
        <div className="driver-glass-card" style={{ padding: '40px', textAlign: 'center' }}>
          <Calendar size={32} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#64748B', fontSize: '14px' }}>No upcoming trip assignments.</p>
          <p style={{ color: '#94A3B8', fontSize: '12px', marginTop: '4px' }}>When customers subscribe in your area, trips will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {trips.map((trip) => (
            <div key={trip._id} className="driver-glass-card" style={{ padding: '20px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    {new Date(trip.serviceDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                    <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                    {trip.pickupTime || '08:00'} AM
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={16} color="#3B82F6" />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{trip.passengers.length} Passengers</span>
                </div>
              </div>

              {/* Passenger List (PDF section 11) */}
              <div style={{ marginBottom: '16px' }}>
                {trip.passengers
                  .sort((a, b) => (a.pickupOrder || 0) - (b.pickupOrder || 0))
                  .map((passenger, idx) => (
                  <div key={passenger._id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderBottom: idx < trip.passengers.length - 1 ? '1px solid rgba(0,0,0,.05)' : 'none' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                      {passenger.pickupOrder || idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{passenger.customerId?.name || 'Customer'}</p>
                      <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                        <MapPin size={10} style={{ display: 'inline' }} /> {passenger.pickupLocation?.address || `${passenger.pickupLocation?.coordinates?.[1]?.toFixed(4)}, ${passenger.pickupLocation?.coordinates?.[0]?.toFixed(4)}`}
                      </p>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: passenger.status === 'COMPLETED' ? '#DCFCE7' : '#F1F5F9', color: passenger.status === 'COMPLETED' ? '#16A34A' : '#64748B' }}>
                      {passenger.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                {(trip.assignmentStatus === 'PENDING' || trip.assignmentStatus === 'OFFERED') && (
                  <>
                    <button
                      onClick={() => handleAccept(trip._id)}
                      disabled={actionLoading === trip._id}
                      style={{ flex: 1, padding: '12px', background: '#16C15D', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      {actionLoading === trip._id ? <Loader size={14} /> : <Check size={14} />} Accept
                    </button>
                    <button
                      onClick={() => handleReject(trip._id)}
                      disabled={actionLoading === trip._id}
                      style={{ flex: 1, padding: '12px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <X size={14} /> Reject
                    </button>
                  </>
                )}

                {trip.assignmentStatus === 'ACCEPTED' && trip.navigationUrl && (
                  <a
                    href={trip.navigationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1, padding: '12px', background: '#0F172A', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Navigation size={14} /> Navigate Route
                  </a>
                )}

                {trip.assignmentStatus === 'ACCEPTED' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#16A34A' }}>
                    <Check size={14} /> Accepted
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
