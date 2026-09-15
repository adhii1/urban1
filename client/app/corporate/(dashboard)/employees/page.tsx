'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, Plus, Trash2, UserRound, X, XCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useToast } from '@/stores/toastStore';

interface Employee {
  _id: string;
  name: string;
  userId?: { phone?: string; status?: string };
  subscriptionId?: { subscriptionType?: string; status?: string; pickupTime?: string } | null;
}

interface JoinRequest {
  _id: string;
  message?: string;
  customerId?: { _id: string; name: string; userId?: { phone?: string } };
  createdAt: string;
}

export default function CorporateEmployeesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['corporate', 'employees'],
    queryFn: () => api.get<Employee[]>('/corporate/employees'),
    select: (d) => d.data,
  });
  const { data: requestsData, isLoading: requestsLoading } = useQuery({
    queryKey: ['corporate', 'join-requests'],
    queryFn: () => api.get<JoinRequest[]>('/corporate/join-requests'),
    select: (d) => d.data,
  });

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '' });

  const addEmployee = useMutation({
    mutationFn: (payload: { name: string; phone: string; password: string }) => api.post('/corporate/employees', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corporate', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['corporate', 'dashboard'] });
      showToast('Employee onboarded successfully', 'success');
      setShowModal(false);
      setForm({ name: '', phone: '', password: '' });
    },
    onError: (err: Error) => showToast(err.message || 'Failed to add employee', 'error'),
  });

  const removeEmployee = useMutation({
    mutationFn: (id: string) => api.delete(`/corporate/employees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corporate', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['corporate', 'dashboard'] });
      showToast('Employee removed from roster', 'success');
    },
    onError: (err: Error) => showToast(err.message || 'Failed to remove employee', 'error'),
  });

  const reviewRequest = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => api.post(`/corporate/join-requests/${id}/${action}`, {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['corporate', 'join-requests'] });
      queryClient.invalidateQueries({ queryKey: ['corporate', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['corporate', 'dashboard'] });
      showToast(variables.action === 'approve' ? 'Employee request accepted' : 'Employee request declined', 'success');
    },
    onError: (err: Error) => showToast(err.message || 'Unable to review request', 'error'),
  });

  const employees = data || [];
  const requests = requestsData || [];

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(form.phone)) { showToast('Enter a valid 10-digit phone number', 'error'); return; }
    if (form.password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    addEmployee.mutate(form);
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Clock3 size={16} color="#D97706" /><h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Join requests {requests.length ? `(${requests.length})` : ''}</h2></div>
        <div style={{ background: '#FFFDF5', border: '1px solid #FDE68A', borderRadius: 12, overflow: 'hidden' }}>
          {requestsLoading ? <p style={{ padding: 18, color: '#64748B', fontSize: 13 }}>Loading requests…</p> : requests.length === 0 ? <p style={{ padding: 18, color: '#64748B', fontSize: 13 }}>No pending requests.</p> : requests.map((request) => <div key={request._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderBottom: '1px solid #FDE68A' }}><div><strong style={{ color: '#0F172A', fontSize: 13 }}>{request.customerId?.name || 'Customer'}</strong><p style={{ marginTop: 3, color: '#64748B', fontSize: 11 }}>{request.customerId?.userId?.phone || ''}{request.message ? ` · ${request.message}` : ''}</p></div><div style={{ display: 'flex', gap: 7 }}><button onClick={() => reviewRequest.mutate({ id: request._id, action: 'approve' })} disabled={reviewRequest.isPending} style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #86EFAC', borderRadius: 7, padding: '6px 9px', background: '#F0FDF4', color: '#15803D', fontWeight: 700, cursor: 'pointer' }}><Check size={13} />Accept</button><button onClick={() => reviewRequest.mutate({ id: request._id, action: 'reject' })} disabled={reviewRequest.isPending} style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #FCA5A5', borderRadius: 7, padding: '6px 9px', background: '#FEF2F2', color: '#B91C1C', fontWeight: 700, cursor: 'pointer' }}><XCircle size={13} />Decline</button></div></div>)}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>Employees</h2>
          <p style={{ fontSize: 13, color: '#64748B' }}>Onboard employees under your company account.</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          <Plus size={14} /> Add Employee
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['Name', 'Phone', 'Subscription', 'Status', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>Loading employees…</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>No employees onboarded yet.</td></tr>
            ) : employees.map((emp) => (
              <tr key={emp._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><UserRound size={14} color="#3B82F6" /> {emp.name}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: '#334155' }}>{emp.userId?.phone || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#334155' }}>{emp.subscriptionId?.subscriptionType || 'None'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: emp.userId?.status === 'ACTIVE' ? '#DCFCE7' : '#FEE2E2', color: emp.userId?.status === 'ACTIVE' ? '#16A34A' : '#EF4444' }}>
                    {emp.userId?.status || 'ACTIVE'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => { if (confirm('Remove this employee from the roster?')) removeEmployee.mutate(emp._id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }}
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <form onSubmit={handleAdd} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Add Employee</h3>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Full Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ananya Rao" style={{ width: '100%', marginTop: 6, padding: 12, border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Phone Number</label>
                <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="e.g. 9876543210" style={{ width: '100%', marginTop: 6, padding: 12, border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Temporary Password</label>
                <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" style={{ width: '100%', marginTop: 6, padding: 12, border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13 }} />
              </div>
            </div>
            <button type="submit" disabled={addEmployee.isPending} style={{ width: '100%', marginTop: 20, padding: 14, borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13, cursor: addEmployee.isPending ? 'not-allowed' : 'pointer', opacity: addEmployee.isPending ? 0.7 : 1 }}>
              {addEmployee.isPending ? 'Adding…' : 'Add Employee'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
