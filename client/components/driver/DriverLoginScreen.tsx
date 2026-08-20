'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverStore } from '@/stores/driverStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export default function DriverLoginScreen() {
  const router = useRouter();
  const setAuth = useDriverStore((state) => state.setAuth);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{10}$/.test(phone)) { setError('Please enter a valid 10-digit mobile number.'); return; }
    if (!password) { setError('Please enter your password.'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ phone, password }) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || 'Unable to sign in.');
      const role = String(result.data.user?.role || '').toLowerCase();
      if (role !== 'driver') throw new Error('This account is registered as a customer. Use the customer sign-in.');
      setAuth({ driverName: result.data.user?.name || 'Driver', driverPhone: result.data.user?.phone || phone, driverId: result.data.user?.id || result.data.user?._id, accessToken: result.data.accessToken });
      router.push('/driver/dashboard');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Login failed. Please try again.'); }
    finally { setLoading(false); }
  };

  return <main className="driver-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
    <section className="driver-glass-card" style={{ width: '100%', maxWidth: 420, padding: '40px 32px', background: 'var(--driver-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}><span className="driver-brand-mark" style={{ width: 38, height: 38, fontSize: 22 }}>T</span><h1 style={{ color: 'var(--driver-text)', fontSize: 20, fontWeight: 700 }}>TORQQ Driver</h1></div>
      <h2 style={{ marginBottom: 24, color: 'var(--driver-muted)', fontSize: 16, fontWeight: 600, textAlign: 'center' }}>Sign in to start driving</h2>
      {error && <p role="alert" style={{ marginBottom: 16, padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#DC2626', fontSize: 12 }}>{error}</p>}
      <form onSubmit={submit}>
        <div style={{ marginBottom: 20 }}><label htmlFor="loginPhone" style={{ display: 'block', marginBottom: 8, color: 'var(--driver-muted)', fontSize: 13, fontWeight: 600 }}>PHONE NUMBER</label><div style={{ position: 'relative' }}><span style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', color: 'var(--driver-muted)', fontSize: 14, fontWeight: 600 }}>+91</span><input id="loginPhone" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" style={{ boxSizing: 'border-box', width: '100%', padding: '12px 16px 12px 48px', border: '1px solid var(--driver-border)', borderRadius: 12, background: 'var(--driver-card-solid)', color: 'var(--driver-text)', fontSize: 14 }} /></div></div>
        <div style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><label htmlFor="loginPassword" style={{ color: 'var(--driver-muted)', fontSize: 13, fontWeight: 600 }}>PASSWORD</label><Link href="/driver/forgot-password" style={{ color: '#16C15D', fontSize: 12, fontWeight: 600 }}>Forgot Password?</Link></div><input id="loginPassword" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" style={{ boxSizing: 'border-box', width: '100%', padding: '12px 16px', border: '1px solid var(--driver-border)', borderRadius: 12, background: 'var(--driver-card-solid)', color: 'var(--driver-text)', fontSize: 14 }} /></div>
        <button type="submit" className="driver-primary-button" disabled={loading} style={{ width: '100%', marginTop: 24, padding: '14px 24px' }}>{loading ? 'Signing in…' : 'Continue with Credentials'}</button>
      </form>
      <p style={{ marginTop: 24, color: 'var(--driver-muted)', fontSize: 13, textAlign: 'center' }}>Don&apos;t have a partner account? <Link href="/driver/register" style={{ color: '#16C15D', fontWeight: 700 }}>Register Now</Link></p>
    </section>
  </main>;
}
