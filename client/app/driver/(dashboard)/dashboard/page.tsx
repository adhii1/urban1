'use client';

import Link from 'next/link';
import { BadgeCheck, CalendarDays, Clock3, IndianRupee, MapPin, Navigation, Play, Route, Users } from 'lucide-react';
import { useDriverEarnings, useDriverTrips, useStartTrip } from '@/lib/hooks/useDriverQueries';

function displayRoute(trip: { route?: { name?: string }; routeId?: { name?: string } }) {
  return trip.route?.name || trip.routeId?.name || 'Assigned route';
}

function displayTime(value?: string) {
  return value || 'Time pending';
}

export default function DriverDashboardPage() {
  const { data: tripsData, isLoading: tripsLoading, isError } = useDriverTrips(1, 50, 'all');
  const { data: earnings, isLoading: earningsLoading } = useDriverEarnings('today');
  const startTrip = useStartTrip();
  const trips = tripsData?.data || [];
  const activeTrip = trips.find((trip) => trip.status === 'IN_PROGRESS' || trip.status === 'SCHEDULED');
  const completed = trips.filter((trip) => trip.status === 'COMPLETED').length;
  const assigned = trips.filter((trip) => trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED');
  const manifest = activeTrip?.manifest || [];

  return <div>
    <section className="driver-stats-grid" aria-label="Operational metrics">
      <div className="driver-glass-card driver-stat-card"><div className="driver-stat-header"><span>Today&apos;s Revenue</span><i className="driver-stat-icon"><IndianRupee size={19} /></i></div><strong className="driver-stat-value">{earningsLoading ? '—' : `₹${(earnings?.totalEarnings || 0).toLocaleString('en-IN')}`}</strong><p className="driver-stat-meta"><span style={{ color: '#16C15D', fontWeight: 600 }}>Live</span> from completed trips</p></div>
      <div className="driver-glass-card driver-stat-card"><div className="driver-stat-header"><span>Allocated Trips</span><i className="driver-stat-icon"><Route size={19} /></i></div><strong className="driver-stat-value">{tripsLoading ? '—' : assigned.length}</strong><p className="driver-stat-meta">Shuttle target progress</p></div>
      <div className="driver-glass-card driver-stat-card"><div className="driver-stat-header"><span>Completed Rides</span><i className="driver-stat-icon"><BadgeCheck size={19} /></i></div><strong className="driver-stat-value">{tripsLoading ? '—' : completed}</strong><p className="driver-stat-meta"><span style={{ color: '#16C15D', fontWeight: 600 }}>{trips.length ? Math.round((completed / trips.length) * 100) : 0}%</span> completion rate</p></div>
      <div className="driver-glass-card driver-stat-card"><div className="driver-stat-header"><span>Duty Hours</span><i className="driver-stat-icon"><Clock3 size={19} /></i></div><strong className="driver-stat-value">{earningsLoading ? '—' : `${((earnings?.totalDuration || 0) / 60).toFixed(1)}h`}</strong><p className="driver-stat-meta">Active-session duration</p></div>
    </section>

    <section className="driver-dashboard-grid">
      <div>
        <div className="driver-glass-card driver-map-card"><div className="driver-map-overlay"><div className="driver-eta"><span><Navigation size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Time to destination</span><strong>{activeTrip?.status === 'IN_PROGRESS' ? 'Live trip' : 'Ready for dispatch'}</strong></div><div className="driver-map-progress"><div><span style={{ display: 'block', fontSize: 10, color: '#CBD5E1', fontWeight: 600 }}>LIVE ROUTE CANVAS</span><strong style={{ fontSize: 14 }}>{activeTrip ? displayRoute(activeTrip) : 'Keep your duty status online for assignments'}</strong></div><Link href={activeTrip ? '/driver/current-trip' : '/driver/ride-queue'} className="driver-primary-button">{activeTrip ? 'Open trip' : 'Ride queue'}</Link></div></div></div>
        <div className="driver-glass-card driver-workflow"><h2>{activeTrip ? 'Active trip workflow' : 'Driver operations workflow'}</h2>{activeTrip ? <><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><BadgeCheck color="#16C15D" size={20} /><div style={{ flex: 1 }}><strong>{displayRoute(activeTrip)}</strong><p style={{ marginTop: 3, color: 'var(--driver-muted)', fontSize: 12 }}>{activeTrip.status.replace('_', ' ')}</p></div>{activeTrip.status === 'SCHEDULED' && <button className="driver-primary-button" disabled={startTrip.isPending} onClick={() => startTrip.mutate(activeTrip._id)}><Play size={15} /> {startTrip.isPending ? 'Starting…' : 'Start trip'}</button>}</div><div className="driver-route-list"><div><span>PICKUP</span><strong>{activeTrip.routeId?.startLocation || 'Assigned pickup stop'}</strong></div><div><span>DROP-OFF</span><strong>{activeTrip.routeId?.endLocation || 'Assigned destination'}</strong></div></div></> : <div style={{ padding: '22px 0', textAlign: 'center' }}><Navigation size={32} color="#16C15D" /><p style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>Waiting for allocations</p><p style={{ marginTop: 4, color: 'var(--driver-muted)', fontSize: 13 }}>Turn your duty status online, then dispatch requests will show here.</p></div>}</div>
        <div className="driver-glass-card driver-passengers"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h2>Assigned passengers</h2>{activeTrip && <Link href={`/driver/trips/${activeTrip._id}/passengers`} style={{ color: '#16C15D', fontSize: 12, fontWeight: 700 }}>Open manifest →</Link>}</div>{manifest.length ? <div style={{ display: 'grid', gap: 10 }}>{manifest.map((entry, index) => <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid var(--driver-border)', borderRadius: 12, background: 'var(--driver-bg)' }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="driver-avatar" style={{ width: 34, height: 34, flexBasis: 34 }}>{entry.customer?.name?.slice(0, 1) || 'P'}</span><div><strong style={{ fontSize: 13 }}>{entry.customer?.name || 'Passenger'}</strong><p style={{ marginTop: 2, color: 'var(--driver-muted)', fontSize: 11 }}>{entry.pickupStop?.stopName || 'Assigned stop'}</p></div></div><span style={{ color: '#16C15D', fontSize: 11, fontWeight: 700 }}>{entry.status || 'PENDING'}</span></div>)}</div> : <p style={{ color: 'var(--driver-muted)', fontSize: 13 }}>Passenger assignments will appear when a trip is active.</p>}</div>
      </div>
      <aside className="driver-glass-card driver-timeline"><h2><CalendarDays size={16} color="#16C15D" style={{ verticalAlign: -3, marginRight: 8 }} /> My Scheduled Shifts</h2>{isError ? <p style={{ color: '#EF4444', fontSize: 13 }}>Could not load your assigned trips.</p> : assigned.length ? assigned.slice(0, 6).map((trip) => <div className="driver-timeline-item" key={trip._id}><time>{displayTime(trip.scheduledTime)}</time><span className="driver-timeline-node" /><div className="driver-timeline-content"><h3>{displayRoute(trip)}</h3><p>{trip.routeId?.startLocation || 'Pickup'} → {trip.routeId?.endLocation || 'Drop-off'}</p><span style={{ display: 'inline-block', marginTop: 6, padding: '2px 6px', borderRadius: 6, background: 'rgba(59,130,246,.12)', color: '#2563EB', fontSize: 9, fontWeight: 700 }}>{trip.status}</span></div></div>) : <p style={{ padding: '14px 0', color: 'var(--driver-muted)', fontSize: 13 }}>No assigned or pending shifts.</p>}</aside>
    </section>
  </div>;
}
