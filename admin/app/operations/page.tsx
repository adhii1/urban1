'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronDown, MapPin, RefreshCw, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useOperationalExceptions, useResolveOperationalException, useTrips } from '../../lib/hooks/useAdminQueries';

const fmtDate = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (value?: string) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const id = (value: any) => value?._id || value?.id || value || '';
const routeName = (trip: any) => trip.routeId?.name || trip.routeName || 'Unknown route';

function Manifest({ trip }: { trip: any }) {
  const [open, setOpen] = useState(false);
  const passengers = trip.manifest || [];
  return <div style={{ marginTop: '12px' }}>
    <button onClick={() => setOpen(!open)} className="btn btn-secondary" style={{ fontSize: '11px', padding: '6px 10px' }}><Users size={12} /> {open ? 'Hide' : 'View'} manifest ({passengers.length})</button>
    {open && <div style={{ marginTop: '10px', overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}><thead><tr>{['Passenger', 'Pickup', 'Drop', 'Lifecycle', 'Boarded', 'Dropped', 'Conflict'].map((heading) => <th key={heading} style={{ textAlign: 'left', padding: '7px', color: 'var(--text-light)' }}>{heading}</th>)}</tr></thead><tbody>{passengers.length === 0 ? <tr><td colSpan={7} style={{ padding: '10px' }}>No passengers in this manifest.</td></tr> : passengers.map((passenger: any) => <tr key={id(passenger) || id(passenger.customer)} style={{ borderTop: '1px solid var(--border-color)' }}><td style={{ padding: '8px' }}>{passenger.customer?.name || 'Unknown passenger'}</td><td style={{ padding: '8px' }}>{passenger.pickupStop?.stopName || '—'}</td><td style={{ padding: '8px' }}>{passenger.dropStop?.stopName || '—'}</td><td style={{ padding: '8px' }}>{passenger.status || 'PENDING'}</td><td style={{ padding: '8px' }}>{fmtTime(passenger.boardedAt)}</td><td style={{ padding: '8px' }}>{fmtTime(passenger.droppedAt)}</td><td style={{ padding: '8px', color: passenger.conflict?.state === 'REQUIRES_RESOLUTION' ? '#F59E0B' : 'var(--text-light)' }}>{passenger.conflict?.state === 'REQUIRES_RESOLUTION' ? passenger.conflict.reason : 'None'}</td></tr>)}</tbody></table></div>}
  </div>;
}

function Resolution({ exception }: { exception: any }) {
  const resolve = useResolveOperationalException();
  const options = exception.replacementStopOptions;
  const pickups = options?.pickupStops || [];
  const [pickupStopId, setPickupStopId] = useState('');
  const drops = options?.dropStopsByPickupStopId?.[pickupStopId] || [];
  const [dropStopId, setDropStopId] = useState('');
  useEffect(() => { const firstPickup = pickups[0]?.stopId || ''; setPickupStopId(firstPickup); setDropStopId(options?.dropStopsByPickupStopId?.[firstPickup]?.[0]?.stopId || ''); }, [exception._id]);
  if (!options || pickups.length === 0) return <p style={{ color: 'var(--text-light)', fontSize: '11px', marginTop: '10px' }}>No valid replacement pair is currently available; reactivate/configure the route first.</p>;
  const submit = async () => { try { await resolve.mutateAsync({ id: exception._id, data: { pickupStopId, dropStopId } }); } catch (error: any) { alert(error.message || 'Unable to resolve exception'); } };
  return <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', alignItems: 'end' }}><label style={{ fontSize: '10px' }}>Replacement pickup<select className="form-input" value={pickupStopId} onChange={(e) => { const next = e.target.value; setPickupStopId(next); setDropStopId(options.dropStopsByPickupStopId[next]?.[0]?.stopId || ''); }} style={{ display: 'block', marginTop: '4px', minWidth: '150px' }}>{pickups.map((stop: any) => <option key={stop.stopId} value={stop.stopId}>{stop.sequenceOrder}. {stop.stopName}</option>)}</select></label><label style={{ fontSize: '10px' }}>Replacement drop<select className="form-input" value={dropStopId} onChange={(e) => setDropStopId(e.target.value)} style={{ display: 'block', marginTop: '4px', minWidth: '150px' }}>{drops.map((stop: any) => <option key={stop.stopId} value={stop.stopId}>{stop.sequenceOrder}. {stop.stopName}</option>)}</select></label><button onClick={submit} disabled={!dropStopId || resolve.isPending} className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '11px' }}>{resolve.isPending ? 'Resolving…' : 'Apply valid replacements'}</button></div>;
}

export default function OperationsPage() {
  useAuthGuard();
  const tripsQuery = useTrips('future=true');
  const exceptionsQuery = useOperationalExceptions();
  const trips = tripsQuery.data?.success ? (tripsQuery.data.data || []) : [];
  const exceptions = exceptionsQuery.data?.success ? (exceptionsQuery.data.data || []) : [];

  return <DashboardLayout><div className="fade-in">
    <div className="flex-between" style={{ marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}><div><h2 style={{ fontSize: '20px', fontWeight: 800 }}>Service Operations</h2><p style={{ color: 'var(--text-light)', fontSize: '12px' }}>Future route service, manifests, and operational exceptions.</p></div><button onClick={() => { tripsQuery.refetch(); exceptionsQuery.refetch(); }} className="btn btn-secondary" style={{ fontSize: '11px' }}><RefreshCw size={12} /> Refresh</button></div>
    <section className="glass-card" style={{ padding: '18px', marginBottom: '20px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><MapPin size={16} color="#10B981" /><h3 style={{ fontSize: '14px', fontWeight: 800 }}>Future scheduled trips</h3></div>
      {tripsQuery.isLoading ? <p>Loading scheduled trips…</p> : trips.length === 0 ? <p style={{ color: 'var(--text-light)' }}>No future scheduled trips.</p> : <div style={{ display: 'grid', gap: '10px' }}>{trips.map((trip: any) => <article key={id(trip)} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}><div><strong>{routeName(trip)}</strong><div style={{ color: 'var(--text-light)', fontSize: '11px', marginTop: '3px' }}>Service date: {fmtDate(trip.serviceDate || trip.tripDate)} · {trip.manifest?.length || 0} passengers</div></div><div style={{ textAlign: 'right', fontSize: '11px' }}><div style={{ color: trip.driverId?.name ? 'var(--text-main)' : '#F59E0B', fontWeight: 700 }}>{trip.driverId?.name || 'Unassigned driver'}</div><span className={`badge ${trip.status === 'SCHEDULED' ? 'badge-info' : 'badge-secondary'}`} style={{ fontSize: '9px' }}>{trip.status}</span></div></div><Manifest trip={trip} /></article>)}</div>}
    </section>
    <section className="glass-card" style={{ padding: '18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><AlertTriangle size={16} color="#F59E0B" /><h3 style={{ fontSize: '14px', fontWeight: 800 }}>Open operational exceptions</h3></div>
      {exceptionsQuery.isLoading ? <p>Loading exceptions…</p> : exceptions.length === 0 ? <p style={{ color: 'var(--text-light)' }}>No open operational exceptions.</p> : <div style={{ display: 'grid', gap: '10px' }}>{exceptions.map((exception: any) => <article key={id(exception)} style={{ border: '1px solid rgba(245,158,11,0.35)', borderRadius: '10px', padding: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}><div><strong>{exception.type.replaceAll('_', ' ')}</strong><p style={{ fontSize: '11px', color: 'var(--text-light)', margin: '4px 0' }}>{exception.routeId?.name || 'Unknown route'} · Service date: {fmtDate(exception.serviceDate)}</p><p style={{ fontSize: '12px', margin: 0 }}>{exception.reason}</p></div><span className="badge badge-danger" style={{ height: 'fit-content', fontSize: '9px' }}>{exception.status}</span></div>{exception.type === 'ROUTE_CHANGE_CONFLICT' ? <Resolution exception={exception} /> : <div style={{ marginTop: '10px', fontSize: '11px' }}><Link href={exception.tripId ? '/trips' : '/routes'} style={{ color: '#10B981', fontWeight: 700 }}>{exception.type === 'UNASSIGNED_DRIVER' ? 'Assign a driver from Trips' : 'Review route or generation configuration'} <ChevronDown size={12} style={{ transform: 'rotate(-90deg)', verticalAlign: 'middle' }} /></Link></div>}</article>)}</div>}
    </section>
  </div></DashboardLayout>;
}
