'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerStore } from '@/stores/customerStore';
import { Lock, CheckCircle } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export default function SetPasswordPage() {
  const router = useRouter();
  const { hasCustomPassword } = useCustomerStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (hasCustomPassword) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <CheckCircle size={40} color="#16C15D" />
        <h3 style={{ marginTop: '12px', fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
          Password Already Set
        </h3>
        <p style={{ fontSize: '13px', color: '#64748B', marginTop: '8px' }}>
          You can login with your phone and password.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/set-password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (data.success) {
        useCustomerStore.setState({ hasCustomPassword: true });
        setDone(true);
      } else {
        setError(data.message || 'Failed to set password.');
      }
    } catch {
      setError('Server connection error.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <CheckCircle size={40} color="#16C15D" />
        <h3 style={{ marginTop: '12px', fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
          Password Set Successfully
        </h3>
        <p style={{ fontSize: '13px', color: '#64748B', marginTop: '8px' }}>
          You can now login with your phone and password.
        </p>
        <button
          onClick={() => router.push('/customer/profile')}
          style={{
            marginTop: '16px', padding: '10px 24px', background: '#16C15D', color: '#FFF',
            border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
          }}
        >
          Back to Profile
        </button>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
        Set a Password
      </h3>
      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
        Set a password to login with phone + password instead of OTP.
      </p>

      {error && (
        <div style={{ padding: '10px', marginBottom: '16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#EF4444', fontSize: '12px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>New Password</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <Lock size={16} color="#64748B" />
            <input
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1, padding: '12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '13px' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Confirm Password</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <Lock size={16} color="#64748B" />
            <input
              type="password"
              placeholder="Re-enter password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{ flex: 1, padding: '12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '13px' }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: '14px', background: '#16C15D', color: '#FFF', border: 'none',
            borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Setting...' : 'Set Password'}
        </button>
      </form>
    </div>
  );
}
