'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useAdminSocket } from '../../lib/hooks/useAdminSocket';
import { useDrivers } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, RefreshCw, X, MapPin, Navigation, Users, Radio } from 'lucide-react';
import { adminApi } from '../../lib/api/adminApi';

const STATUS_FILTERS = ['ALL', 'SCHEDULED', 'PENDING', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  SCHEDULED: { bg: 'rgba(139,92,246,0.12)', fg: '#8B5CF6' },
  PENDING: { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B' },
  ACCEPTED: { bg: 'rgba(59,130,246,0.12)', fg: '#3B82F6' },
  DRIVER_ARRIVING: { bg: 'rgba(59,130,246,0.12)', fg: '#3B82F6' },
  IN_PROGRESS: { bg: 'rgba(16,185,129,0.12)', fg: '#10B981' },
  COMPLETED: { bg: 'rgba(100,116,139,0.12)', fg: '#64748B' },
  CANCELLED: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444' },
  EXPIRED: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444' },
  SHUTTLE: { bg: 'rgba(59,130,246,0.12)', fg: '#3B82F6' },
};

export default function RidesPage() {
  useAuthGuard();
  const { isConnected, onlineDrivers, activeRides, reassignRide, updateRideLocation } = useAdminSocket();
  const { data: driversData } = useDrivers();
  const drivers = driversData?.success ? (driversData.data || driversData.drivers || []) : [];

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [restRides, setRestRides] = useState<any[]>([]);
  const [reassignModal, setReassignModal] = useState<{ ride: any; open: boolean }>({ ride: null, open: false });
  const [editLocationModal, setEditLocationModal] = useState<{ ride: any; type: 'pickup' | 'drop'; open: boolean }>({
    ride: null, type: 'pickup', open: false,
  });

  // Poll REST endpoint every 5s as fallback for socket
  useEffect(() => {
    const fetchRides = async () => {
      try {
        const res = await adminApi.getRides ? adminApi.getRides() : await fetch('/api/v1/admin/rides', { credentials: 'include' }).then(r => r.json());
        if (res?.success && res?.data) setRestRides(res.data);
      } catch {}
    };
    fetchRides();
    const interval = setInterval(fetchRides, 5000);
    return () => clearInterval(interval);
  }, []);

  // Merge socket rides with REST rides (dedup by _id)
  const allRides = [...activeRides];
  for (const ride of restRides) {
    if (!allRides.find(r => (r._id || r.rideRequestId) === ride._id)) {
      allRides.push(ride);
    }
  }

  const filteredRides = allRides.filter((ride) => {
    const matchesStatus = statusFilter === 'ALL' || ride.status === statusFilter;
    const matchesSearch = !searchTerm ||
      (ride.pickupLocation?.address || ride.pickup || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ride.dropLocation?.address || ride.drop || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleReassign = (driverId: string) => {
    if (reassignModal.ride) {
      reassignRide(reassignModal.ride._id || reassignModal.ride.rideRequestId, driverId);
      setReassignModal({ ride: null, open: false });
    }
  };

  const handleLocationUpdate = (address: string, coordinates: [number, number]) => {
    if (editLocationModal.ride) {
      updateRideLocation(
        editLocationModal.ride._id || editLocationModal.ride.rideRequestId,
        editLocationModal.type,
        address,
        coordinates
      );
      setEditLocationModal({ ride: null, type: 'pickup', open: false });
    }
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        {/* Header */}
        <div className="flex-between" style={{ marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Radio size={18} color={isConnected ? '#10B981' : '#94A3B8'} />
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
                Live Rides
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>
              Real-time ride monitoring and admin overrides • {onlineDrivers} drivers online
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card" style={{ padding: '14px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                type="text"
                placeholder="Search by pickup or drop..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  style={{
                    padding: '6px 12px',
                    fontSize: '10px',
                    fontWeight: 700,
                    borderRadius: '16px',
                    border: '1px solid var(--border-color)',
                    background: statusFilter === status ? 'var(--accent-primary)' : 'transparent',
                    color: statusFilter === status ? '#FFF' : 'var(--text-light)',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Rides list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredRides.length === 0 ? (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
              <Navigation size={32} color="var(--text-light)" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '13px', color: 'var(--text-light)' }}>
                {activeRides.length === 0 && restRides.length === 0 ? 'No active rides. Waiting for new requests...' : 'No rides match your filters.'}
              </p>
            </div>
          ) : (
            filteredRides.map((ride) => {
              const statusStyle = STATUS_COLORS[ride.status] || STATUS_COLORS.PENDING;
              const rideId = ride._id || ride.rideRequestId;
              return (
                <div key={rideId} className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <p style={{ fontSize: '9px', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                        Ride #{rideId?.toString().slice(-6) || 'unknown'}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600 }}>
                        {new Date(ride.requestedAt || ride.createdAt || Date.now()).toLocaleTimeString()}
                      </p>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: statusStyle.bg,
                      color: statusStyle.fg,
                    }}>
                      {ride.status}
                    </span>
                  </div>

                  {/* Pickup / Drop */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                      <div style={{ width: '1px', flex: 1, background: 'var(--border-color)', minHeight: '20px' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600 }}>
                        {ride.pickupLocation?.address || ride.pickup || 'Unknown pickup'}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600, marginTop: '12px' }}>
                        {ride.dropLocation?.address || ride.drop || 'Unknown drop'}
                      </p>
                    </div>
                  </div>

                  {/* Driver info */}
                  {ride.acceptedDriverId && (
                    <p style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '12px' }}>
                      <Users size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      Driver: {ride.acceptedDriverId.name || 'Assigned'}
                    </p>
                  )}

                  {/* Shuttle / route info */}
                  {ride.type === 'SHUTTLE' && (
                    <div style={{ padding: '6px 10px', background: 'rgba(59,130,246,0.08)', borderRadius: '8px', marginBottom: '12px', fontSize: '10px' }}>
                      <span style={{ fontWeight: 700, color: '#3B82F6' }}>🚐 SHUTTLE</span>
                      {ride.routeName && <span style={{ marginLeft: '8px', color: 'var(--text-light)' }}>{ride.routeName}</span>}
                      {ride.passengerCount && <span style={{ marginLeft: '8px', color: 'var(--text-main)', fontWeight: 600 }}>{ride.passengerCount} passengers</span>}
                    </div>
                  )}

                  {/* Customer name */}
                  {ride.customerName && !ride.type && (
                    <p style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '8px' }}>
                      👤 {ride.customerName}
                    </p>
                  )}

                  {/* ETA info */}
                  {ride.status === 'DRIVER_ARRIVING' && ride.etaMinutes && (
                    <p style={{ fontSize: '10px', color: '#3B82F6', marginBottom: '12px', fontWeight: 600 }}>
                      Driver arriving in ~{ride.etaMinutes} min
                    </p>
                  )}

                  {/* Scheduled pickup time */}
                  {ride.status === 'SCHEDULED' && ride.scheduledPickupTime && (
                    <p style={{ fontSize: '10px', color: '#8B5CF6', marginBottom: '12px', fontWeight: 600 }}>
                      ⏰ Scheduled pickup: {new Date(ride.scheduledPickupTime).toLocaleTimeString()}
                    </p>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setReassignModal({ ride, open: true })}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-hover)',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      Reassign
                    </button>
                    <button
                      onClick={() => setEditLocationModal({ ride, type: 'pickup', open: true })}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-hover)',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                      }}
                    >
                      <MapPin size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      Edit Pickup
                    </button>
                    <button
                      onClick={() => setEditLocationModal({ ride, type: 'drop', open: true })}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-hover)',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                      }}
                    >
                      <Navigation size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      Edit Drop
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reassign Modal */}
        {reassignModal.open && (
          <Modal title="Reassign Ride to Driver" onClose={() => setReassignModal({ ride: null, open: false })}>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {drivers.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-light)', textAlign: 'center', padding: '20px' }}>No drivers available</p>
              ) : (
                drivers.filter((d: any) => d.status === 'ACTIVE').map((driver: any) => (
                  <button
                    key={driver._id}
                    onClick={() => handleReassign(driver._id)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      marginBottom: '6px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--text-main)',
                    }}
                  >
                    <p style={{ fontSize: '12px', fontWeight: 600 }}>{driver.name}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text-light)' }}>{driver.vehicleNumber} • {driver.vehicleModel}</p>
                  </button>
                ))
              )}
            </div>
          </Modal>
        )}

        {/* Edit Location Modal */}
        {editLocationModal.open && (
          <EditLocationModal
            type={editLocationModal.type}
            currentAddress={
              editLocationModal.type === 'pickup'
                ? editLocationModal.ride.pickupLocation?.address
                : editLocationModal.ride.dropLocation?.address
            }
            currentCoordinates={
              editLocationModal.type === 'pickup'
                ? editLocationModal.ride.pickupLocation?.coordinates?.coordinates
                : editLocationModal.ride.dropLocation?.coordinates?.coordinates
            }
            onClose={() => setEditLocationModal({ ride: null, type: 'pickup', open: false })}
            onSave={handleLocationUpdate}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card"
        style={{ width: '100%', maxWidth: '440px', padding: '20px', background: 'var(--bg-card-solid)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditLocationModal({
  type, currentAddress, currentCoordinates, onClose, onSave,
}: {
  type: 'pickup' | 'drop';
  currentAddress?: string;
  currentCoordinates?: [number, number];
  onClose: () => void;
  onSave: (address: string, coordinates: [number, number]) => void;
}) {
  const [address, setAddress] = useState(currentAddress || '');
  const [lng, setLng] = useState(currentCoordinates?.[0]?.toString() || '');
  const [lat, setLat] = useState(currentCoordinates?.[1]?.toString() || '');

  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    if (!address) { setValidationError('Address is required.'); return; }
    const lngNum = parseFloat(lng);
    const latNum = parseFloat(lat);
    if (isNaN(lngNum) || isNaN(latNum)) { setValidationError('Valid longitude and latitude are required.'); return; }
    onSave(address, [lngNum, latNum]);
  };

  return (
    <Modal title={`Edit ${type === 'pickup' ? 'Pickup' : 'Drop'} Location`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
            Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            style={{
              width: '100%', padding: '8px 10px', fontSize: '12px',
              background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
              borderRadius: '8px', color: 'var(--text-main)', outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
              style={{
                width: '100%', padding: '8px 10px', fontSize: '12px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                borderRadius: '8px', color: 'var(--text-main)', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
              Latitude
            </label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
              style={{
                width: '100%', padding: '8px 10px', fontSize: '12px',
                background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                borderRadius: '8px', color: 'var(--text-main)', outline: 'none',
              }}
            />
          </div>
        </div>
        {validationError && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', fontSize: '11px', color: '#EF4444', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
            {validationError}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700,
            borderRadius: '8px', border: '1px solid var(--border-color)',
            background: 'var(--bg-hover)', color: 'var(--text-main)', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button type="submit" style={{
            flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700,
            borderRadius: '8px', border: 'none',
            background: 'var(--accent-primary)', color: '#FFF', cursor: 'pointer',
          }}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
