'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LayoutDashboard, LogOut, Users, User } from 'lucide-react';
import { api, ApiError, endSession } from '@/lib/api/client';
import { useCorporateStore } from '@/stores/corporateStore';

const navigation = [
  { href: '/corporate/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/corporate/employees', label: 'Employees', icon: Users },
  { href: '/corporate/profile', label: 'Company Profile', icon: User },
];

export default function CorporateDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, companyName, corporatePhone, logout, setUserInfo } = useCorporateStore();
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/corporate');
      return;
    }
    let cancelled = false;
    api.get<{ id: string; phone: string; role: string; name: string }>('/auth/me')
      .then((response) => {
        if (cancelled) return;
        const user = response.data;
        if (user.role.toLowerCase() !== 'corporate') {
          logout();
          router.replace('/corporate');
          return;
        }
        setUserInfo({ companyName: user.name, corporatePhone: user.phone, corporateId: user.id });
        setValidated(true);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          logout();
          router.replace('/corporate');
        } else setValidated(true);
      });
    return () => { cancelled = true; };
  }, [isLoggedIn, logout, router, setUserInfo]);

  const handleLogout = async () => { await endSession(); logout(); router.replace('/corporate'); };

  if (!isLoggedIn || !validated) {
    return <div style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', background: '#F7F9FC' }}>Loading your corporate workspace…</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F7F9FC' }}>
      <aside style={{ width: 260, position: 'fixed', inset: '0 auto 0 0', display: 'flex', flexDirection: 'column', padding: '24px 16px', background: '#fff', borderRight: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 8px 32px' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', color: '#fff' }}><Building2 size={18} /></span>
          <div><h1 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>TORQQ</h1><p style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Corporate Portal</p></div>
        </div>
        <div style={{ padding: '12px 14px', marginBottom: 20, borderRadius: 12, background: '#F8FAFC' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{companyName || 'Company'}</p>
          <p style={{ fontSize: 11, color: '#64748B' }}>{corporatePhone || ''}</p>
        </div>
        <nav aria-label="Corporate workspace navigation" style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1 }}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return <Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none', color: active ? '#fff' : '#64748B', background: active ? '#2563EB' : 'transparent' }}>
              <Icon size={16} /><span>{item.label}</span>
            </Link>;
          })}
        </nav>
        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>
          <LogOut size={16} /><span>Logout</span>
        </button>
      </aside>
      <main style={{ marginLeft: 260, flex: 1, padding: '32px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
      </main>
    </div>
  );
}
