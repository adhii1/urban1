'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Clock, XCircle } from 'lucide-react';
import { useCorporateStore } from '@/stores/corporateStore';
import { API_BASE_URL } from '@/lib/apiBase';

/** The login error can be a plain message, or one of the two gated states. */
type LoginStatus = 'idle' | 'pending' | 'rejected' | 'error';

export default function CorporateLoginScreen() {
  const router = useRouter();
  const setAuth = useCorporateStore((state) => state.setAuth);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{10}$/.test(phone)) { setStatus('error'); setErrorMessage('Please enter a valid 10-digit mobile number.'); return; }
    if (!password) { setStatus('error'); setErrorMessage('Please enter your password.'); return; }
    setLoading(true);
    setStatus('idle');
    setErrorMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, password }),
      });
      const result = await response.json();

      // 403 is returned for PENDING and REJECTED corporate accounts.
      // The backend message already explains the situation clearly, so we
      // surface it verbatim but also switch to a richer status UI.
      if (response.status === 403) {
        const msg: string = result.message || '';
        if (msg.toLowerCase().includes('pending') || msg.toLowerCase().includes('awaiting')) {
          setStatus('pending');
        } else if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('not approved')) {
          setStatus('rejected');
        } else {
          // Some other 403 (e.g. account inactive / suspended)
          setStatus('error');
          setErrorMessage(msg || 'Access denied. Contact TORQQ support.');
        }
        return;
      }

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.message || 'Unable to sign in.');
      }

      const role = String(result.data.user?.role || '').toLowerCase();
      if (role !== 'corporate') {
        setStatus('error');
        setErrorMessage('This account is not registered as a corporate account.');
        return;
      }

      setAuth({
        companyName: result.data.user?.name || 'Company',
        corporatePhone: result.data.user?.phone || phone,
        corporateId: result.data.user?.id || result.data.user?._id,
        accessToken: result.data.accessToken,
      });
      router.push('/corporate/dashboard');
    } catch (reason) {
      setStatus('error');
      setErrorMessage(reason instanceof Error ? reason.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20, background: 'radial-gradient(circle at 50% 50%, #0c1a2e 0%, #070d14 100%)' }}>
      <section style={{ width: '100%', maxWidth: 420, padding: '40px 32px', background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Building2 size={20} />
          </span>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>TORQQ Corporate</h1>
        </div>
        <h2 style={{ marginBottom: 24, color: '#94A3B8', fontSize: 15, fontWeight: 600, textAlign: 'center' }}>
          Sign in to manage your company&apos;s commute
        </h2>

        {/* ── PENDING status banner ──────────────────────────────── */}
        {status === 'pending' && (
          <div role="alert" style={{ marginBottom: 20, padding: '16px', borderRadius: 12, background: '#FEF3C7', border: '1px solid #FCD34D', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="#D97706" />
              <span style={{ fontWeight: 700, fontSize: 13, color: '#92400E' }}>Application Pending Review</span>
            </div>
            <p style={{ fontSize: 12, color: '#78350F', margin: 0, lineHeight: 1.6 }}>
              Your corporate account is awaiting admin approval. You will be able to sign in once the TORQQ team reviews your application (typically 1–2 business days).
            </p>
          </div>
        )}

        {/* ── REJECTED status banner ─────────────────────────────── */}
        {status === 'rejected' && (
          <div role="alert" style={{ marginBottom: 20, padding: '16px', borderRadius: 12, background: '#FEF2F2', border: '1px solid #FCA5A5', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <XCircle size={18} color="#DC2626" />
              <span style={{ fontWeight: 700, fontSize: 13, color: '#991B1B' }}>Application Not Approved</span>
            </div>
            <p style={{ fontSize: 12, color: '#7F1D1D', margin: 0, lineHeight: 1.6 }}>
              Your corporate account application was not approved. Please contact{' '}
              <a href="mailto:support@torqq.in" style={{ color: '#DC2626', fontWeight: 700 }}>TORQQ support</a>{' '}
              for more information or to re-apply.
            </p>
          </div>
        )}

        {/* ── Generic error ──────────────────────────────────────── */}
        {status === 'error' && errorMessage && (
          <p role="alert" style={{ marginBottom: 16, padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#DC2626', fontSize: 12 }}>
            {errorMessage}
          </p>
        )}

        {/* Login form — always visible so they can retry with a different account */}
        <form onSubmit={submit}>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="corpPhone" style={{ display: 'block', marginBottom: 8, color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>PHONE NUMBER</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14, fontWeight: 600 }}>+91</span>
              <input
                id="corpPhone"
                type="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                style={{ boxSizing: 'border-box', width: '100%', padding: '12px 16px 12px 48px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, background: 'rgba(255,255,255,0.02)', color: '#fff', fontSize: 14 }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="corpPassword" style={{ display: 'block', marginBottom: 8, color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>PASSWORD</label>
            <input
              id="corpPassword"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              style={{ boxSizing: 'border-box', width: '100%', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, background: 'rgba(255,255,255,0.02)', color: '#fff', fontSize: 14 }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 24, padding: '14px 24px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Signing in…' : 'Continue with Credentials'}
          </button>
        </form>

        <p style={{ marginTop: 24, color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
          Need a corporate account?{' '}
          <Link href="/customer" style={{ color: '#3B82F6', fontWeight: 700 }}>
            Register on the customer portal
          </Link>
        </p>
      </section>
    </main>
  );
}
