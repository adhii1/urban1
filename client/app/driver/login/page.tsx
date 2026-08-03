'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverStore } from '@/stores/driverStore';
import { Phone, Lock, ArrowRight } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export default function DriverLoginPage() {
  const router = useRouter();
  const { setAuth } = useDriverStore();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAuth({
          driverName: data.data.user?.name || 'Driver',
          driverPhone: phone,
          driverId: data.data.user?.id || data.data.user?._id,
          accessToken: data.data.accessToken,
        });
        router.push('/driver/dashboard');
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#090D16', padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px', background: 'rgba(15,23,42,0.9)',
        borderRadius: '20px', padding: '36px 28px', border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '50px', height: '50px', background: '#16C15D', borderRadius: '12px',
            fontSize: '24px', fontWeight: 800, color: '#FFF', marginBottom: '12px',
          }}>T</div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#FFF' }}>TORQQ Driver</h1>
          <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>Sign in to start driving</p>
        </div>

        {error && (
          <div style={{
            padding: '10px', marginBottom: '16px', background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
            color: '#EF4444', fontSize: '12px', textAlign: 'center',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Phone Number</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <span style={{
                padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', color: '#94A3B8', fontSize: '13px', fontWeight: 600,
              }}>+91</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" style={{
                flex: 1, padding: '12px', background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                color: '#FFF', fontSize: '13px',
              }} />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{
              width: '100%', padding: '12px', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
              color: '#FFF', fontSize: '13px', marginTop: '6px',
            }} />
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '14px', background: loading ? '#16A04E' : '#16C15D', color: '#FFF', border: 'none',
            borderRadius: '12px', fontWeight: 700, fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            {loading ? 'Signing in...' : <>Continue <ArrowRight size={16} /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
