'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useToastStore } from '../../stores/toastStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function ForgotPasswordPage() {
  const showToast = useToastStore((s) => s.showToast);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        showToast('Reset instructions sent.', 'success');
      } else {
        showToast(data.message || 'Failed to send reset link.', 'error');
      }
    } catch {
      showToast('Server connection error.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 50%, #0c111e 0%, #070a12 100%)',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decorative glows */}
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, rgba(0,0,0,0) 70%)',
        top: '-10%',
        left: '-10%',
        filter: 'blur(60px)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(59,130,246,0.05) 0%, rgba(0,0,0,0) 70%)',
        bottom: '-10%',
        right: '-10%',
        filter: 'blur(80px)',
        zIndex: 0,
      }} />

      <div className="glass-card fade-in" style={{
        width: '100%', maxWidth: '400px',
        background: 'rgba(15,23,42,0.4)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '20px', padding: '36px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        zIndex: 1,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <span style={{
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            color: '#FFF', width: '46px', height: '46px',
            borderRadius: '12px', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 800, fontSize: '24px',
            boxShadow: '0 8px 24px rgba(16,185,129,0.25)',
          }}>T</span>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginTop: '14px', letterSpacing: '-0.5px' }}>Reset Password</h2>
          <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px', lineHeight: 1.4 }}>
            {sent ? 'Check your phone/email for reset instructions.' : 'Enter your registered email or phone to receive a reset code.'}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '22px' }}>
              <label htmlFor="forgot-email-phone" style={{ color: '#94A3B8', fontSize: '9px', fontWeight: 700, letterSpacing: '0.8px' }}>EMAIL OR PHONE</label>
              <input
                id="forgot-email-phone"
                type="text" required value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="e.g. director@torqq.com"
                className="form-input"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#FFF', borderRadius: '10px', padding: '12px 14px',
                }}
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary"
              style={{
                width: '100%', borderRadius: '10px', padding: '12px',
                fontWeight: 700, fontSize: '13px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                boxShadow: '0 4px 14px rgba(16,185,129,0.25)',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Sending...' : 'Send Reset Code'}
            </button>
          </form>
        ) : null}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link href="/login" style={{ fontSize: '11px', fontWeight: 600, color: '#10B981', textDecoration: 'none' }}>
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
