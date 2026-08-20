'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Car, ChartNoAxesCombined, CircleUserRound, FileText, Headphones, LayoutDashboard, List, LogOut, MapPinned, Menu, Route, Settings, UserRound, Users, Wallet } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useDriverStore } from '@/stores/driverStore';

const navigation = [
  { href: '/driver/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/driver/my-trips', label: 'My Trips', icon: Route },
  { href: '/driver/ride-queue', label: 'Ride Queue', icon: List },
  { href: '/driver/routes', label: 'Routes', icon: MapPinned },
  { href: '/driver/earnings', label: 'Earnings', icon: Wallet },
  { href: '/driver/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/driver/notifications', label: 'Notifications', icon: Bell },
  { href: '/driver/documents', label: 'Documents', icon: FileText },
  { href: '/driver/vehicle', label: 'Vehicle info', icon: Car },
  { href: '/driver/support', label: 'Support', icon: Headphones },
  { href: '/driver/settings', label: 'Settings', icon: Settings },
];

export default function DriverDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, driverName, driverPhone, logout, setUserInfo } = useDriverStore();
  const [validated, setValidated] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [updatingDuty, setUpdatingDuty] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/driver');
      return;
    }
    let cancelled = false;
    api.get<{ id: string; phone: string; role: string; name: string }>('/auth/me')
      .then((response) => {
        if (cancelled) return;
        const user = response.data;
        if (user.role.toLowerCase() !== 'driver') {
          logout();
          router.replace('/driver');
          return;
        }
        setUserInfo({ driverName: user.name, driverPhone: user.phone, driverId: user.id });
        setValidated(true);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          logout();
          router.replace('/driver');
        } else setValidated(true);
      });
    return () => { cancelled = true; };
  }, [isLoggedIn, logout, router, setUserInfo]);

  const handleLogout = () => { logout(); router.replace('/driver'); };
  const changeDuty = async () => {
    const next = !isOnline;
    setUpdatingDuty(true);
    try {
      await api.put('/driver/duty', { dutyStatus: next ? 'ONLINE' : 'OFFLINE', available: next });
      setIsOnline(next);
    } finally { setUpdatingDuty(false); }
  };

  if (!isLoggedIn || !validated) return <div className="driver-app" style={{ display: 'grid', minHeight: '100vh', placeItems: 'center' }}>Loading your driver workspace…</div>;

  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  return <div className="driver-app"><div className="driver-shell">
    <aside className="driver-sidebar">
      <div className="driver-brand"><span className="driver-brand-mark">T</span><div><h1>TORQQ</h1><p>DRIVER PANEL</p></div></div>
      <Link href="/driver/profile" className="driver-profile-widget"><span className="driver-avatar">{(driverName || 'D').slice(0, 1).toUpperCase()}</span><div><h2>{driverName || 'Driver'}</h2><p><span style={{ color: '#F59E0B' }}>★</span> 4.85 · {driverPhone || 'Vehicle pending'}</p></div></Link>
      <nav className="driver-menu" aria-label="Driver workspace navigation">{navigation.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} className={active ? 'driver-active' : ''}><Icon size={18} /><span>{item.label}</span></Link>; })}</nav>
      <div className="driver-side-summary"><span>Today&apos;s revenue</span><strong>Live earnings</strong><p style={{ fontSize: '11px', color: 'var(--driver-muted)' }}>See Earnings for current trip payouts.</p></div>
      <button className="driver-danger-button" style={{ width: '100%' }} onClick={handleLogout}><LogOut size={16} /><span>Go Offline</span></button>
    </aside>
    <header className="driver-topbar"><div className="driver-greeting"><span>Good day</span><h1>Welcome Back, {driverName || 'Driver'}</h1></div><input className="driver-search" aria-label="Search trips and routes" placeholder="Search trips, routes…" /><div className="driver-top-actions"><div className="driver-clock"><div>{date}</div><div style={{ fontSize: '11px', fontWeight: 500 }}>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></div><button className="driver-danger-button" onClick={() => router.push('/driver/support')}>SOS</button><label className="driver-duty"><span>{isOnline ? 'Online' : 'Offline'}</span><input type="checkbox" checked={isOnline} disabled={updatingDuty} onChange={changeDuty} /></label><Link href="/driver/notifications" className="driver-icon-button" aria-label="Notifications"><Bell size={18} /></Link><Link href="/driver/profile" className="driver-icon-button" aria-label="Profile"><CircleUserRound size={19} /></Link></div></header>
    <main className="driver-main"><div className="driver-page">{children}</div></main>
  </div></div>;
}
