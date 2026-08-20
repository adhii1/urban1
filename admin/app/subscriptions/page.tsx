'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useSubscriptions } from '../../lib/hooks/useAdminQueries';
import { useState } from 'react';
import { Search, Users, MapPin, Calendar, Clock, UserCheck, AlertCircle, Loader } from 'lucide-react';
import { apiFetch } from '../../lib/api/adminApi';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#DCFCE7', color: '#16A34A' },
  PENDING: { bg: '#FEF3C7', color: '#D97706' },
  PAUSED: { bg: '#FEF3C7', color: '#D97706' },
  CANCELLED: { bg: '#FEE2E2', color: '#DC2626' },
  COMPLETED: { bg: '#F1F5F9', color: '#64748B' },
  PENDING_PAYMENT: { bg: '#DBEAFE', color: '#2563EB' },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SubscriptionsPage() {
  useAuthGuard();
  const { data, isLoading, refetch } = useSubscriptions();
  const subscriptions = data?.success ? (data.data || []) : [];
  const [searchTerm, setSearchTerm] = useState('');
  const [matchingId, setMatchingId] = useState<string | null>(null);

  const filtered = subscriptions.filter((s: any) =>
    (s.customerId?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.subscriptionType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.status || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMatch = async (subId: string) => {
    setMatchingId(subId);
    try {
      const res = await apiFetch<any>(`/admin/subscriptions/${subId}/match`, { method: 'POST' });
      if (res.success) {
        alert(`Driver assigned: ${res.data?.driver?.name || 'Unknown'}`);
        refetch();
      } else {
        alert(`Matching failed: ${res.message || 'No eligible drivers'}`);
      }
    } catch (err: any) {
      alert(err.message || 'Matching failed');
    } finally {
      setMatchingId(null);
    }
  };

  const handleGenerateTrips = async () => {
    try {
      const res = await apiFetch<any>('/admin/trips/generate', { method: 'POST', body: JSON.stringify({}) });
      alert(`Generated ${res.data?.createdTrips || 0} trips for ${res.data?.passengers || 0} passengers`);
    } catch (err: any) {
      alert(err.message || 'Generation failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Subscriptions</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>All customer commute subscriptions with driver assignments</p>
          </div>
          <button onClick={handleGenerateTrips} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
            Generate Tomorrow's Trips
          </button>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search by customer, type, or status..."
              className="form-input" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '34px', fontSize: '12.5px', height: '38px' }} />
          </div>
        </div>

        {isLoading ? (
          <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>Loading subscriptions...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>No subscriptions found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map((sub: any) => {
              const statusStyle = STATUS_COLORS[sub.status] || STATUS_COLORS.PENDING;
              const hasDriver = !!sub.assignedDriverId;
              return (
                <div key={sub._id} className="glass-card" style={{ padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={14} color="var(--text-main)" />
                        <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{sub.customerId?.name || 'Customer'}</strong>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '3px' }}>
                        {sub.subscriptionType || 'WEEKDAYS'} · {sub.scheduleDays?.map((d: number) => DAYS[d]).join(', ') || 'Mon-Fri'}
                      </p>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: statusStyle.bg, color: statusStyle.color }}>
                      {sub.status}
                    </span>
                  </div>

                  {/* Locations */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px', fontSize: '11px' }}>
                    <div>
                      <span style={{ color: '#16A34A', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>Pickup</span>
                      <p style={{ color: 'var(--text-main)', marginTop: '2px' }}>
                        {sub.pickupLocation?.address || (sub.pickupLocation?.coordinates ? `${sub.pickupLocation.coordinates[1]?.toFixed(4)}, ${sub.pickupLocation.coordinates[0]?.toFixed(4)}` : 'Not set')}
                      </p>
                    </div>
                    <div>
                      <span style={{ color: '#2563EB', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>Drop</span>
                      <p style={{ color: 'var(--text-main)', marginTop: '2px' }}>
                        {sub.dropLocation?.address || (sub.dropLocation?.coordinates ? `${sub.dropLocation.coordinates[1]?.toFixed(4)}, ${sub.dropLocation.coordinates[0]?.toFixed(4)}` : 'Not set')}
                      </p>
                    </div>
                  </div>

                  {/* Driver assignment */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderRadius: '10px', background: hasDriver ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${hasDriver ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}` }}>
                    {hasDriver ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserCheck size={14} color="#10B981" />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                          {sub.assignedDriverId?.name} · {sub.assignedDriverId?.vehicleNumber}
                        </span>
                        {sub.assignedAreaId?.name && (
                          <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>({sub.assignedAreaId.name})</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={14} color="#F59E0B" />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400E' }}>No driver assigned</span>
                      </div>
                    )}
                    {!hasDriver && sub.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleMatch(sub._id)}
                        disabled={matchingId === sub._id}
                        style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, border: 'none', borderRadius: '8px', background: '#10B981', color: '#fff', cursor: 'pointer' }}
                      >
                        {matchingId === sub._id ? <Loader size={12} /> : 'Auto-Match'}
                      </button>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '10px', color: 'var(--text-light)' }}>
                    <span><Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />{sub.pickupTime || '08:00'}</span>
                    <span><Calendar size={10} style={{ display: 'inline', marginRight: '3px' }} />{sub.startDate ? new Date(sub.startDate).toLocaleDateString('en-IN') : '-'} → {sub.endDate ? new Date(sub.endDate).toLocaleDateString('en-IN') : '-'}</span>
                    {sub.payment?.amount && <span>₹{sub.payment.amount}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
