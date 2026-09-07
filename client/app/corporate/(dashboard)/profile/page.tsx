'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useToast } from '@/stores/toastStore';

interface CorporateProfile {
  companyName: string;
  contactPerson?: { name?: string; designation?: string };
  billingEmail?: string;
  gstNumber?: string;
  address?: string;
  employeeLimit?: number;
}

export default function CorporateProfilePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['corporate', 'profile'],
    queryFn: () => api.get<CorporateProfile>('/corporate/profile'),
    select: (d) => d.data,
  });

  const [form, setForm] = useState({ companyName: '', contactName: '', contactDesignation: '', billingEmail: '', address: '' });

  useEffect(() => {
    if (data) {
      setForm({
        companyName: data.companyName || '',
        contactName: data.contactPerson?.name || '',
        contactDesignation: data.contactPerson?.designation || '',
        billingEmail: data.billingEmail || '',
        address: data.address || '',
      });
    }
  }, [data]);

  const updateProfile = useMutation({
    mutationFn: () => api.put('/corporate/profile', {
      companyName: form.companyName,
      contactPerson: { name: form.contactName, designation: form.contactDesignation },
      billingEmail: form.billingEmail,
      address: form.address,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corporate', 'profile'] });
      showToast('Profile updated', 'success');
    },
    onError: (err: Error) => showToast(err.message || 'Failed to update profile', 'error'),
  });

  if (isLoading) return <p style={{ color: '#64748B', fontSize: 13 }}>Loading profile…</p>;

  const field = (label: string, value: string, onChange: (v: string) => void, type = 'text') => (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', marginTop: 6, padding: 12, border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13 }} />
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Company Profile</h2>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>GST number and seat limit are managed by TORQQ support.</p>

      <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        {field('Company Name', form.companyName, (v) => setForm({ ...form, companyName: v }))}
        {field('Billing Email', form.billingEmail, (v) => setForm({ ...form, billingEmail: v }), 'email')}
        {field('Address', form.address, (v) => setForm({ ...form, address: v }))}
        {field('Contact Person Name', form.contactName, (v) => setForm({ ...form, contactName: v }))}
        {field('Contact Person Designation', form.contactDesignation, (v) => setForm({ ...form, contactDesignation: v }))}

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748B' }}>
          <span>GST: {data?.gstNumber || '—'}</span>
          <span>Employee Limit: {data?.employeeLimit ?? '—'}</span>
        </div>

        <button
          onClick={() => updateProfile.mutate()}
          disabled={updateProfile.isPending}
          style={{ padding: 14, borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13, cursor: updateProfile.isPending ? 'not-allowed' : 'pointer', opacity: updateProfile.isPending ? 0.7 : 1 }}
        >
          {updateProfile.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
