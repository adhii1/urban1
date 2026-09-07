'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { useCorporateStore } from '@/stores/corporateStore';
import { API_BASE_URL } from '@/lib/apiBase';

export default function CorporateLoginScreen() {
  const router = useRouter();
  const setAuth = useCorporateStore((state) => state.setAuth);
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
      if (role !== 'corporate') throw new Error('This account is not registered as a corporate account.');
      setAuth({ companyName: result.data.user?.name || 'Company', corporatePhone: result.data.user?.phone || phone, corporateId: result.data.user?.id || result.data.user?._id, accessToken: result.data.accessToken });
      router.push('/corporate/dashboard');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Login failed. Please try again.'); }
    finally { setLoading(false); }
  };

  return <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20, background: 'radial-gradient(circle at 50% 50%, #0c1a2e 0%, #070d14 100%)' }}>
    <section style={{ width: '100%', maxWidth: 420, padding: '40px 32px', background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Building2 size={20} /></span>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>TORQQ Corporate</h1>
      </div>
      <h2 style={{ marginBottom: 24, color: '#94A3B8', fontSize: 15, fontWeight: 600, textAlign: 'center' }}>Sign in to manage your company&apos;s commute</h2>
      {error && <p role="alert" style={{ marginBottom: 16, padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#DC2626', fontSize: 12 }}>{error}</p>}
      <form onSubmit={submit}>
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="corpPhone" style={{ display: 'block', marginBottom: 8, color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>PHONE NUMBER</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14, fontWeight: 600 }}>+91</span>
            <input id="corpPhone" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" style={{ boxSizing: 'border-box', width: '100%', padding: '12px 16px 12px 48px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, background: 'rgba(255,255,255,0.02)', color: '#fff', fontSize: 14 }} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="corpPassword" style={{ display: 'block', marginBottom: 8, color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>PASSWORD</label>
          <input id="corpPassword" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" style={{ boxSizing: 'border-box', width: '100%', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, background: 'rgba(255,255,255,0.02)', color: '#fff', fontSize: 14 }} />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 24, padding: '14px 24px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Signing in…' : 'Continue with Credentials'}
        </button>
      </form>
      <p style={{ marginTop: 24, color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
        Need a corporate account? <Link href="/customer" style={{ color: '#3B82F6', fontWeight: 700 }}>Contact TORQQ support</Link>
      </p>
    </section>
  </main>;
}
