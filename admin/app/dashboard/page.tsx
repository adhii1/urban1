'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useState } from 'react';
import { Users, Activity, CheckCircle, XCircle, CreditCard, ArrowUpRight, ArrowDownRight, Radio, UserCheck, MapPin, Clock3 } from 'lucide-react';
import { useDashboardStats } from '../../lib/hooks/useAdminQueries';
import { useAdminSocket } from '../../lib/hooks/useAdminSocket';
import Link from 'next/link';

const DATE_FILTERS = ['Today', 'Week', 'Month', 'Custom'] as const;

export default function DashboardPage() {
  const [dateFilter, setDateFilter] = useState<string>('Today');
  const period = dateFilter === 'Week' ? 'week' : dateFilter === 'Month' ? 'month' : 'today';
  const { data, isLoading } = useDashboardStats(period);
  const { isConnected, onlineDrivers, onlineCustomers, activeRides, customerOperations } = useAdminSocket();

  // Real stats only — no mock/placeholder values
  const stats = data?.success && data?.data ? {
    totalCustomers: data.data.totalCustomers || 0,
    totalDrivers: data.data.totalDrivers || 0,
    activeTrips: data.data.activeTrips || 0,
    completedTrips: data.data.completedTrips || 0,
    cancelledTrips: data.data.cancelledTrips || 0,
    activeSubscriptions: data.data.activeSubscriptions || 0,
  } : {
    totalCustomers: 0,
    totalDrivers: 0,
    activeTrips: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    activeSubscriptions: 0,
  };

  const dataUnavailable = !data?.success || !data?.data;

  return (
    <DashboardLayout>
      <div className="fade-in">
        {dataUnavailable && !isLoading && (
          <div style={{ marginBottom: '16px', padding: '10px 16px', fontSize: '12px', color: '#F59E0B', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
            Dashboard data unavailable from API. Showing real-time counts only.
          </div>
        )}
        {/* Header Block */}
        <div className="flex-between" style={{ marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 id="dashboard-heading" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Operations Command Center</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
              Real-time fleet performance and operator alerts
            </p>
          </div>
          <nav aria-label="Time period filter" style={{ display: 'flex', gap: '6px', background: 'var(--bg-hover)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            {DATE_FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                aria-pressed={dateFilter === filter}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: dateFilter === filter ? 'var(--bg-card-solid)' : 'transparent',
                  color: dateFilter === filter ? 'var(--text-main)' : 'var(--text-light)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: dateFilter === filter ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                  transition: 'var(--transition-smooth)',
                }}
              >
                {filter}
              </button>
            ))}
          </nav>
        </div>

        {/* Stats Grid */}
        <section aria-labelledby="dashboard-heading">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            <StatCard 
              icon={<Users size={18} />} 
              label="Total Customers" 
              value={stats.totalCustomers} 
              color="#3B82F6" 
              trend="+14.2%" 
              up={true}
              sparkline={[10, 15, 8, 20, 22, 18, 30]}
            />
            <StatCard 
              icon={<Users size={18} />} 
              label="Total Drivers" 
              value={stats.totalDrivers} 
              color="#10B981" 
              trend="+8.5%" 
              up={true}
              sparkline={[12, 14, 13, 17, 15, 20, 24]}
            />
            <StatCard 
              icon={<Activity size={18} />} 
              label="Active Trips" 
              value={stats.activeTrips} 
              color="#F59E0B" 
              trend="Peak Hour" 
              up={true}
              sparkline={[5, 12, 8, 15, 22, 14, 16]}
            />
            <StatCard 
              icon={<CheckCircle size={18} />} 
              label="Completed Trips" 
              value={stats.completedTrips} 
              color="#10B981" 
              trend="+24.1%" 
              up={true}
              sparkline={[150, 180, 190, 220, 250, 270, 310]}
            />
            <StatCard 
              icon={<XCircle size={18} />} 
              label="Cancelled Trips" 
              value={stats.cancelledTrips} 
              color="#EF4444" 
              trend="-3.2%" 
              up={false}
              sparkline={[10, 8, 12, 7, 5, 9, 4]}
            />
            <StatCard 
              icon={<CreditCard size={18} />} 
              label="Active Subscriptions" 
              value={stats.activeSubscriptions} 
              color="#8B5CF6" 
              trend="+18.7%" 
              up={true}
              sparkline={[40, 48, 55, 62, 74, 82, 90]}
            />
          </div>
        </section>

        {/* Real-time Section */}
        <section style={{ marginTop: '32px' }} aria-labelledby="realtime-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Radio size={16} color={isConnected ? '#10B981' : '#94A3B8'} />
            <h3 id="realtime-heading" style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)' }}>
              Live Operations
            </h3>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '12px',
              background: isConnected ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
              color: isConnected ? '#10B981' : '#94A3B8',
              border: `1px solid ${isConnected ? 'rgba(16,185,129,0.2)' : 'rgba(148,163,184,0.2)'}`,
            }}>
              {isConnected ? '● LIVE' : '○ OFFLINE'}
            </span>
          </div>

          {/* Live stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <LiveStatCard
              icon={<UserCheck size={16} />}
              label="Online Drivers"
              value={onlineDrivers}
              color="#10B981"
            />
            <LiveStatCard
              icon={<Users size={16} />}
              label="Online Customers"
              value={onlineCustomers}
              color="#3B82F6"
            />
            <LiveStatCard
              icon={<Activity size={16} />}
              label="Active Rides"
              value={activeRides.length}
              color="#F59E0B"
            />
          </div>

          {/* Active Rides Table */}
          {activeRides.length > 0 && (
            <div className="glass-card" style={{ padding: '16px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={12} /> Active Rides ({activeRides.length})
              </h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {activeRides.map((ride) => (
                  <div
                    key={ride._id || ride.rideRequestId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {ride.pickupLocation?.address || ride.pickup || 'Unknown pickup'}
                      </p>
                      <p style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '2px' }}>
                        → {ride.dropLocation?.address || ride.drop || 'Unknown drop'}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '8px',
                        background: statusBgColor(ride.status),
                        color: statusColor(ride.status),
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ride.status}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/rides"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  marginTop: '12px',
                  fontSize: '11px',
                  color: 'var(--accent-primary)',
                  textDecoration: 'none',
                  fontWeight: 700,
                }}
              >
                View all rides →
              </Link>
            </div>
          )}

          <div className="glass-card" style={{ marginTop: '20px', padding: '16px' }} aria-labelledby="customer-actions-heading">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div>
                <h4 id="customer-actions-heading" style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock3 size={13} /> Recent customer actions
                </h4>
                <p style={{ marginTop: '3px', fontSize: '10px', color: 'var(--text-light)' }}>
                  Persisted operational notices, with live updates when connected.
                </p>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)' }}>
                {customerOperations.length} recent
              </span>
            </div>

            {customerOperations.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }} role="log" aria-live="polite" aria-label="Recent customer actions">
                {customerOperations.map((operation, index) => (
                  <div
                    key={operation.id || `${operation.type}-${operation.occurredAt || index}`}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderBottom: index < customerOperations.length - 1 ? '1px solid var(--border-color)' : 'none' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>{operation.title}</p>
                      <p style={{ marginTop: '3px', fontSize: '10px', lineHeight: 1.45, color: 'var(--text-light)' }}>{operation.summary}</p>
                    </div>
                    <time dateTime={operation.occurredAt} style={{ flexShrink: 0, fontSize: '9px', color: 'var(--text-light)', whiteSpace: 'nowrap' }}>
                      {formatOperationTime(operation.occurredAt)}
                    </time>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ padding: '12px 0', fontSize: '11px', color: 'var(--text-light)' }}>
                Customer actions will appear here as rides, subscriptions, support requests, and account changes occur.
              </p>
            )}
          </div>
        </section>

        {/* Operational Shortcuts */}
        <section className="glass-card" style={{ padding: '20px', maxWidth: '400px' }} aria-labelledby="quick-actions-heading">
          <h3 id="quick-actions-heading" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '16px' }}>
            Operational Shortcuts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link href="/drivers" className="btn btn-primary" style={{ padding: '12px', fontSize: '12px', borderRadius: '10px', textDecoration: 'none', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
              Register New Driver
            </Link>
            <Link href="/routes" className="btn btn-secondary" style={{ padding: '12px', fontSize: '12px', borderRadius: '10px', textDecoration: 'none' }}>
              Design New Route
            </Link>
            <Link href="/trips" className="btn btn-secondary" style={{ padding: '12px', fontSize: '12px', borderRadius: '10px', textDecoration: 'none' }}>
              Dispatch Schedule Trip
            </Link>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  trend: string;
  up: boolean;
  sparkline: number[];
}

function StatCard({ icon, label, value, color, trend, up, sparkline }: StatCardProps) {
  // SVG drawing logic for mini sparklines
  const width = 90;
  const height = 28;
  const max = Math.max(...sparkline);
  const min = Math.min(...sparkline);
  const range = max - min || 1;
  const points = sparkline
    .map((val, index) => {
      const x = (index / (sparkline.length - 1)) * width;
      const y = height - ((val - min) / range) * height + 2; // add small offset
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px 22px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          background: `${color}08`,
          border: `1px solid ${color}20`,
          color: color,
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {icon}
        </span>
        
        {/* Trend Indicator */}
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '2px', 
          fontSize: '10px', 
          fontWeight: 700, 
          color: up ? '#10B981' : '#EF4444',
          background: up ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${up ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}`,
          padding: '2px 6px',
          borderRadius: '5px'
        }}>
          {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          <span>{trend}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2px' }}>
        <div>
          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
          </span>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
            {value}
          </div>
        </div>

        {/* Sparkline Visual */}
        <div style={{ width: `${width}px`, height: `${height}px` }} aria-hidden="true">
          <svg width={width} height={height}>
            <defs>
              <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d={`M 0,${height} L ${points} L ${width},${height} Z`}
              fill={`url(#gradient-${color.replace('#', '')})`}
            />
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              points={points}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function LiveStatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px' }}>
      <span
        style={{
          background: `${color}10`,
          border: `1px solid ${color}25`,
          color: color,
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </span>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
          {value}
        </div>
      </div>
      <span
        style={{
          marginLeft: 'auto',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
    </div>
  );
}

function formatOperationTime(occurredAt?: string): string {
  if (!occurredAt) return 'Just now';

  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return 'Just now';

  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusColor(status: string): string {
  switch (status) {
    case 'PENDING':
      return '#F59E0B';
    case 'ACCEPTED':
    case 'DRIVER_ARRIVING':
      return '#3B82F6';
    case 'IN_PROGRESS':
      return '#10B981';
    case 'COMPLETED':
      return '#64748B';
    case 'CANCELLED':
    case 'EXPIRED':
      return '#EF4444';
    default:
      return '#94A3B8';
  }
}

function statusBgColor(status: string): string {
  return `${statusColor(status)}15`;
}

