'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '../../lib/hooks/useAdminAuth';
import { useToastStore } from '../../stores/toastStore';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAdminAuth();
  const showToast = useToastStore((s) => s.showToast);
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await login(formData.phone, formData.password);
      showToast("Welcome to TORQQ Admin Console.", "success");
      router.push('/dashboard');
    } catch (error: any) {
      showToast(error.message || "Invalid administrator credentials.", "error");
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
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
        width: '100%',
        maxWidth: '400px',
        background: 'rgba(15,23,42,0.4)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '20px',
        padding: '36px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <span style={{
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            color: '#FFFFFF',
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '24px',
            boxShadow: '0 8px 24px rgba(16,185,129,0.25)',
            marginBottom: '14px',
          }}>T</span>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
            TORQQ Fleet Manager
          </h2>
          <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Enter credentials to access console
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '18px' }}>
            <label htmlFor="phone" style={{ color: '#94A3B8', fontSize: '9px', fontWeight: 700, letterSpacing: '0.8px' }}>PHONE NUMBER</label>
            <input
              type="tel"
              id="phone"
              required
              placeholder="e.g. 9876543210"
              className="form-input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            />
          </div>
          
          <div className="form-group" style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <label htmlFor="password" style={{ color: '#94A3B8', fontSize: '9px', fontWeight: 700, letterSpacing: '0.8px' }}>PASSWORD</label>
              <Link href="/forgot-password" style={{ fontSize: '10px', fontWeight: 600, color: '#10B981', textDecoration: 'none' }}>
                Forgot?
              </Link>
            </div>
            <input
              type="password"
              id="password"
              required
              placeholder="••••••••"
              className="form-input"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary ripple-btn"
            style={{
              width: '100%',
              borderRadius: '10px',
              padding: '12px',
              fontWeight: 700,
              fontSize: '13px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              boxShadow: '0 4px 14px rgba(16,185,129,0.25)',
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Processing...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
