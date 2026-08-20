'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

/**
 * Per PDF section 3: "The driver should not have a public signup. Admin creates the driver."
 * This page informs drivers they need to contact their admin.
 */
export default function DriverRegisterPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0F172A', padding: '20px' }}>
      <div style={{ maxWidth: '400px', textAlign: 'center' }}>
        <ShieldAlert size={48} color="#F59E0B" style={{ margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>Driver Registration is Admin-Only</h1>
        <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.6, marginBottom: '24px' }}>
          Drivers are registered by the fleet administrator. If you have been assigned credentials, use them to sign in below.
        </p>
        <Link
          href="/driver/login"
          style={{ display: 'inline-block', padding: '14px 28px', background: '#16C15D', color: '#fff', borderRadius: '12px', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}
        >
          Sign In with Your Credentials
        </Link>
        <p style={{ marginTop: '16px', fontSize: '12px', color: '#64748B' }}>
          Contact your administrator to get your login details.
        </p>
      </div>
    </div>
  );
}
