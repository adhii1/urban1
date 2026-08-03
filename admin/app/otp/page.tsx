'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '../../lib/hooks/useAdminAuth';
import { useToastStore } from '../../stores/toastStore';

export default function OtpPage() {
  const router = useRouter();
  const { verifyOtp, isLoading } = useAdminAuth();
  const showToast = useToastStore((s) => s.showToast);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const phone = typeof window !== 'undefined' ? sessionStorage.getItem('admin_otp_phone') || '' : '';

  useEffect(() => {
    if (!phone) {
      router.push('/login');
    }
  }, [phone, router]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      showToast('Please enter the complete 6-digit code', 'error');
      return;
    }
    try {
      await verifyOtp(phone, otpValue);
      showToast('Access granted. Welcome to TORQQ Admin Console.', 'success');
      setTimeout(() => router.push('/dashboard'), 800);
    } catch (err: any) {
      showToast(err.message || 'Verification failed', 'error');
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
            boxShadow: '0 8px 24px rgba(16,185,129,0.25)', marginBottom: '14px',
          }}>T</span>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', letterSpacing: '-0.5px' }}>Security Verification</h2>
          <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px', lineHeight: 1.4 }}>
            Enter the 6-digit OTP sent to <strong style={{ color: '#FFF' }}>{phone}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="form-input"
                aria-label={`Digit ${i + 1} of 6 digit code`}
                style={{
                  width: '44px', height: '52px', textAlign: 'center',
                  fontSize: '20px', fontWeight: 800, color: '#FFF',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '10px',
                }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{
              width: '100%', borderRadius: '10px', padding: '12px',
              fontWeight: 700, fontSize: '13px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              boxShadow: '0 4px 14px rgba(16,185,129,0.25)',
              opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Verifying...' : 'Verify & Enter Console'}
          </button>
        </form>
      </div>
    </div>
  );
}
