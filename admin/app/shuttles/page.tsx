'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useAdminSocket } from '../../lib/hooks/useAdminSocket';
import { useState, useEffect } from 'react';
import { Bus, RefreshCw, X, MapPin, Users, Car, CheckCircle2 } from 'lucide-react';

const SHUTTLE_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: 'rgba(37,99,235,0.12)', fg: '#3B82F6' },
  COMPLETED: { bg: 'rgba(16,185,129,0.12)', fg: '#10B981' },
  CANCELLED: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444' },
};

export default function ShuttlesPage() {
  useAuthGuard();
  const { isConnected, activeShuttles, fetchActiveShuttles, fetchShuttleDetail, cancelShuttle } = useAdminSocket();
  const [detailModal, setDetailModal] = useState<{ shuttle: any; open: boolean }>({ shuttle: null, open: false });

  useEffect(() => {
    if (isConnected) fetchActiveShuttles();
  }, [isConnected, fetchActiveShuttles]);

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bus size={18} color="#3B82F6" />
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
                Shuttle Sessions
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>
              Monitor and manage active shuttle trips
            </p>
          </div>
          <button
            onClick={fetchActiveShuttles}
            style={{
              padding: '8px 16px', background: 'var(--bg-hover)',
              border: '1px solid var(--border-color)', borderRadius: '8px',
              color: 'var(--text-main)', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {activeShuttles.length === 0 ? (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
            <Bus size={32} color="var(--text-light)" style={{ marginBottom: '12px' }} />
            <p style={{ fontSize: '13px', color: 'var(--text-light)' }}>
              No active shuttle sessions.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeShuttles.map((shuttle: any) => {
              const statusStyle = SHUTTLE_STATUS_COLORS[shuttle.status] || SHUTTLE_STATUS_COLORS.ACTIVE;
              const rideCount = shuttle.rides?.length || shuttle.totalRides || 0;
              const completedCount = shuttle.rides?.filter((r: any) => r.status === 'COMPLETED').length || shuttle.completedRides || 0;
              const pendingPickups = shuttle.sequence?.filter((s: any) => s.type === 'PICKUP' && s.status === 'PENDING').length || 0;
              const pendingDrops = shuttle.sequence?.filter((s: any) => s.type === 'DROP' && s.status === 'PENDING').length || 0;

              return (
                <div key={shuttle._id} className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <p style={{ fontSize: '9px', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                        Shuttle #{shuttle._id?.toString().slice(-6) || 'unknown'}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600 }}>
                        {shuttle.driverId?.name || 'Unknown Driver'} — {shuttle.driverId?.vehicleNumber || ''}
                      </p>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '4px 10px',
                      borderRadius: '12px', background: statusStyle.bg, color: statusStyle.fg,
                    }}>
                      {shuttle.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={12} color="var(--text-light)" />
                      <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                        {rideCount} ride{rideCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={12} color="#10B981" />
                      <span style={{ fontSize: '11px', color: '#10B981' }}>
                        {completedCount} completed
                      </span>
                    </div>
                    {pendingPickups > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={12} color="#F59E0B" />
                        <span style={{ fontSize: '11px', color: '#F59E0B' }}>
                          {pendingPickups} pickup{pendingPickups !== 1 ? 's' : ''} pending
                        </span>
                      </div>
                    )}
                    {pendingDrops > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={12} color="#EF4444" />
                        <span style={{ fontSize: '11px', color: '#EF4444' }}>
                          {pendingDrops} drop{pendingDrops !== 1 ? 's' : ''} pending
                        </span>
                      </div>
                    )}
                  </div>

                  {shuttle.rides && shuttle.rides.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      {shuttle.rides.map((ride: any) => {
                        const rideStatusColors: Record<string, string> = {
                          PENDING: '#F59E0B', ACCEPTED: '#3B82F6', DRIVER_ARRIVING: '#3B82F6',
                          IN_PROGRESS: '#10B981', COMPLETED: '#64748B', CANCELLED: '#EF4444',
                        };
                        return (
                          <div key={ride._id} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 0', borderBottom: '1px solid var(--border-color)',
                          }}>
                            <span style={{
                              width: '6px', height: '6px', borderRadius: '50%',
                              background: rideStatusColors[ride.status] || '#64748B',
                            }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-main)', fontWeight: 600, flex: 1 }}>
                              {ride.customerName || 'Customer'}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>
                              {ride.pickupLocation?.address?.slice(0, 30) || 'Pickup'}
                            </span>
                            <span style={{
                              fontSize: '9px', fontWeight: 700, padding: '2px 6px',
                              borderRadius: '8px', background: `${rideStatusColors[ride.status]}20`,
                              color: rideStatusColors[ride.status],
                            }}>
                              {ride.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => {
                        fetchShuttleDetail(shuttle._id);
                        setDetailModal({ shuttle, open: true });
                      }}
                      style={{
                        flex: 1, padding: '8px', fontSize: '10px', fontWeight: 700,
                        borderRadius: '8px', border: '1px solid var(--border-color)',
                        background: 'var(--bg-hover)', color: 'var(--text-main)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                      }}
                    >
                      <Car size={10} /> View Details
                    </button>
                    {shuttle.status === 'ACTIVE' && (
                      <button
                        onClick={() => {
                          if (confirm(`Cancel shuttle #${shuttle._id?.toString().slice(-6)}? All customers will need to re-book.`)) {
                            cancelShuttle(shuttle._id);
                          }
                        }}
                        style={{
                          padding: '8px 14px', fontSize: '10px', fontWeight: 700,
                          borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
                          background: 'rgba(239,68,68,0.1)', color: '#EF4444', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        }}
                      >
                        <X size={10} /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {detailModal.open && detailModal.shuttle && (
          <ShuttleDetailModal
            shuttle={detailModal.shuttle}
            onClose={() => setDetailModal({ shuttle: null, open: false })}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function ShuttleDetailModal({ shuttle, onClose }: { shuttle: any; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const sequence = shuttle.sequence || [];
  const rides = shuttle.rides || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card"
        style={{ width: '100%', maxWidth: '520px', padding: '20px', background: 'var(--bg-card-solid)', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)' }}>
            Shuttle #{shuttle._id?.toString().slice(-6)}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        {shuttle.driver && (
          <div style={{ marginBottom: '14px', padding: '10px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
            <p style={{ fontSize: '10px', color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: '4px' }}>Driver</p>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: 700 }}>{shuttle.driver.name}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-light)' }}>
              {shuttle.driver.vehicleNumber} — {shuttle.driver.vehicleModel} (Cap: {shuttle.driver.vehicleCapacity})
            </p>
            {shuttle.driver.userId?.phone && (
              <p style={{ fontSize: '11px', color: 'var(--text-light)' }}>Phone: {shuttle.driver.userId.phone}</p>
            )}
          </div>
        )}

        <p style={{ fontSize: '10px', color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>
          Route Sequence ({sequence.length} stops)
        </p>
        {sequence.map((entry: any, idx: number) => {
          const isPickup = entry.type === 'PICKUP';
          const isCompleted = entry.status === 'COMPLETED';
          const color = isCompleted ? '#64748B' : isPickup ? '#16C15D' : '#EF4444';
          return (
            <div key={idx} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '8px 0', borderBottom: '1px solid var(--border-color)',
            }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: isPickup ? '50%' : '4px',
                background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {entry.sequenceOrder}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600 }}>
                    {entry.customerName || 'Customer'}
                  </span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '8px',
                    background: isCompleted ? 'rgba(16,185,129,0.1)' : isPickup ? 'rgba(22,193,93,0.1)' : 'rgba(239,68,68,0.1)',
                    color: isCompleted ? '#10B981' : isPickup ? '#16C15D' : '#EF4444',
                  }}>
                    {entry.type} {isCompleted ? '✓' : ''}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                  {entry.location?.address || 'Unknown'}
                </p>
              </div>
            </div>
          );
        })}

        {rides.length > 0 && (
          <>
            <p style={{ fontSize: '10px', color: 'var(--text-light)', textTransform: 'uppercase', marginTop: '14px', marginBottom: '8px', fontWeight: 700 }}>
              Rides ({rides.length})
            </p>
            {rides.map((ride: any) => (
              <div key={ride._id} style={{
                padding: '8px', marginBottom: '6px', background: 'var(--bg-hover)', borderRadius: '8px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {ride.customerName || 'Customer'}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>
                    {ride.status}
                  </span>
                </div>
                <p style={{ fontSize: '10px', color: 'var(--text-light)' }}>
                  {ride.pickupLocation?.address} → {ride.dropLocation?.address}
                </p>
                {ride.fare?.estimated && (
                  <p style={{ fontSize: '11px', color: '#10B981', fontWeight: 700 }}>
                    ₹{ride.fare.estimated}
                  </p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}