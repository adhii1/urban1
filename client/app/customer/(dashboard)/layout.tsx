'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, CircleUserRound, CreditCard, Home, MapPin, Plus, Settings, User } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useCustomerTripSync } from '@/lib/hooks/useCustomerTripSync';
import { useCustomerStore } from '@/stores/customerStore';

export default function CustomerDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, userName, logout, setUserInfo } = useCustomerStore();
  const [validated, setValidated] = useState(false);
  useCustomerTripSync();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/customer');
      return;
    }

    let cancelled = false;
    api.get<{ id: string; phone: string; role: string; name: string }>('/auth/me')
      .then((response) => {
        if (cancelled) return;
        const user = response.data;
        if (user.role.toLowerCase() !== 'customer') {
          logout();
          router.replace('/customer');
          return;
        }
        setUserInfo({ userName: user.name, mobileNumber: user.phone, userRole: user.role, userId: user.id });
        setValidated(true);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          logout();
          router.replace('/customer');
        } else setValidated(true);
      });

    return () => { cancelled = true; };
  }, [isLoggedIn, logout, router, setUserInfo]);

  const navItems = [
    { href: '/customer/dashboard', icon: Home, label: 'Home' },
    { href: '/customer/my-trips', icon: MapPin, label: 'My Trips' },
    { href: '/customer/book-ride', icon: Plus, label: 'Book', primary: true },
    { href: '/customer/subscription', icon: CreditCard, label: 'Passes' },
    { href: '/customer/settings', icon: Settings, label: 'Settings' },
  ];

  if (!isLoggedIn || !validated) {
    return <div className="dashboard-body" style={{ display: 'grid', minHeight: '100vh', placeItems: 'center' }}><p style={{ color: '#64748B', fontSize: '14px' }}>Loading your commute…</p></div>;
  }

  return (
    <div className="dashboard-body">
      <header className="dashboard-header">
        <div className="container dashboard-header-container">
          <div className="user-greeting">
            <Link href="/customer/profile" className="profile-pic" aria-label="Open profile"><CircleUserRound size={24} /></Link>
            <div><p className="greeting-text">Welcome Back,</p><h1 className="user-name">{userName || 'Rider'} <span aria-hidden>👋</span></h1></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/customer/notifications" className="btn-notification" aria-label="Open notifications"><Bell size={21} /><span className="notification-dot" /></Link>
            <Link href="/customer/profile" className="btn-notification" aria-label="Open profile"><User size={19} /></Link>
          </div>
        </div>
      </header>
      <main className="dashboard-main container">{children}</main>
      <nav className="bottom-nav" aria-label="Customer navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''} ${item.primary ? 'nav-item-primary' : ''}`}>
            {item.primary ? <span className="nav-fab"><Icon size={22} /></span> : <Icon size={21} />}
            <span>{item.label}</span>
          </Link>;
        })}
      </nav>
    </div>
  );
}
