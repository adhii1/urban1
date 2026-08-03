'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { useState } from 'react';
import { PieChart, TrendingUp, DollarSign, Clock, Users, ArrowUpRight, BarChart3, HelpCircle } from 'lucide-react';
import { useAnalytics } from '@/lib/hooks/useAdminQueries';

type TimeRange = '7d' | '30d' | '12m';

export default function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>('7d');
  const [activeTab, setActiveTab] = useState<'fleet' | 'financial'>('fleet');

  const { data: analyticsData, isLoading } = useAnalytics(range);
  const summary = analyticsData?.data?.summary;
  const tripTrend = analyticsData?.data?.tripTrend || [];
  const revenueTrend = analyticsData?.data?.revenueTrend || [];
  const routePerformance = analyticsData?.data?.routePerformance || [];

  const currentTrips = tripTrend.map((t: any) => t.value);
  const currentRevenue = revenueTrend.map((t: any) => t.value);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // SVG Area Chart calculations
  const chartWidth = 500;
  const chartHeight = 150;
  const maxTrip = currentTrips.length > 0 ? Math.max(...currentTrips) : 0;
  const minTrip = currentTrips.length > 0 ? Math.min(...currentTrips) : 0;
  const tripRange = maxTrip - minTrip || 1;
  
  const tripPoints = currentTrips.map((val: number, idx: number) => {
    const x = (idx / (currentTrips.length - 1)) * chartWidth;
    const y = chartHeight - ((val - minTrip) / tripRange) * (chartHeight - 20) - 10;
    return `${x},${y}`;
  });
  
  const tripPath = tripPoints.join(' ');
  const tripAreaPath = `M 0,${chartHeight} L ${tripPath} L ${chartWidth},${chartHeight} Z`;

  // SVG Bar Chart calculations
  const barChartWidth = 500;
  const barChartHeight = 150;
  const maxRev = currentRevenue.length > 0 ? Math.max(...currentRevenue) : 0;
  const revRange = maxRev || 1;

  return (
    <DashboardLayout>
      <div className="fade-in">
        {/* Top Header Section */}
        <div className="flex-between" style={{ marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 id="analytics-heading" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.5px' }}>
              <PieChart size={22} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
              Analytics & Command Telemetry
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
              Deep dive into active routes, user retention, driver performance, and financial MRR metrics
            </p>
          </div>
          
          {/* Time range switcher */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-hover)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            {(['7d', '30d', '12m'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: range === r ? 'var(--bg-card-solid)' : 'transparent',
                  color: range === r ? 'var(--text-main)' : 'var(--text-light)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: range === r ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                  transition: 'var(--transition-smooth)'
                }}
              >
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '12 Months'}
              </button>
            ))}
          </div>
        </div>

        {/* Highlight Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '28px' }}>
          <HighlightCard 
            icon={<TrendingUp size={16} />} 
            label="Total Platform Volume" 
            value={isLoading ? '...' : (summary?.totalTrips?.toLocaleString() || '0')} 
            change="" 
            sub="Trips completed"
          />
          <HighlightCard 
            icon={<DollarSign size={16} />} 
            label="Gross Platform Revenue" 
            value={isLoading ? '...' : formatCurrency(summary?.totalRevenue || 0)} 
            change="" 
            sub="Subscriptions + Commission"
          />
          <HighlightCard 
            icon={<Clock size={16} />} 
            label="Avg. Commute Time" 
            value={isLoading ? '...' : (summary?.avgCommuteMinutes ? `${summary.avgCommuteMinutes} mins` : 'N/A')} 
            change="" 
            sub="From completed trips"
          />
          <HighlightCard 
            icon={<Users size={16} />} 
            label="Driver Active Ratio" 
            value={isLoading ? '...' : `${summary?.driverActivePercent || 0}%`} 
            change="" 
            sub={`Out of ${summary?.totalDrivers || 0} registered`}
          />
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', gap: '24px' }}>
          <button
            onClick={() => setActiveTab('fleet')}
            aria-selected={activeTab === 'fleet'}
            role="tab"
            style={{
              padding: '10px 4px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'fleet' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
              color: activeTab === 'fleet' ? 'var(--text-main)' : 'var(--text-light)',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            Fleet & Ride Trends
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            aria-selected={activeTab === 'financial'}
            role="tab"
            style={{
              padding: '10px 4px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'financial' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
              color: activeTab === 'financial' ? 'var(--text-main)' : 'var(--text-light)',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
          >
            Financial Performance
          </button>
        </div>

        {/* Interactive Workspace Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '24px' }} className="dashboard-grid">
          
          {/* Main Chart Panel */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div className="flex-between" style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)' }}>
                {activeTab === 'fleet' ? 'Weekly Ride Frequency' : 'Platform Gross Revenue Distribution'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-light)' }}>
                <span>Interactive Telemetry Feed</span>
                <HelpCircle size={12} />
              </div>
            </div>

            {activeTab === 'fleet' ? (
              /* Ride Frequency Area Chart */
              <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {currentTrips.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)', fontSize: '12px' }}>No trip data available</div>
                ) : (
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height={chartHeight} style={{ overflow: 'visible' }} aria-hidden="true">
                  <defs>
                    <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="0" y1={chartHeight * 0.25} stroke="var(--border-color)" strokeDasharray="3,3" x2={chartWidth} y2={chartHeight * 0.25} />
                  <line x1="0" y1={chartHeight * 0.5} stroke="var(--border-color)" strokeDasharray="3,3" x2={chartWidth} y2={chartHeight * 0.5} />
                  <line x1="0" y1={chartHeight * 0.75} stroke="var(--border-color)" strokeDasharray="3,3" x2={chartWidth} y2={chartHeight * 0.75} />

                  {/* Gradient Area */}
                  <path d={tripAreaPath} fill="url(#area-gradient)" />
                  
                  {/* Chart Line */}
                  <path d={`M ${tripPath}`} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
                  
                  {/* Interactive Circles */}
                  {currentTrips.map((val: number, idx: number) => {
                    const x = (idx / (currentTrips.length - 1)) * chartWidth;
                    const y = chartHeight - ((val - minTrip) / tripRange) * (chartHeight - 20) - 10;
                    return (
                      <g key={idx}>
                        <circle cx={x} cy={y} r="4.5" fill="var(--color-primary)" stroke="var(--bg-card-solid)" strokeWidth="1.5" />
                        <text x={x} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--text-main)">
                          {val}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '16px', fontSize: '10px', color: 'var(--text-light)', fontWeight: 700 }}>
                  {tripTrend.map((t: any, i: number) => <span key={i}>{t.label}</span>)}
                </div>
              </div>
            ) : (
              /* Revenue Bar Chart */
              <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {currentRevenue.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)', fontSize: '12px' }}>No revenue data available</div>
                ) : (
                <svg viewBox={`0 0 ${barChartWidth} ${barChartHeight}`} width="100%" height={barChartHeight} style={{ overflow: 'visible' }} aria-hidden="true">
                  <defs>
                    <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                  </defs>
                  {/* Grid Lines */}
                  <line x1="0" y1={barChartHeight * 0.25} stroke="var(--border-color)" strokeDasharray="3,3" x2={barChartWidth} y2={barChartHeight * 0.25} />
                  <line x1="0" y1={barChartHeight * 0.5} stroke="var(--border-color)" strokeDasharray="3,3" x2={barChartWidth} y2={barChartHeight * 0.5} />
                  <line x1="0" y1={barChartHeight * 0.75} stroke="var(--border-color)" strokeDasharray="3,3" x2={barChartWidth} y2={barChartHeight * 0.75} />

                  {/* Render Bars */}
                  {currentRevenue.map((val: number, idx: number) => {
                    const totalBars = currentRevenue.length;
                    const barWidth = (barChartWidth / totalBars) * 0.6;
                    const spacing = (barChartWidth / totalBars) * 0.4;
                    const x = idx * (barWidth + spacing) + spacing / 2;
                    const barHeight = (val / revRange) * (barChartHeight - 20);
                    const y = barChartHeight - barHeight;

                    return (
                      <g key={idx}>
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          rx="3"
                          fill="url(#bar-gradient)"
                          stroke="none"
                        />
                        <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--text-main)">
                          {val > 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '16px', fontSize: '10px', color: 'var(--text-light)', fontWeight: 700 }}>
                  {revenueTrend.map((t: any, i: number) => <span key={i}>{t.label}</span>)}
                </div>
              </div>
            )}
          </div>

          {/* Customer / Driver Ratio Donut Chart Card */}
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>Fleet Utilization</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-light)' }}>Onboarded customers vs active operational drivers</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '20px 0', position: 'relative' }}>
              {/* SVG Circular Progress/Donut */}
              <svg width="120" height="120" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--border-color)" strokeWidth="2.5" />
                <circle 
                  cx="18" 
                  cy="18" 
                  r="15.915" 
                  fill="none" 
                  stroke="var(--color-primary)" 
                  strokeWidth="2.8" 
                  strokeDasharray={`${summary?.totalDrivers ? Math.round((summary.activeDrivers / summary.totalDrivers) * 100) : 0} ${summary?.totalDrivers ? 100 - Math.round((summary.activeDrivers / summary.totalDrivers) * 100) : 100}`} 
                  strokeDashoffset="25" 
                />
              </svg>
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', display: 'block', letterSpacing: '-0.5px' }}>
                  {summary?.totalDrivers ? Math.round((summary.activeDrivers / summary.totalDrivers) * 100) : 0}%
                </span>
                <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Efficiency</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="flex-between" style={{ fontSize: '11px', padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-light)', fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }}></span>
                  Active Drivers
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{summary?.activeDrivers || 0} / {summary?.totalDrivers || 0}</span>
              </div>

              <div className="flex-between" style={{ fontSize: '11px', padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-light)', fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3B82F6' }}></span>
                  Active Passes
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{summary?.activePasses || 0} Pass</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Metrics Table */}
        <div className="glass-card" style={{ marginTop: '28px', padding: '20px 24px' }}>
          <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '14px' }}>Route Performance Breakdown</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Route Name</th>
                  <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Daily Trips</th>
                  <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Occupancy</th>
                  <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>On-Time Rate</th>
                  <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revenue Share</th>
                </tr>
              </thead>
              <tbody>
                {routePerformance.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-light)' }}>No route data available</td></tr>
                ) : routePerformance.map((r: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 14px', fontSize: '12.5px', fontWeight: 700 }}>{r.routeName}</td>
                    <td style={{ padding: '12px 14px', fontSize: '12.5px', color: 'var(--text-light)' }}>{r.dailyTrips} Trips</td>
                    <td style={{ padding: '12px 14px', fontSize: '12.5px', color: 'var(--text-light)' }}>{r.avgOccupancy}%</td>
                    <td style={{ padding: '12px 14px', fontSize: '12.5px', color: r.onTimeRate >= 90 ? 'var(--color-primary)' : '#EF4444', fontWeight: 600 }}>{r.onTimeRate}%</td>
                    <td style={{ padding: '12px 14px', fontSize: '12.5px', fontWeight: 700 }}>{formatCurrency(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}

interface HighlightCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: string;
  sub: string;
}

function HighlightCard({ icon, label, value, change, sub }: HighlightCardProps) {
  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '18px 20px' }}>
      <div className="flex-between">
        <span style={{ color: 'var(--text-light)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </span>
        <span style={{ color: 'var(--color-primary)', display: 'flex' }}>
          {icon}
        </span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
          {value}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
          <ArrowUpRight size={11} />
          {change}
        </span>
      </div>
      
      <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>
        {sub}
      </span>
    </div>
  );
}
