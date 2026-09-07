'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, CreditCard, Building2, TicketPercent } from 'lucide-react';
import { api } from '@/lib/api/client';

interface CorporateDashboard {
  companyName: string;
  employeeCount: number;
  employeeLimit: number;
  seatsRemaining: number;
  activeSubscriptions: number;
  status: string;
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>{value}</p>
    </div>
  );
}

export default function CorporateDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['corporate', 'dashboard'],
    queryFn: () => api.get<CorporateDashboard>('/corporate/dashboard'),
    select: (d) => d.data,
  });

  if (isLoading) {
    return <p style={{ color: '#64748B', fontSize: 13 }}>Loading dashboard…</p>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{data?.companyName || 'Company'} Dashboard</h2>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>Overview of your team&apos;s commute program.</p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard icon={Users} label="Employees Onboarded" value={data?.employeeCount ?? 0} color="#3B82F6" />
        <StatCard icon={TicketPercent} label="Seats Remaining" value={data?.seatsRemaining ?? 0} color="#16C15D" />
        <StatCard icon={CreditCard} label="Active Subscriptions" value={data?.activeSubscriptions ?? 0} color="#8B5CF6" />
        <StatCard icon={Building2} label="Account Status" value={data?.status || 'ACTIVE'} color="#F59E0B" />
      </div>

      <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Employee seat usage</p>
        <div style={{ height: 8, borderRadius: 4, background: '#F1F5F9', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${data?.employeeLimit ? Math.min(100, ((data.employeeCount || 0) / data.employeeLimit) * 100) : 0}%`,
            background: '#3B82F6',
          }} />
        </div>
        <p style={{ fontSize: 11, color: '#64748B', marginTop: 8 }}>{data?.employeeCount ?? 0} of {data?.employeeLimit ?? 0} seats used</p>
      </div>
    </div>
  );
}
