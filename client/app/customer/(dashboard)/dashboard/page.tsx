'use client';

import Link from 'next/link';
import { Bell, BriefcaseBusiness, Clock3, History, MapPin, WalletCards } from 'lucide-react';
import { type TripEntry, useCustomerDashboard } from '@/lib/hooks/useCustomerQueries';

const activeStatuses = new Set(['IN_PROGRESS']);
const upcomingStatuses = new Set(['SCHEDULED']);

function tripRoute(trip: TripEntry) {
  return trip.routeId?.name || trip.routeName || trip.route || 'Your shared ride';
}

function tripDate(trip: TripEntry) {
  const value = trip.scheduledAt || trip.tripDate;
  return value ? new Date(value).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Schedule pending';
}

export default function CustomerDashboardPage() {
  const { profile, trips, subscription, isLoading, isError } = useCustomerDashboard();
  const allTrips = trips.data || [];
  const activeTrip = allTrips.find((trip) => activeStatuses.has(trip.status));
  const upcomingTrip = allTrips.find((trip) => upcomingStatuses.has(trip.status));
  const completedTrips = allTrips.filter((trip) => trip.status === 'COMPLETED').slice(0, 3);
  const pickup = activeTrip?.myEntry?.pickupStop?.stopName || profile.data?.pickupLocation?.address || profile.data?.homeLocation?.address || 'Pickup location pending';
  const drop = activeTrip?.myEntry?.dropStop?.stopName || profile.data?.dropLocation?.address || 'Drop location pending';
  const planName = subscription.data?.planId?.name || subscription.data?.planType || subscription.data?.plan || 'No active pass';

  if (isLoading) return <div className="dashboard-section" style={{ padding: '64px 0', textAlign: 'center', color: '#334155' }}>Loading your commute dashboard…</div>;

  return <div>
    {isError && <div className="dashboard-section" style={{ border: '1px solid #FECACA', borderRadius: '12px', background: '#FEF2F2', padding: '12px', color: '#B91C1C', fontSize: '12px' }}>Some commute details could not be refreshed. Check that the API session is active, then try again.</div>}
    <section className="dashboard-section">
      <div className="card active-trip-card" style={{ border: '2px solid #16C15D' }}>
        <div className="card-header-flex"><span className="badge badge-green">{activeTrip ? 'Active Shared Ride' : 'Your next shared commute'}</span><span className="eta">{activeTrip ? 'Live now' : 'No active ride'}</span></div>
        <div className="route-info"><div className="route-point"><span className="dot green-dot" /><span>{pickup}</span></div><div className="route-line" /><div className="route-point"><span className="dot blue-dot" /><span>{drop}</span></div></div>
        {activeTrip ? <div className="vehicle-info"><div className="vehicle-icon"><BriefcaseBusiness size={19} /></div><div style={{ flex: 1 }}><p className="vehicle-no">{activeTrip.driverId?.vehicleNumber || 'Vehicle assigned'}</p><p className="driver-name">{activeTrip.driverId?.name || 'Driver details arriving shortly'}</p></div><Link className="btn-primary btn-sm" href={`/customer/rides/${activeTrip._id}`}>Active Card</Link></div> : <div className="vehicle-info"><div className="vehicle-icon"><Clock3 size={19} /></div><div style={{ flex: 1 }}><p className="vehicle-no">Ready when you are</p><p className="driver-name">Book a ride or choose a commute pass to see your live journey here.</p></div><Link className="btn-primary btn-sm" href="/customer/book-ride">Book Ride</Link></div>}
      </div>
    </section>

    {upcomingTrip && <section className="dashboard-section"><div className="glass-card" style={{ padding: '18px', borderLeft: '4px solid #3B82F6' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}><span style={{ color: '#3B82F6', fontSize: '11px', fontWeight: 700 }}>UPCOMING SCHEDULED RIDE</span><span style={{ color: '#64748B', fontSize: '12px', fontWeight: 600 }}>{tripDate(upcomingTrip)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}><div><strong style={{ fontSize: '14px' }}>{tripRoute(upcomingTrip)}</strong><p style={{ marginTop: '3px', color: '#64748B', fontSize: '12px' }}>{upcomingTrip.myEntry?.pickupStop?.stopName || 'Assigned pickup'} → {upcomingTrip.myEntry?.dropStop?.stopName || 'Assigned drop'}</p></div><Link href={`/customer/rides/${upcomingTrip._id}`} style={{ padding: '6px 14px', borderRadius: '8px', background: 'rgba(59,130,246,.1)', color: '#2563EB', fontSize: '12px', fontWeight: 600 }}>Details</Link></div></div></section>}

    <section className="dashboard-section quick-actions"><h2 className="section-heading">Quick Actions</h2><div className="actions-grid customer-action-grid"><Link href="/customer/book-ride" className="action-item"><span className="action-icon bg-green-light text-green">➕</span><span>Book Ride</span></Link><Link href="/customer/my-trips" className="action-item"><span className="action-icon bg-blue-light text-blue">⏳</span><span>Ride Status</span></Link><Link href="/customer/my-trips" className="action-item"><span className="action-icon bg-green-light text-green"><History size={21} /></span><span>My Trips</span></Link><Link href="/customer/wallet" className="action-item"><span className="action-icon bg-blue-light text-blue"><WalletCards size={21} /></span><span>Wallet</span></Link></div></section>

    <section className="dashboard-section"><div className="glass-card" style={{ padding: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}><div><span style={{ color: '#16C15D', fontSize: '11px', fontWeight: 700 }}>ACTIVE PASS & COMMUTE SUMMARY</span><div style={{ fontSize: '20px', fontWeight: 800 }}>{planName}</div><span style={{ color: '#64748B', fontSize: '12px' }}>{subscription.data ? `${subscription.data.status} · ${subscription.data.remainingPauseDays ?? 0} pause days available` : 'Choose a pass to unlock scheduled commutes'}</span></div><Link href="/customer/plans" className="btn-redesign-primary" style={{ padding: '8px 14px', fontSize: '12px' }}>Manage Passes →</Link></div></section>

    <section className="dashboard-section"><h2 className="section-heading">Saved Locations</h2><div className="customer-saved-locations"><Link href="/customer/book-ride" className="glass-card" style={{ padding: '14px' }}><span style={{ fontSize: '18px' }}>🏠</span><strong style={{ display: 'block', fontSize: '14px' }}>Home</strong><span style={{ display: 'block', color: '#64748B', fontSize: '11px' }}>{profile.data?.homeLocation?.address || profile.data?.pickupLocation?.address || 'Set location'}</span></Link><Link href="/customer/book-ride" className="glass-card" style={{ padding: '14px' }}><span style={{ fontSize: '18px' }}>🏢</span><strong style={{ display: 'block', fontSize: '14px' }}>Office</strong><span style={{ display: 'block', color: '#64748B', fontSize: '11px' }}>{profile.data?.dropLocation?.address || 'Set location'}</span></Link><Link href="/customer/profile" className="glass-card" style={{ padding: '14px' }}><MapPin size={18} /><strong style={{ display: 'block', fontSize: '14px' }}>Manage</strong><span style={{ display: 'block', color: '#64748B', fontSize: '11px' }}>Saved places</span></Link></div></section>

    <section className="dashboard-section" style={{ marginBottom: '24px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><h2 className="section-heading" style={{ margin: 0 }}>Ride History Preview</h2><Link href="/customer/my-trips" style={{ color: '#16C15D', fontSize: '13px', fontWeight: 600 }}>View All Trips →</Link></div><div className="glass-card" style={{ padding: '16px' }}>{completedTrips.length ? completedTrips.map((trip, index) => <div key={trip._id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingBottom: index < completedTrips.length - 1 ? '12px' : 0, marginBottom: index < completedTrips.length - 1 ? '12px' : 0, borderBottom: index < completedTrips.length - 1 ? '1px solid rgba(0,0,0,.05)' : 'none' }}><div><strong style={{ fontSize: '14px' }}>{tripRoute(trip)}</strong><p style={{ color: '#64748B', fontSize: '12px' }}>{tripDate(trip)}</p></div><Link href={`/customer/rides/${trip._id}`}><span style={{ display: 'inline-block', borderRadius: '10px', background: 'rgba(22,193,93,.1)', color: '#16C15D', padding: '3px 10px', fontSize: '10px', fontWeight: 700 }}>COMPLETED</span></Link></div>) : <p style={{ padding: '10px 0', color: '#64748B', fontSize: '13px', textAlign: 'center' }}>Your completed rides will appear here.</p>}</div></section>
  </div>;
}
