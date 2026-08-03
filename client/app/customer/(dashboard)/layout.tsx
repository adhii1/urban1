'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerStore } from '@/stores/customerStore';
import { api, ApiError } from '@/lib/api/client';
import { Home, MapPin, CreditCard, User, Lock, Car } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function CustomerDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, userName, hasCustomPassword, setUserInfo } = useCustomerStore();
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      router.push('/customer');
      return;
    }

    let cancelled = false;
    api
      .get<{ id: string; phone: string; role: string; name: string }>('/auth/me')
      .then((res) => {
        if (cancelled) return;
        const u = res.data;
        if (u) {
          setUserInfo({
            userName: u.name,
            mobileNumber: u.phone,
            userRole: u.role,
            userId: u.id,
          });
        }
        setValidated(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push('/customer');
        } else {
          console.error('Session validation failed:', err);
          setValidated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, router, setUserInfo]);

  if (!isLoggedIn) return null;
  if (!validated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <p style={{ color: '#64748B', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  const navItems = [
    { href: '/customer/dashboard', icon: Home, label: 'Home' },
    { href: '/customer/book-ride', icon: Car, label: 'Book' },
    { href: '/customer/my-trips', icon: MapPin, label: 'Trips' },
    { href: '/customer/subscription', icon: CreditCard, label: 'Pass' },
    { href: '/customer/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', paddingBottom: '80px' }}>
      <header style={{
        background: '#FFF', borderBottom: '1px solid #E5E7EB', padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#16C15D' }}>TORQQ</span>
          <p style={{ fontSize: '10px', color: '#64748B' }}>Hi, {userName || 'Rider'} 👋</p>
        </div>
        {!hasCustomPassword && (
          <Link href="/customer/set-password" style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
            background: '#FEF3C7', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
            color: '#92400E', textDecoration: 'none',
          }}>
            <Lock size={12} /> Set Password
          </Link>
        )}
      </header>

      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
        {children}
      </main>

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: '#FFF',
        borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-around',
        padding: '8px 0', zIndex: 50,
      }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href === '/customer/dashboard' && pathname === '/customer/dashboard');
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              textDecoration: 'none', padding: '4px 12px',
              color: active ? '#16C15D' : '#64748B',
            }}>
              <Icon size={20} />
              <span style={{ fontSize: '10px', fontWeight: active ? 700 : 500 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
