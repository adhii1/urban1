'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerStore } from '@/stores/customerStore';
import { useToast } from '@/stores/toastStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export default function CustomerHomePage() {
  const router = useRouter();
  const { isLoggedIn } = useCustomerStore();
  const { showToast } = useToast();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loginMode, setLoginMode] = useState<'otp' | 'password'>('otp');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);

  const handleAuthClick = () => {
    if (isLoggedIn) {
      router.push('/customer/dashboard');
    } else {
      setShowAuthModal(true);
    }
  };

  const storeAuthAndRedirect = (data: any) => {
    useCustomerStore.getState().setAuth({
      userName: data.user?.name || '',
      mobileNumber: data.user?.phone || phone,
      userRole: data.user?.role || 'customer',
      userId: data.user?.id || data.user?._id || '',
      accessToken: data.accessToken,
      hasCustomPassword: data.user?.hasCustomPassword || false,
    });
    showToast('Welcome to TORQQ!', 'success');
    setShowAuthModal(false);
    router.push('/customer/dashboard');
  };

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length !== 10) {
      showToast('Please enter a valid 10-digit number', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, purpose: 'LOGIN' }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('otp');
        showToast('OTP sent successfully', 'success');
      } else {
        showToast(data.message || 'Failed to send OTP', 'error');
      }
    } catch {
      showToast('Server connection error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      showToast('Please enter complete 6-digit OTP', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, otp: otpValue }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        storeAuthAndRedirect(data.data);
      } else {
        showToast(data.message || 'Invalid OTP', 'error');
      }
    } catch {
      showToast('Verification failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length !== 10) {
      showToast('Please enter a valid 10-digit number', 'error');
      return;
    }
    if (!password) {
      showToast('Please enter your password', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        storeAuthAndRedirect(data.data);
      } else {
        showToast(data.message || 'Invalid credentials', 'error');
      }
    } catch {
      showToast('Server connection error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
  };

  const resetModal = () => {
    setLoginMode('otp');
    setStep('phone');
    setPhone('');
    setPassword('');
    setOtp(['', '', '', '', '', '']);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      <header style={{ background: '#FFF', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px' }}>
          <div>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>URBAN </span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#16C15D' }}>Communto</span>
            <p style={{ fontSize: '10px', color: '#64748B' }}>Smart Commute. Better Everyday.</p>
          </div>
          <button onClick={handleAuthClick} className="btn-login" style={{
            background: '#16C15D', color: '#FFF', border: 'none', padding: '10px 20px',
            borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
          }}>
            {isLoggedIn ? 'Go to Dashboard' : 'Login'}
          </button>
        </div>
      </header>

      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
            Smart Daily Commute<br />for <span style={{ color: '#16C15D' }}>Bangalore</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '16px', lineHeight: 1.6 }}>
            Affordable, reliable and safe office commute with fixed routes, timings and monthly passes.
          </p>
          <button onClick={handleAuthClick} style={{
            marginTop: '24px', background: '#16C15D', color: '#FFF', border: 'none',
            padding: '14px 28px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,193,93,0.3)',
          }}>
            Get Started
          </button>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #16C15D22, #3B82F622)', borderRadius: '24px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '64px' }}>🚌</div>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '12px' }}>Your daily commute made easy</p>
        </div>
      </section>

      {showAuthModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => { setShowAuthModal(false); resetModal(); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: '20px', width: '100%', maxWidth: '400px', padding: '32px', position: 'relative' }}>
            <button onClick={() => { setShowAuthModal(false); resetModal(); }} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748B' }}>✕</button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <span style={{ fontWeight: 800, fontSize: '18px', color: '#16C15D' }}>TORQQ</span>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginTop: '8px' }}>Welcome to TORQQ</h3>
              <p style={{ fontSize: '12px', color: '#64748B' }}>Smart Daily Commute</p>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button type="button" onClick={() => { setLoginMode('otp'); setStep('phone'); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                  background: loginMode === 'otp' ? '#16C15D' : '#F3F4F6',
                  color: loginMode === 'otp' ? '#FFF' : '#64748B',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}>
                OTP Login
              </button>
              <button type="button" onClick={() => { setLoginMode('password'); setStep('phone'); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                  background: loginMode === 'password' ? '#16C15D' : '#F3F4F6',
                  color: loginMode === 'password' ? '#FFF' : '#64748B',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}>
                Password Login
              </button>
            </div>

            {loginMode === 'otp' ? (
              step === 'phone' ? (
                <form onSubmit={sendOtp}>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Mobile Number</label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <span style={{ padding: '12px', background: '#F3F4F6', borderRadius: '10px', fontSize: '13px', fontWeight: 600 }}>+91</span>
                      <input type="tel" placeholder="Enter 10-digit number" pattern="[0-9]{10}" required
                        value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        style={{ flex: 1, padding: '12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '13px' }} />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} style={{
                    width: '100%', padding: '14px', background: '#16C15D', color: '#FFF', border: 'none',
                    borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: loading ? 0.7 : 1,
                  }}>
                    {loading ? 'Sending...' : 'Send OTP'}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyOtp}>
                  <p style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', marginBottom: '16px' }}>
                    Enter the 6-digit code sent to <strong>+91 {phone}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
                    {otp.map((digit, i) => (
                      <input key={i} type="text" inputMode="numeric" maxLength={1} value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        style={{ width: '42px', height: '50px', textAlign: 'center', fontSize: '20px', fontWeight: 700, border: '1px solid #E5E7EB', borderRadius: '10px' }} />
                    ))}
                  </div>
                  <button type="submit" disabled={loading} style={{
                    width: '100%', padding: '14px', background: '#16C15D', color: '#FFF', border: 'none',
                    borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: loading ? 0.7 : 1,
                  }}>
                    {loading ? 'Verifying...' : 'Verify & Login'}
                  </button>
                  <button type="button" onClick={() => setStep('phone')} style={{ width: '100%', marginTop: '12px', background: 'none', border: 'none', color: '#16C15D', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
                    ← Change Number
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={loginWithPassword}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Mobile Number</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <span style={{ padding: '12px', background: '#F3F4F6', borderRadius: '10px', fontSize: '13px', fontWeight: 600 }}>+91</span>
                    <input type="tel" placeholder="Enter 10-digit number" pattern="[0-9]{10}" required
                      value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      style={{ flex: 1, padding: '12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '13px' }} />
                  </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Password</label>
                  <input type="password" placeholder="Enter your password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    style={{ width: '100%', padding: '12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '13px', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '14px', background: '#16C15D', color: '#FFF', border: 'none',
                  borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: loading ? 0.7 : 1,
                }}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
