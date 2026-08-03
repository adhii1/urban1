'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverStore } from '@/stores/driverStore';
import { api, ApiError } from '@/lib/api/client';
import Link from 'next/link';
import { MapPin, Route, User, LogOut, List } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function DriverDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, driverName, logout, setUserInfo } = useDriverStore();
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      router.push('/driver/login');
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
            driverName: u.name,
            driverPhone: u.phone,
            driverId: u.id,
          });
        }
        setValidated(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push('/driver/login');
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090D16' }}>
        <p style={{ color: '#94A3B8', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/driver/login');
  };

  const navItems = [
    { href: '/driver/dashboard', icon: MapPin, label: 'Dashboard' },
    { href: '/driver/ride-queue', icon: List, label: 'Ride Queue' },
    { href: '/driver/current-trip', icon: Route, label: 'Current Trip' },
    { href: '/driver/my-trips', icon: MapPin, label: 'My Trips' },
    { href: '/driver/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#090D16', paddingBottom: '80px' }}>
      <header style={{
        background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(10px)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#16C15D' }}>TORQQ</span>
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>Driver</span>
          </div>
          <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>Hi, {driverName || 'Driver'}</p>
        </div>
        <button onClick={handleLogout} style={{
          padding: '8px 16px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.05)', color: '#EF4444', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700,
        }}>
          <LogOut size={14} /> Logout
        </button>
      </header>

      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
        {children}
      </main>

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(15,23,42,0.95)',
        borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-around',
        padding: '8px 0', zIndex: 50, backdropFilter: 'blur(10px)',
      }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              textDecoration: 'none', padding: '4px 12px',
              color: active ? '#16C15D' : '#94A3B8',
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
