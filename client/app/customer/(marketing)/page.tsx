'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Bus, Check, ChevronRight, CircleUserRound, Clock3, Headphones, House, MapPin, ShieldCheck, Ticket, X } from 'lucide-react';
import { useCustomerStore } from '@/stores/customerStore';
import { useCorporateStore } from '@/stores/corporateStore';
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
/** Top-level modal tab: individual customer or corporate account */
type PortalTab = 'customer' | 'corporate';
/** Corporate flow step */
type CorporateStep = 'login' | 'register' | 'pending';
/** Fine-grained corporate login status for styled banners */
type CorpLoginStatus = 'idle' | 'pending_approval' | 'rejected' | 'error';

export default function CustomerHomePage() {
  const router = useRouter();
  const isLoggedIn = useCustomerStore((state) => state.isLoggedIn);
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  // Corporate tab is shown first — it's the primary entry point for new companies
  const [portalTab, setPortalTab] = useState<PortalTab>('corporate');

  // ── Customer auth state ──────────────────────────────────────────
  const [loginMode, setLoginMode] = useState<LoginMode>('otp');
  const [step, setStep] = useState<AuthStep>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);

  // ── Corporate auth / register state ─────────────────────────────
  const [corpStep, setCorpStep] = useState<CorporateStep>('login');
  const [corpPhone, setCorpPhone] = useState('');
  const [corpPassword, setCorpPassword] = useState('');
  const [corpLoading, setCorpLoading] = useState(false);
  const [corpLoginStatus, setCorpLoginStatus] = useState<CorpLoginStatus>('idle');
  const [corpError, setCorpError] = useState('');
  // Register form fields
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regContactName, setRegContactName] = useState('');
  const [regContactDesignation, setRegContactDesignation] = useState('');
  const [regBillingEmail, setRegBillingEmail] = useState('');
  const [regGst, setRegGst] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [pendingCompany, setPendingCompany] = useState('');

  // ── Helpers ──────────────────────────────────────────────────────
  const openAuth = () => {
    if (isLoggedIn) { router.push('/customer/dashboard'); return; }
    setModalOpen(true);
  };

  const closeAuth = () => {
    setModalOpen(false);
    setPortalTab('corporate');
    setLoginMode('otp'); setStep('phone'); setName(''); setPhone(''); setPassword(''); setOtp(['', '', '', '', '', '']);
    setCorpStep('login'); setCorpPhone(''); setCorpPassword(''); setCorpLoginStatus('idle'); setCorpError('');
    setRegCompanyName(''); setRegPhone(''); setRegPassword(''); setRegConfirmPassword('');
    setRegContactName(''); setRegContactDesignation(''); setRegBillingEmail(''); setRegGst(''); setRegAddress('');
    setRegError(''); setPendingCompany('');
  };

  const switchTab = (tab: PortalTab) => {
    setPortalTab(tab);
    // Reset per-tab state on switch
    if (tab === 'customer') {
      setLoginMode('otp'); setStep('phone'); setName(''); setPhone(''); setPassword('');
    } else {
      setCorpStep('login'); setCorpPhone(''); setCorpPassword(''); setCorpLoginStatus('idle'); setCorpError('');
    }
  };

  // ── Customer authentication ──────────────────────────────────────
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
    try {
      const response = await fetch(`${API_BASE_URL}/auth/send-otp`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, purpose: 'LOGIN' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Failed to send OTP.');
      setStep('otp'); showToast('OTP sent successfully.', 'success');
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Server connection error.', 'error'); }
    finally { setLoading(false); }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = otp.join('');
    if (value.length !== 6) { showToast('Please enter the complete 6-digit OTP.', 'error'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp: value, purpose: 'LOGIN', name }) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || 'Invalid OTP.');
      authenticate(result.data);
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Verification failed.', 'error'); }
    finally { setLoading(false); }
  };

  const passwordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{10}$/.test(phone) || !password) { showToast('Enter your mobile number and password.', 'error'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || 'Invalid credentials.');
      authenticate(result.data);
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Sign-in failed.', 'error'); }
    finally { setLoading(false); }
  };

  const updateOtp = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    setOtp((current) => current.map((digit, itemIndex) => itemIndex === index ? value : digit));
  };

  // ── Corporate login ──────────────────────────────────────────────
  const corpLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setCorpLoginStatus('idle');
    setCorpError('');
    if (!/^\d{10}$/.test(corpPhone)) { setCorpLoginStatus('error'); setCorpError('Please enter a valid 10-digit mobile number.'); return; }
    if (!corpPassword) { setCorpLoginStatus('error'); setCorpError('Please enter your password.'); return; }
    setCorpLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: corpPhone, password: corpPassword }) });
      const result = await response.json();

      // 403 = PENDING or REJECTED — surface as styled banners, not plain red text
      if (response.status === 403) {
        const msg: string = result.message || '';
        if (msg.toLowerCase().includes('pending') || msg.toLowerCase().includes('awaiting')) {
          setCorpLoginStatus('pending_approval');
        } else if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('not approved')) {
          setCorpLoginStatus('rejected');
        } else {
          setCorpLoginStatus('error');
          setCorpError(msg || 'Access denied. Contact TORQQ support.');
        }
        return;
      }

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.message || 'Unable to sign in.');
      }
      const role = String(result.data.user?.role || '').toLowerCase();
      if (role !== 'corporate') throw new Error('This account is not a corporate account.');
      useCorporateStore.getState().setAuth({ companyName: result.data.user?.name || 'Company', corporatePhone: result.data.user?.phone || corpPhone, corporateId: result.data.user?.id || result.data.user?._id, accessToken: result.data.accessToken });
      closeAuth();
      router.push('/corporate/dashboard');
    } catch (reason) {
      setCorpLoginStatus('error');
      setCorpError(reason instanceof Error ? reason.message : 'Login failed. Please try again.');
    } finally { setCorpLoading(false); }
  };

  // ── Corporate self-registration ──────────────────────────────────
  const corpRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setRegError('');
    if (!regCompanyName.trim()) { setRegError('Company name is required.'); return; }
    if (!/^\d{10}$/.test(regPhone)) { setRegError('Please enter a valid 10-digit mobile number.'); return; }
    if (regPassword.length < 6) { setRegError('Password must be at least 6 characters.'); return; }
    if (regPassword !== regConfirmPassword) { setRegError('Passwords do not match.'); return; }
    setRegLoading(true);
    try {
      const payload: Record<string, unknown> = {
        phone: regPhone,
        password: regPassword,
        companyName: regCompanyName.trim(),
      };
      if (regContactName.trim() || regContactDesignation.trim()) {
        payload.contactPerson = { name: regContactName.trim(), designation: regContactDesignation.trim() };
      }
      if (regBillingEmail.trim()) payload.billingEmail = regBillingEmail.trim();
      if (regGst.trim()) payload.gstNumber = regGst.trim().toUpperCase();
      if (regAddress.trim()) payload.address = regAddress.trim();

      const response = await fetch(`${API_BASE_URL}/auth/corporate/register`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Registration failed.');
      setPendingCompany(result.data?.corporate?.companyName || regCompanyName.trim());
      setCorpStep('pending');
    } catch (reason) {
      setRegError(reason instanceof Error ? reason.message : 'Registration failed. Please try again.');
    } finally { setRegLoading(false); }
  };

  // ── Shared inline styles ─────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    boxSizing: 'border-box', width: '100%', padding: '10px 14px',
    border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
    fontSize: 13, background: '#F9FAFB', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 700,
    color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px',
  };

  return <div>
    <header className="navbar"><div className="container nav-container"><div className="nav-brand"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="logo-link"><span>URBAN </span><span className="logo-q">Communto</span></button><p className="tagline">Smart Commute. Better Everyday.</p></div><div className="nav-actions"><button className="btn-login" onClick={openAuth}><CircleUserRound size={20} />{isLoggedIn ? 'Go to Dashboard' : 'Login / Sign Up'}</button><button className="btn-menu" aria-label="Open menu"><span aria-hidden>☰</span></button></div></div></header>
    <main>
      <section className="hero"><div className="container hero-container"><div className="hero-content fade-in visible"><h1 className="hero-title">Smart Daily Commute <br />for <span className="text-green">Bangalore</span></h1><p className="hero-description">Affordable, reliable and safe office<br />commute with fixed routes, timings<br />and monthly passes.</p><button className="btn-primary cta-btn" onClick={openAuth}><Ticket size={24} />Book Your Commute Pass</button><div className="trust-indicators"><span className="trust-item"><Check size={20} fill="#1DB954" color="#fff" />Safe Rides</span><span className="dot">•</span><span className="trust-item">Verified Drivers</span><span className="dot">•</span><span className="trust-item">Fixed Pricing</span></div></div><div className="hero-illustration fade-in visible"><div className="image-placeholder hero-img-wrapper" style={{ minHeight: 315, background: '#E2E8F0' }}><img src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=85" alt="People waiting at a bus stop for their commute" className="hero-img" /></div></div></div></section>
      <section className="commute-options"><div className="container"><div className="section-header fade-in visible"><h2 className="section-title">Choose Your Commute Option</h2><p className="section-subtitle">Select the commute type that suits you best</p></div><div className="cards-container"><article className="commute-card card-green fade-in visible"><div className="card-header"><span className="icon-wrapper green-icon-wrapper"><Bus size={25} /></span><div className="card-titles"><h3>Stop-to-Stop Pass</h3><span>Bus Stop to Bus Stop</span></div></div><div className="card-illustration-box"><img src="https://images.unsplash.com/photo-1503917988258-f87a78e3c995?auto=format&fit=crop&w=900&q=85" alt="Shared commute bus route" className="card-img" /></div><ul className="feature-list">{stopFeatures.map((feature) => <li key={feature}><Check size={20} />{feature}</li>)}</ul><button className="btn-card btn-green" onClick={openAuth}>Choose Stop-to-Stop <ChevronRight size={20} /></button></article><article className="commute-card card-blue fade-in visible"><div className="card-header"><span className="icon-wrapper blue-icon-wrapper"><House size={25} /></span><div className="card-titles"><h3>Home-to-Office Pass</h3><span>Doorstep to Office</span></div></div><div className="card-illustration-box"><img src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=85" alt="Home to office commute" className="card-img" /></div><ul className="feature-list">{homeFeatures.map((feature) => <li key={feature}><Check size={20} />{feature}</li>)}</ul><button className="btn-card btn-blue" onClick={openAuth}>Choose Home-to-Office <ChevronRight size={20} /></button></article></div></div></section>
      <section className="features-section fade-in visible"><div className="container features-container">{highlights.map((highlight) => { const Icon = highlight.icon; return <article className="feature-box" key={highlight.title}><span className="feature-icon"><Icon size={32} /></span><h4>{highlight.title}</h4><p>{highlight.description}</p></article>; })}</div></section>
    </main>

    {/* ── Auth Modal ──────────────────────────────────────────────── */}
    <div className={`modal-overlay ${modalOpen ? 'show' : ''}`} onClick={(event) => { if (event.target === event.currentTarget) closeAuth(); }}>
      <div className="modal-container">
        <button className="modal-close" onClick={closeAuth} aria-label="Close modal"><X size={24} /></button>
        <div className="modal-header">
          <span className="modal-logo">TORQQ</span>
          <h2 className="modal-title">Welcome to TORQQ</h2>
          <p className="modal-subtitle">Smart Daily Commute</p>
        </div>

        {/* ── Portal tab switcher: Corporate first, then Individual ── */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 10, padding: 4, margin: '0 0 16px' }}>
          <button
            type="button"
            onClick={() => switchTab('corporate')}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s', background: portalTab === 'corporate' ? '#fff' : 'transparent', color: portalTab === 'corporate' ? '#0F172A' : '#64748B', boxShadow: portalTab === 'corporate' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}
          >
            <Building2 size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Corporate
          </button>
          <button
            type="button"
            onClick={() => switchTab('customer')}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s', background: portalTab === 'customer' ? '#fff' : 'transparent', color: portalTab === 'customer' ? '#0F172A' : '#64748B', boxShadow: portalTab === 'customer' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none' }}
          >
            <CircleUserRound size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Individual
          </button>
        </div>

        {/* ── Customer tab content ── */}
        {portalTab === 'customer' && (
          <>
            <div className="login-method-choice">
              <button type="button" className={`login-method-button ${loginMode === 'otp' ? 'is-active' : ''}`} onClick={() => { setLoginMode('otp'); setStep('phone'); }}>Continue with OTP</button>
              <button type="button" className={`login-method-button ${loginMode === 'password' ? 'is-active' : ''}`} onClick={() => { setLoginMode('password'); setStep('phone'); }}>Sign in with password</button>
            </div>
            {loginMode === 'otp' && step === 'phone' && <form className="modal-form" onSubmit={sendOtp}><div className="form-group"><label htmlFor="fullName">Full Name</label><input id="fullName" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" autoComplete="name" /></div><div className="form-group"><label htmlFor="mobileNumber">Mobile Number</label><div className="input-with-prefix"><span className="prefix">+91</span><input id="mobileNumber" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter 10-digit number" autoComplete="tel" /></div></div><button className="btn-primary modal-btn-full" disabled={loading}>{loading ? 'Sending…' : 'Continue'}</button></form>}
            {loginMode === 'otp' && step === 'otp' && <form className="modal-form" onSubmit={verifyOtp}><div className="otp-instruction"><p>Enter the 6-digit code sent to</p><strong>+91 {phone}</strong><button type="button" className="btn-text btn-change-number" onClick={() => setStep('phone')}>Change</button></div><div className="otp-inputs">{otp.map((digit, index) => <input key={index} className="otp-box" value={digit} onChange={(event) => updateOtp(index, event.target.value)} maxLength={1} inputMode="numeric" aria-label={`OTP digit ${index + 1}`} />)}</div><button className="btn-primary modal-btn-full" disabled={loading}>{loading ? 'Verifying…' : 'Verify & Proceed'}</button><div className="resend-container"><span className="resend-text">Didn&apos;t receive code?</span><button type="button" className="btn-text btn-resend" onClick={() => sendOtp({ preventDefault() {} } as React.FormEvent)}>Resend OTP</button></div><div className="login-method-switch"><span>Have a password?</span><button type="button" className="btn-text btn-switch-method" onClick={() => { setLoginMode('password'); setStep('phone'); }}>Sign in with password</button></div></form>}
            {loginMode === 'password' && <form className="modal-form" onSubmit={passwordLogin}><div className="form-group"><label htmlFor="passwordMobile">Mobile Number</label><div className="input-with-prefix"><span className="prefix">+91</span><input id="passwordMobile" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter 10-digit number" /></div></div><div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" /></div><button className="btn-primary modal-btn-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button><div className="login-method-switch"><span>Prefer a one-time password?</span><button type="button" className="btn-text btn-switch-method" onClick={() => { setLoginMode('otp'); setStep('phone'); }}>Continue with OTP</button></div></form>}
          </>
        )}

        {/* ── Corporate tab content ── */}
        {portalTab === 'corporate' && (
          <div style={{ padding: '0 2px' }}>
            {/* Corporate login */}
            {corpStep === 'login' && (
              <form onSubmit={corpLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Building2 size={16} color="#3B82F6" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Corporate Sign In</span>
                </div>

                {/* PENDING approval banner */}
                {corpLoginStatus === 'pending_approval' && (
                  <div role="alert" style={{ padding: '12px 14px', borderRadius: 10, background: '#FEF3C7', border: '1px solid #FCD34D', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12, color: '#92400E' }}>
                      <span style={{ fontSize: 15 }}>⏳</span> Application Pending Review
                    </div>
                    <p style={{ fontSize: 11, color: '#78350F', margin: 0, lineHeight: 1.6 }}>
                      Your corporate account is awaiting admin approval. You will be able to sign in once the TORQQ team reviews your application (typically 1–2 business days).
                    </p>
                  </div>
                )}

                {/* REJECTED banner */}
                {corpLoginStatus === 'rejected' && (
                  <div role="alert" style={{ padding: '12px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FCA5A5', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12, color: '#991B1B' }}>
                      <span style={{ fontSize: 15 }}>✗</span> Application Not Approved
                    </div>
                    <p style={{ fontSize: 11, color: '#7F1D1D', margin: 0, lineHeight: 1.6 }}>
                      Your corporate account application was not approved. Please contact{' '}
                      <a href="mailto:support@torqq.in" style={{ color: '#DC2626', fontWeight: 700 }}>TORQQ support</a>{' '}
                      for more information or to re-apply.
                    </p>
                  </div>
                )}

                {/* Generic error */}
                {corpLoginStatus === 'error' && corpError && (
                  <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 12, lineHeight: 1.5 }}>
                    {corpError}
                  </div>
                )}

                <div>
                  <label htmlFor="corpPhone" style={labelStyle}>Phone Number</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: '#64748B' }}>+91</span>
                    <input id="corpPhone" type="tel" required value={corpPhone} onChange={(e) => setCorpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" style={{ ...inputStyle, paddingLeft: 44 }} />
                  </div>
                </div>
                <div>
                  <label htmlFor="corpPass" style={labelStyle}>Password</label>
                  <input id="corpPass" type="password" required value={corpPassword} onChange={(e) => setCorpPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
                </div>
                <button type="submit" disabled={corpLoading} className="btn-primary modal-btn-full" style={{ marginTop: 4 }}>
                  {corpLoading ? 'Signing in…' : 'Sign in to Corporate Portal'}
                </button>
                <p style={{ textAlign: 'center', fontSize: 12, color: '#64748B', marginTop: 4 }}>
                  New company?{' '}
                  <button type="button" onClick={() => { setCorpStep('register'); setCorpLoginStatus('idle'); setCorpError(''); }} style={{ background: 'none', border: 'none', color: '#3B82F6', fontWeight: 700, cursor: 'pointer', fontSize: 12, padding: 0 }}>
                    Register your company
                  </button>
                </p>
              </form>
            )}

            {/* Corporate self-registration form */}
            {corpStep === 'register' && (
              <form onSubmit={corpRegister} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Building2 size={16} color="#10B981" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Register Your Company</span>
                </div>
                {regError && (
                  <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 12, lineHeight: 1.5 }}>
                    {regError}
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Company Name <span style={{ color: '#EF4444' }}>*</span></label>
                  <input type="text" required value={regCompanyName} onChange={(e) => setRegCompanyName(e.target.value)} placeholder="e.g. Acme Technologies Pvt Ltd" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Contact Person Name</label>
                    <input type="text" value={regContactName} onChange={(e) => setRegContactName(e.target.value)} placeholder="e.g. Priya Nair" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Designation</label>
                    <input type="text" value={regContactDesignation} onChange={(e) => setRegContactDesignation(e.target.value)} placeholder="e.g. HR Manager" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Billing Email</label>
                  <input type="email" value={regBillingEmail} onChange={(e) => setRegBillingEmail(e.target.value)} placeholder="billing@company.com" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>GST Number</label>
                    <input type="text" value={regGst} onChange={(e) => setRegGst(e.target.value)} placeholder="Optional" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Address</label>
                    <input type="text" value={regAddress} onChange={(e) => setRegAddress(e.target.value)} placeholder="Optional" style={inputStyle} />
                  </div>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '2px 0' }} />
                <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>Login credentials for the corporate portal:</p>
                <div>
                  <label style={labelStyle}>Mobile Number <span style={{ color: '#EF4444' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: '#64748B' }}>+91</span>
                    <input type="tel" required value={regPhone} onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" style={{ ...inputStyle, paddingLeft: 44 }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Password <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Min 6 characters" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Confirm Password <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="password" required value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)} placeholder="Repeat password" style={inputStyle} />
                  </div>
                </div>
                <button type="submit" disabled={regLoading} className="btn-primary modal-btn-full" style={{ marginTop: 4, background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                  {regLoading ? 'Submitting…' : 'Submit for Approval'}
                </button>
                <p style={{ textAlign: 'center', fontSize: 12, color: '#64748B' }}>
                  Already have an account?{' '}
                  <button type="button" onClick={() => { setCorpStep('login'); setRegError(''); }} style={{ background: 'none', border: 'none', color: '#3B82F6', fontWeight: 700, cursor: 'pointer', fontSize: 12, padding: 0 }}>
                    Sign in
                  </button>
                </p>
              </form>
            )}

            {/* Pending approval message */}
            {corpStep === 'pending' && (
              <div style={{ textAlign: 'center', padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 28 }}>⏳</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Application Submitted!</h3>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  <strong>{pendingCompany}</strong> has been registered successfully. Your account is now <strong>pending admin review</strong>. You will be able to sign in once the TORQQ team approves your application.
                </p>
                <div style={{ padding: '10px 16px', borderRadius: 10, background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: 12, color: '#166534', lineHeight: 1.5, width: '100%', textAlign: 'left' }}>
                  <strong>What happens next?</strong>
                  <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                    <li>Our team will review your application within 1–2 business days.</li>
                    <li>Once approved, sign in using the mobile number and password you registered with.</li>
                  </ul>
                </div>
                <button type="button" onClick={() => { setCorpStep('login'); setCorpPhone(regPhone); setCorpLoginStatus('idle'); }} className="btn-primary modal-btn-full" style={{ marginTop: 4 }}>
                  Back to Sign In
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>;
}
