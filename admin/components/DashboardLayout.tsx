'use client';

import { useAdminStore } from '../stores/adminStore';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/adminApi';
import {
  LayoutDashboard, MapPin, Users, UserCheck, Route, CreditCard,
  PieChart, Settings, User, LogOut, Menu, Bell, Search, Sun, Moon, LayoutGrid,
  Radio, Bus
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { adminUserId, adminName, adminRole, theme, setTheme, setAuth, logout } = useAdminStore();
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        }
      } catch {
        if (cancelled) return;
        logout();
        router.replace('/login');
      }
    }

    if (adminUserId) {
      validateSession();
    }

    return () => {
      cancelled = true;
    };
  }, [adminUserId, router, setAuth, logout]);

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme, mounted]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const menuItems = [
    { category: 'Operations', items: [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
      { icon: Radio, label: 'Live Rides', href: '/rides' },
      { icon: Bus, label: 'Shuttles', href: '/shuttles' },
      { icon: MapPin, label: 'Trips', href: '/trips' },
      { icon: Users, label: 'Drivers', href: '/drivers' },
      { icon: UserCheck, label: 'Customers', href: '/customers' },
      { icon: Route, label: 'Routes', href: '/routes' },
      { icon: CreditCard, label: 'Subscriptions', href: '/subscriptions' },
      { href: '/plans', icon: LayoutGrid, label: 'Plans' },
    ]},
    { category: 'System', items: [
      { icon: PieChart, label: 'Analytics', href: '/analytics' },
      { icon: Settings, label: 'Settings', href: '/settings' },
      { icon: User, label: 'Admin Profile', href: '/profile' },
    ]},
  ];

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* ignore */ }
    useAdminStore.getState().logout();
    router.push('/login');
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  if (!adminUserId && pathname !== '/login') {
    return null;
  }

  return (
    <div className="app-wrapper">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside 
        className={`sidebar ${sidebarOpen ? 'active-sidebar' : ''}`} 
        onClick={(e) => e.stopPropagation()}
        role="complementary"
        aria-label="Sidebar Navigation"
        style={{
          borderRight: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', padding: '4px 8px' }}>
          <span style={{
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            color: '#FFFFFF',
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '20px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
          }} aria-hidden="true">T</span>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1, letterSpacing: '-0.5px' }}>TORQQ</h1>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Fleet Console</span>
          </div>
        </div>

        <nav aria-label="Main Navigation Menu" style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1 }}>
          {menuItems.map((section, idx) => (
            <div key={idx} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px', paddingLeft: '14px' }}>
                {section.category}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`sidebar-item ${active ? 'active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        color: active ? '#FFFFFF' : 'var(--text-light)',
                        backgroundColor: active ? 'var(--color-primary)' : 'transparent',
                        boxShadow: active ? '0 4px 12px rgba(16, 185, 129, 0.2)' : 'none',
                        transition: 'var(--transition-smooth)',
                      }}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              width: '100%',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#EF4444',
              marginTop: 'auto',
              transition: 'var(--transition-smooth)',
            }}
            className="sidebar-logout-btn"
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        {/* Navbar */}
        <header className="navbar" role="banner" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              id="toggleSidebarDrawerBtn"
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ display: 'none' }}
              aria-label="Toggle Navigation menu"
              aria-expanded={sidebarOpen}
            >
              <Menu aria-hidden="true" />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-light)', letterSpacing: '0.3px' }} aria-label="Current Date">{currentDate}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginTop: '1px' }} aria-label="Current Time">{currentTime}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative' }} className="nav-search-bar">
              <label htmlFor="navbar-global-search" className="sr-only">Search everything</label>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                id="navbar-global-search"
                type="text"
                placeholder="Search drivers, routes..."
                className="form-input"
                style={{
                  paddingLeft: '34px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  width: '240px',
                  fontSize: '12px',
                }}
              />
            </div>

            <button 
              onClick={toggleTheme} 
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              style={{ 
                background: 'var(--bg-hover)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                cursor: 'pointer', 
                color: 'var(--text-main)', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'var(--transition-smooth)',
              }}
              className="theme-toggle-btn"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button 
              aria-label="View notifications"
              style={{ 
                position: 'relative', 
                cursor: 'pointer', 
                background: 'var(--bg-hover)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'var(--transition-smooth)',
              }}
            >
              <Bell size={15} style={{ color: 'var(--text-main)' }} aria-hidden="true" />
              <span style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '6px',
                height: '6px',
                backgroundColor: '#EF4444',
                borderRadius: '50%',
              }} />
            </button>

            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: '10px',
              border: '1px solid transparent',
              transition: 'var(--transition-smooth)',
            }} 
            className="user-profile-menu-btn"
            role="status" 
            aria-label="Admin Profile Summary"
            >
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=60"
                alt=""
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1px solid var(--border-color)',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2 }}>
                  {adminName || 'Admin'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>
                  {adminRole || 'Admin'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
          {children}
        </main>

        {/* Footer */}
        <footer role="contentinfo" style={{
          marginTop: '48px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '11px',
          color: 'var(--text-light)',
        }}>
          <div>&copy; 2026 TORQQ Commute Platform. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }} role="status">
              <span style={{ display: 'inline-block', width: '6px', height: '6px', backgroundColor: 'var(--color-primary)', borderRadius: '50%' }} className="pulse-dot"></span>
              Console Systems Online
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
