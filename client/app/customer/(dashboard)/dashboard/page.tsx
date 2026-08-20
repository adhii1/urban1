'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bus, Clock3, History, MapPin, WalletCards, UserCheck, Calendar, Key, Navigation } from 'lucide-react';
import { api } from '@/lib/api/client';

export default function CustomerDashboardPage() {
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/booking')
      .then((res) => setBooking(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="dashboard-section" style={{ padding: '64px 0', textAlign: 'center', color: '#334155' }}>Loading your commute dashboard…</div>;

  const hasBooking = booking && booking._id;
  const driver = booking?.assignedDriverId;
  const area = booking?.assignedAreaId;
  const pickup = booking?.pickupLocation?.address || (booking?.pickupLocation?.coordinates ? `${booking.pickupLocation.coordinates[1]?.toFixed(4)}, ${booking.pickupLocation.coordinates[0]?.toFixed(4)}` : 'Not set');
  const drop = booking?.dropLocation?.address || (booking?.dropLocation?.coordinates ? `${booking.dropLocation.coordinates[1]?.toFixed(4)}, ${booking.dropLocation.coordinates[0]?.toFixed(4)}` : 'Not set');
  const days = booking?.scheduleDays?.map((d: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');

  return (
    <div>
      {/* Active Subscription Card */}
      <section className="dashboard-section">
        {hasBooking ? (
          <div className="glass-card" style={{ padding: '20px', border: '2px solid #16C15D', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: '#DCFCE7', color: '#16A34A' }}>
                {booking.status} · {booking.subscriptionType}
              </span>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                <Clock3 size={12} style={{ display: 'inline', marginRight: '3px' }} />
                Pickup: {booking.pickupTime || '08:00'}
              </span>
            </div>

            {/* Route */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#16C15D', border: '2px solid #DCFCE7' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{pickup}</span>
              </div>
              <div style={{ marginLeft: '4px', width: '2px', height: '16px', background: '#E2E8F0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3B82F6', border: '2px solid #DBEAFE' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{drop}</span>
              </div>
            </div>

            {/* Schedule */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Calendar size={14} color="#3B82F6" />
              <span style={{ fontSize: '12px', color: '#475569' }}>{days || 'Mon-Fri'}</span>
            </div>

            {/* Assigned Driver */}
            {driver ? (
              <div style={{ padding: '14px', borderRadius: '12px', background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <UserCheck size={16} color="#16A34A" />
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>{driver.name}</strong>
                </div>
                <p style={{ fontSize: '12px', color: '#475569' }}>
                  {driver.vehicleNumber} · {driver.vehicleModel} · Capacity: {driver.vehicleCapacity}
                </p>
                {area && <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>Area: {area.name}</p>}
              </div>
            ) : (
              <div style={{ padding: '14px', borderRadius: '12px', background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <p style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>Driver assignment pending</p>
                <p style={{ fontSize: '11px', color: '#78716C', marginTop: '4px' }}>Admin will assign a driver to your area shortly.</p>
              </div>
            )}

            {/* Dates */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px', color: '#64748B' }}>
              <span>Start: {booking.startDate ? new Date(booking.startDate).toLocaleDateString('en-IN') : '-'}</span>
              <span>End: {booking.endDate ? new Date(booking.endDate).toLocaleDateString('en-IN') : '-'}</span>
              {booking.payment?.amount && <span>Paid: ₹{booking.payment.amount}</span>}
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
            <Bus size={32} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>No Active Commute</h3>
            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>Subscribe to a commute plan and we will auto-assign the best driver in your area.</p>
            <Link href="/customer/subscribe" className="btn-redesign-primary" style={{ textDecoration: 'none' }}>
              Subscribe Now
            </Link>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="dashboard-section">
        <h2 className="section-heading">Quick Actions</h2>
        <div className="actions-grid customer-action-grid">
          <Link href="/customer/subscribe" className="action-item">
            <span className="action-icon bg-green-light text-green"><Bus size={20} /></span>
            <span>Subscribe</span>
          </Link>
          <Link href="/customer/book-ride" className="action-item">
            <span className="action-icon bg-blue-light text-blue"><Navigation size={20} /></span>
            <span>Flexy Ride</span>
          </Link>
          <Link href="/customer/my-trips" className="action-item">
            <span className="action-icon bg-green-light text-green"><History size={20} /></span>
            <span>My Trips</span>
          </Link>
          <Link href="/customer/wallet" className="action-item">
            <span className="action-icon bg-blue-light text-blue"><WalletCards size={20} /></span>
            <span>Wallet</span>
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="dashboard-section">
        <div className="glass-card" style={{ padding: '18px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>How your commute works</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: '#475569' }}>
            <div style={{ display: 'flex', gap: '10px' }}><span style={{ fontWeight: 700, color: '#16C15D' }}>1.</span> Subscribe (Weekday / Hybrid / Shuttle)</div>
            <div style={{ display: 'flex', gap: '10px' }}><span style={{ fontWeight: 700, color: '#16C15D' }}>2.</span> System auto-assigns a driver in your area</div>
            <div style={{ display: 'flex', gap: '10px' }}><span style={{ fontWeight: 700, color: '#16C15D' }}>3.</span> Driver accepts trip → you get notified with OTP</div>
            <div style={{ display: 'flex', gap: '10px' }}><span style={{ fontWeight: 700, color: '#16C15D' }}>4.</span> Driver picks you up, verifies OTP, ride starts</div>
            <div style={{ display: 'flex', gap: '10px' }}><span style={{ fontWeight: 700, color: '#16C15D' }}>5.</span> Dropped at destination. Ride complete!</div>
          </div>
        </div>
      </section>
    </div>
  );
}
