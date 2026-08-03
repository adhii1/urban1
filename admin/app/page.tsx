'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminStore } from '@/stores/adminStore';
import { apiFetch } from '@/lib/api/adminApi';

export default function HomePage() {
  const router = useRouter();
  const adminUserId = useAdminStore((s) => s.adminUserId);
  const setAuth = useAdminStore((s) => s.setAuth);
  const logout = useAdminStore((s) => s.logout);

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      try {
        const res = await apiFetch<{ data?: { user?: { name: string; phone: string; role: string; id?: string; _id?: string } } }>('/auth/me');
        if (cancelled) return;
        const user = res?.data?.user;
        if (user) {
          setAuth({
            name: user.name,
            phone: user.phone,
            role: user.role,
            userId: user.id || user._id || '',
          });
          router.replace('/dashboard');
        } else {
          logout();
          router.replace('/login');
        }
      } catch {
        if (cancelled) return;
        logout();
        router.replace('/login');
      }
    }

    if (adminUserId) {
      validateSession();
    } else {
      router.replace('/login');
    }

    return () => {
      cancelled = true;
    };
  }, [adminUserId, router, setAuth, logout]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'radial-gradient(circle at 50% 50%, #0c111e 0%, #070a12 100%)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid rgba(16,185,129,0.15)', borderLeftColor: '#10B981', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
        <div style={{ fontWeight: 600, fontSize: '11px', color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Loading TORQQ Console...</div>
      </div>
    </div>
  );
}
