'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { useAuthGuard } from '@/lib/hooks/useAuthGuard';
import { useSettings, useUpdateSettings } from '@/lib/hooks/useAdminQueries';
import { useToastStore } from '@/stores/toastStore';
import { useAdminStore } from '@/stores/adminStore';
import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Bell, Shield, Palette } from 'lucide-react';

export default function SettingsPage() {
  useAuthGuard();
  const showToast = useToastStore((s) => s.showToast);
  const theme = useAdminStore((s) => s.theme);
  const setTheme = useAdminStore((s) => s.setTheme);
  const { data, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>({
    platformName: 'TORQQ', maxSeatsPerCab: 6, autoMatchRadius: 5,
    sosAutoDispatch: true, maintenanceMode: false, otpExpiryMinutes: 5,
    commissionRate: 10, minFare: 50,
  });

  useEffect(() => {
    if (data?.success && data?.data) {
      setSettings((prev: any) => ({ ...prev, ...data.data }));
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync(settings);
      showToast('Settings saved successfully!', 'success');
    } catch (err: any) { showToast(err.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SettingsIcon /> Settings
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Platform configuration and preferences</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1, background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-light)' }}>Loading settings...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SettingsIcon style={{ fontSize: '16px' }} /> General
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label htmlFor="settings-platform-name" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Platform Name</label>
                  <input id="settings-platform-name" className="form-input" value={settings.platformName}
                    onChange={(e) => setSettings({ ...settings, platformName: e.target.value })} style={{ marginTop: '4px' }} />
                </div>
                <div>
                  <label htmlFor="settings-seats-cab" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Max Seats Per Cab</label>
                  <input id="settings-seats-cab" className="form-input" type="number" value={settings.maxSeatsPerCab}
                    onChange={(e) => setSettings({ ...settings, maxSeatsPerCab: parseInt(e.target.value) })} style={{ marginTop: '4px' }} />
                </div>
                <div>
                  <label htmlFor="settings-match-radius" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Auto-Match Radius (km)</label>
                  <input id="settings-match-radius" className="form-input" type="number" value={settings.autoMatchRadius}
                    onChange={(e) => setSettings({ ...settings, autoMatchRadius: parseFloat(e.target.value) })} style={{ marginTop: '4px' }} />
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield style={{ fontSize: '16px' }} /> Finance
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label htmlFor="settings-commission" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Commission Rate (%)</label>
                  <input id="settings-commission" className="form-input" type="number" value={settings.commissionRate}
                    onChange={(e) => setSettings({ ...settings, commissionRate: parseFloat(e.target.value) })} style={{ marginTop: '4px' }} />
                </div>
                <div>
                  <label htmlFor="settings-min-fare" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Minimum Fare (₹)</label>
                  <input id="settings-min-fare" className="form-input" type="number" value={settings.minFare}
                    onChange={(e) => setSettings({ ...settings, minFare: parseFloat(e.target.value) })} style={{ marginTop: '4px' }} />
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell style={{ fontSize: '16px' }} /> Safety & Notifications
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>SOS Auto-Dispatch</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>Automatically alert authorities on SOS trigger</div>
                  </div>
                  <label htmlFor="settings-sos-dispatch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
                    <span className="sr-only">Toggle SOS Auto-Dispatch</span>
                    <input id="settings-sos-dispatch" type="checkbox" checked={settings.sosAutoDispatch}
                      onChange={(e) => setSettings({ ...settings, sosAutoDispatch: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: settings.sosAutoDispatch ? 'var(--color-primary)' : 'var(--border-color)',
                      borderRadius: '24px', transition: '0.3s',
                    }}>
                      <span style={{
                        position: 'absolute', height: '18px', width: '18px', left: settings.sosAutoDispatch ? '26px' : '3px', bottom: '3px',
                        backgroundColor: 'white', borderRadius: '50%', transition: '0.3s',
                      }} />
                    </span>
                  </label>
                </div>
                <div>
                  <label htmlFor="settings-otp-expiry" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>OTP Expiry (minutes)</label>
                  <input id="settings-otp-expiry" className="form-input" type="number" value={settings.otpExpiryMinutes}
                    onChange={(e) => setSettings({ ...settings, otpExpiryMinutes: parseInt(e.target.value) })} style={{ marginTop: '4px' }} />
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Palette style={{ fontSize: '16px' }} /> Appearance
              </h3>
              <div>
                <label id="settings-theme-label" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Theme</label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }} role="radiogroup" aria-labelledby="settings-theme-label">
                  {(['light', 'dark'] as const).map((t) => (
                    <button key={t} onClick={() => setTheme(t)}
                      role="radio"
                      aria-checked={theme === t}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${theme === t ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        background: t === 'dark' ? '#0F172A' : '#FFFFFF', cursor: 'pointer',
                        color: t === 'dark' ? '#FFF' : '#000', fontWeight: 600, fontSize: '12px', textTransform: 'capitalize',
                      }}>
                      {t === 'dark' ? '🌙' : '☀️'} {t}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>Maintenance Mode</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>Disable customer bookings temporarily</div>
                </div>
                <label htmlFor="settings-maint-mode" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
                  <span className="sr-only">Toggle Maintenance Mode</span>
                  <input id="settings-maint-mode" type="checkbox" checked={settings.maintenanceMode}
                    onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: settings.maintenanceMode ? '#EF4444' : 'var(--border-color)',
                    borderRadius: '24px', transition: '0.3s',
                  }}>
                    <span style={{
                      position: 'absolute', height: '18px', width: '18px', left: settings.maintenanceMode ? '26px' : '3px', bottom: '3px',
                      backgroundColor: 'white', borderRadius: '50%', transition: '0.3s',
                    }} />
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
