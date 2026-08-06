'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { usePauseRequests, useApprovePauseRequest, useRejectPauseRequest } from '../../lib/hooks/useAdminQueries';
import { useState } from 'react';
import { Check, X, Clock, Filter } from 'lucide-react';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B' },
  APPROVED: { bg: 'rgba(16,185,129,0.12)', fg: '#10B981' },
  REJECTED: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444' },
};

export default function PauseRequestsPage() {
  useAuthGuard();
  const [filter, setFilter] = useState<string>('');
  const { data, isLoading } = usePauseRequests(filter || undefined);
  const approveMutation = useApprovePauseRequest();
  const rejectMutation = useRejectPauseRequest();

  const requests = data?.success ? (data.data || []) : [];

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectMutation.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
    }
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} /> Pause Requests
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Approve or reject customer subscription pause requests</p>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Filter size={14} color="var(--text-light)" />
          {['', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer',
                background: filter === s ? 'var(--color-primary)' : 'var(--bg-hover)',
                color: filter === s ? '#fff' : 'var(--text-light)',
              }}>
              {s || 'All'}
            </button>
          ))}
        </div>

        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {['Customer', 'Subscription', 'Requested Date', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '14px 18px', textAlign: 'left', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading...</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No pause requests found.</td></tr>
              ) : requests.map((r: any) => {
                const statusColor = STATUS_COLORS[r.status] || STATUS_COLORS.PENDING;
                return (
                  <tr key={r._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {r.customerId?.name || '-'}
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: '12px', color: 'var(--text-light)' }}>
                      {r.subscriptionId?.status || '-'}
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: '12px', color: 'var(--text-light)' }}>
                      {r.requestedDate ? new Date(r.requestedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px',
                        background: statusColor.bg, color: statusColor.fg,
                      }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      {r.status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleApprove(r._id)}
                            disabled={approveMutation.isPending}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10B981', padding: '4px' }} title="Approve">
                            <Check size={16} />
                          </button>
                          <button onClick={() => handleReject(r._id)}
                            disabled={rejectMutation.isPending}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }} title="Reject">
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
