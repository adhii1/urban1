'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useToast } from '@/stores/toastStore';

interface CorporateAccount {
  _id: string;
  companyName: string;
  employeeLimit: number;
  request?: { status: string; rejectionReason?: string } | null;
}

export default function CustomerCorporatePage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [message, setMessage] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['customer', 'corporates'],
    queryFn: () => api.get<CorporateAccount[]>('/customer/corporates'),
    select: (response) => response.data,
  });
  const apply = useMutation({
    mutationFn: (corporateId: string) => api.post(`/customer/corporates/${corporateId}/apply`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', 'corporates'] });
      setMessage('');
      showToast('Application sent to the company', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to send application', 'error'),
  });
  const corporates = data || [];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>Join a company commute</h2>
        <p style={{ marginTop: 5, fontSize: 13, color: '#64748B' }}>Apply to an active corporate account. Its team can accept or decline your request.</p>
      </div>
      <div style={{ marginBottom: 20, padding: 16, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12 }}>
        <label style={{ display: 'block', marginBottom: 7, fontSize: 11, fontWeight: 700, color: '#475569' }}>MESSAGE (OPTIONAL)</label>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={2} placeholder="Add a note for the company" style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 13, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {isLoading ? <p style={{ color: '#64748B' }}>Loading corporate accounts…</p> : corporates.length === 0 ? <p style={{ color: '#64748B' }}>No active corporate accounts are available right now.</p> : corporates.map((corporate) => {
          const status = corporate.request?.status;
          return <div key={corporate._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 18, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Building2 size={20} color="#2563EB" />
              <div><strong style={{ color: '#0F172A', fontSize: 14 }}>{corporate.companyName}</strong><p style={{ marginTop: 3, color: '#64748B', fontSize: 11 }}>Up to {corporate.employeeLimit} employees</p></div>
            </div>
            {status === 'PENDING' ? <span style={{ color: '#B45309', fontSize: 12, fontWeight: 700 }}><Clock3 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Pending</span> : status === 'APPROVED' ? <span style={{ color: '#15803D', fontSize: 12, fontWeight: 700 }}><CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Accepted</span> : status === 'REJECTED' ? <button onClick={() => apply.mutate(corporate._id)} disabled={apply.isPending} style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: '7px 11px', background: '#fff', color: '#2563EB', fontWeight: 700, cursor: 'pointer' }}><XCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Apply again</button> : <button onClick={() => apply.mutate(corporate._id)} disabled={apply.isPending} style={{ border: 'none', borderRadius: 8, padding: '8px 13px', background: '#2563EB', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Apply</button>}
          </div>;
        })}
      </div>
    </div>
  );
}