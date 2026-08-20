'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, Check, ChevronRight, CircleUserRound, Clock3, Headphones, House, MapPin, ShieldCheck, Ticket, X } from 'lucide-react';
import { useCustomerStore } from '@/stores/customerStore';
import { useToast } from '@/stores/toastStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';
const stopFeatures = ['Fixed pickup & drop points', 'Lower fares', 'High occupancy shared rides', 'Ideal for daily office commute'];
const homeFeatures = ['Doorstep pickup & drop', 'More comfort & convenience', 'Premium experience', 'Ideal for hassle-free commute'];
const highlights = [
  { title: 'Women Safety First', description: 'Women Only Rides & SOS Support', icon: ShieldCheck },
  { title: 'Live Tracking', description: 'Track your ride in real-time', icon: MapPin },
  { title: 'Fixed Timings', description: 'On-time pickups and drops', icon: Clock3 },
  { title: 'Affordable Passes', description: 'Monthly passes with best pricing', icon: Ticket },
  { title: '24x7 Support', description: "We're here to help you anytime", icon: Headphones },
];

type LoginMode = 'otp' | 'password';
type AuthStep = 'phone' | 'otp';

export default function CustomerHomePage() {
  const router = useRouter();
  const isLoggedIn = useCustomerStore((state) => state.isLoggedIn);
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>('otp');
  const [step, setStep] = useState<AuthStep>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);

  const openAuth = () => {
    if (isLoggedIn) { router.push('/customer/dashboard'); return; }
    setModalOpen(true);
  };
  const closeAuth = () => { setModalOpen(false); setLoginMode('otp'); setStep('phone'); setName(''); setPhone(''); setPassword(''); setOtp(['', '', '', '', '', '']); };
  const authenticate = (payload: { user?: { name?: string; phone?: string; role?: string; id?: string; _id?: string; hasCustomPassword?: boolean }; accessToken?: string }) => {
    const role = String(payload.user?.role || '').toLowerCase();
    if (role && role !== 'customer') { showToast('This account is registered as a driver. Use the Driver sign-in.', 'error'); return; }
    useCustomerStore.getState().setAuth({ userName: payload.user?.name || name || 'Rider', mobileNumber: payload.user?.phone || phone, userRole: payload.user?.role || 'Customer', userId: payload.user?.id || payload.user?._id || '', accessToken: payload.accessToken, hasCustomPassword: payload.user?.hasCustomPassword || false });
    closeAuth(); router.push('/customer/dashboard');
  };
  const sendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{10}$/.test(phone)) { showToast('Please enter a valid 10-digit number.', 'error'); return; }
    setLoading(true);
    try { const response = await fetch(`${API_BASE_URL}/auth/send-otp`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, purpose: 'LOGIN' }) }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || 'Failed to send OTP.'); setStep('otp'); showToast('OTP sent successfully.', 'success'); } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Server connection error.', 'error'); } finally { setLoading(false); }
  };
  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault(); const value = otp.join(''); if (value.length !== 6) { showToast('Please enter the complete 6-digit OTP.', 'error'); return; }
    setLoading(true);
    try { const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp: value, purpose: 'LOGIN', name }) }); const result = await response.json(); if (!response.ok || !result.success || !result.data) throw new Error(result.message || 'Invalid OTP.'); authenticate(result.data); } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Verification failed.', 'error'); } finally { setLoading(false); }
  };
  const passwordLogin = async (event: React.FormEvent) => {
    event.preventDefault(); if (!/^\d{10}$/.test(phone) || !password) { showToast('Enter your mobile number and password.', 'error'); return; }
    setLoading(true);
    try { const response = await fetch(`${API_BASE_URL}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) }); const result = await response.json(); if (!response.ok || !result.success || !result.data) throw new Error(result.message || 'Invalid credentials.'); authenticate(result.data); } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Sign-in failed.', 'error'); } finally { setLoading(false); }
  };
  const updateOtp = (index: number, value: string) => { if (!/^\d?$/.test(value)) return; setOtp((current) => current.map((digit, itemIndex) => itemIndex === index ? value : digit)); };

  return <div>
    <header className="navbar"><div className="container nav-container"><div className="nav-brand"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="logo-link"><span>URBAN </span><span className="logo-q">Communto</span></button><p className="tagline">Smart Commute. Better Everyday.</p></div><div className="nav-actions"><button className="btn-login" onClick={openAuth}><CircleUserRound size={20} />{isLoggedIn ? 'Go to Dashboard' : 'Login / Sign Up'}</button><button className="btn-menu" aria-label="Open menu"><span aria-hidden>☰</span></button></div></div></header>
    <main>
      <section className="hero"><div className="container hero-container"><div className="hero-content fade-in visible"><h1 className="hero-title">Smart Daily Commute <br />for <span className="text-green">Bangalore</span></h1><p className="hero-description">Affordable, reliable and safe office<br />commute with fixed routes, timings<br />and monthly passes.</p><button className="btn-primary cta-btn" onClick={openAuth}><Ticket size={24} />Book Your Commute Pass</button><div className="trust-indicators"><span className="trust-item"><Check size={20} fill="#1DB954" color="#fff" />Safe Rides</span><span className="dot">•</span><span className="trust-item">Verified Drivers</span><span className="dot">•</span><span className="trust-item">Fixed Pricing</span></div></div><div className="hero-illustration fade-in visible"><div className="image-placeholder hero-img-wrapper" style={{ minHeight: 315, background: '#E2E8F0' }}><img src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=85" alt="People waiting at a bus stop for their commute" className="hero-img" /></div></div></div></section>
      <section className="commute-options"><div className="container"><div className="section-header fade-in visible"><h2 className="section-title">Choose Your Commute Option</h2><p className="section-subtitle">Select the commute type that suits you best</p></div><div className="cards-container"><article className="commute-card card-green fade-in visible"><div className="card-header"><span className="icon-wrapper green-icon-wrapper"><Bus size={25} /></span><div className="card-titles"><h3>Stop-to-Stop Pass</h3><span>Bus Stop to Bus Stop</span></div></div><div className="card-illustration-box"><img src="https://images.unsplash.com/photo-1503917988258-f87a78e3c995?auto=format&fit=crop&w=900&q=85" alt="Shared commute bus route" className="card-img" /></div><ul className="feature-list">{stopFeatures.map((feature) => <li key={feature}><Check size={20} />{feature}</li>)}</ul><button className="btn-card btn-green" onClick={openAuth}>Choose Stop-to-Stop <ChevronRight size={20} /></button></article><article className="commute-card card-blue fade-in visible"><div className="card-header"><span className="icon-wrapper blue-icon-wrapper"><House size={25} /></span><div className="card-titles"><h3>Home-to-Office Pass</h3><span>Doorstep to Office</span></div></div><div className="card-illustration-box"><img src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=85" alt="Home to office commute" className="card-img" /></div><ul className="feature-list">{homeFeatures.map((feature) => <li key={feature}><Check size={20} />{feature}</li>)}</ul><button className="btn-card btn-blue" onClick={openAuth}>Choose Home-to-Office <ChevronRight size={20} /></button></article></div></div></section>
      <section className="features-section fade-in visible"><div className="container features-container">{highlights.map((highlight) => { const Icon = highlight.icon; return <article className="feature-box" key={highlight.title}><span className="feature-icon"><Icon size={32} /></span><h4>{highlight.title}</h4><p>{highlight.description}</p></article>; })}</div></section>
    </main>
    <div className={`modal-overlay ${modalOpen ? 'show' : ''}`} onClick={(event) => { if (event.target === event.currentTarget) closeAuth(); }}><div className="modal-container"><button className="modal-close" onClick={closeAuth} aria-label="Close modal"><X size={24} /></button><div className="modal-header"><span className="modal-logo">TORQQ</span><h2 className="modal-title">Welcome to TORQQ</h2><p className="modal-subtitle">Smart Daily Commute</p></div><div className="login-method-choice"><button type="button" className={`login-method-button ${loginMode === 'otp' ? 'is-active' : ''}`} onClick={() => { setLoginMode('otp'); setStep('phone'); }}>Continue with OTP</button><button type="button" className={`login-method-button ${loginMode === 'password' ? 'is-active' : ''}`} onClick={() => { setLoginMode('password'); setStep('phone'); }}>Sign in with password</button></div>{loginMode === 'otp' && step === 'phone' && <form className="modal-form" onSubmit={sendOtp}><div className="form-group"><label htmlFor="fullName">Full Name</label><input id="fullName" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" autoComplete="name" /></div><div className="form-group"><label htmlFor="mobileNumber">Mobile Number</label><div className="input-with-prefix"><span className="prefix">+91</span><input id="mobileNumber" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter 10-digit number" autoComplete="tel" /></div></div><button className="btn-primary modal-btn-full" disabled={loading}>{loading ? 'Sending…' : 'Continue'}</button></form>}{loginMode === 'otp' && step === 'otp' && <form className="modal-form" onSubmit={verifyOtp}><div className="otp-instruction"><p>Enter the 6-digit code sent to</p><strong>+91 {phone}</strong><button type="button" className="btn-text btn-change-number" onClick={() => setStep('phone')}>Change</button></div><div className="otp-inputs">{otp.map((digit, index) => <input key={index} className="otp-box" value={digit} onChange={(event) => updateOtp(index, event.target.value)} maxLength={1} inputMode="numeric" aria-label={`OTP digit ${index + 1}`} />)}</div><button className="btn-primary modal-btn-full" disabled={loading}>{loading ? 'Verifying…' : 'Verify & Proceed'}</button><div className="resend-container"><span className="resend-text">Didn&apos;t receive code?</span><button type="button" className="btn-text btn-resend" onClick={() => sendOtp({ preventDefault() {} } as React.FormEvent)}>Resend OTP</button></div><div className="login-method-switch"><span>Have a password?</span><button type="button" className="btn-text btn-switch-method" onClick={() => { setLoginMode('password'); setStep('phone'); }}>Sign in with password</button></div></form>}{loginMode === 'password' && <form className="modal-form" onSubmit={passwordLogin}><div className="form-group"><label htmlFor="passwordMobile">Mobile Number</label><div className="input-with-prefix"><span className="prefix">+91</span><input id="passwordMobile" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter 10-digit number" /></div></div><div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" /></div><button className="btn-primary modal-btn-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button><div className="login-method-switch"><span>Prefer a one-time password?</span><button type="button" className="btn-text btn-switch-method" onClick={() => { setLoginMode('otp'); setStep('phone'); }}>Continue with OTP</button></div></form>}</div></div>
  </div>;
}
