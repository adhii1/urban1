'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { useAuthGuard } from '@/lib/hooks/useAuthGuard';
import { useProfile, useUpdateProfile } from '@/lib/hooks/useAdminQueries';
import { useToastStore } from '@/stores/toastStore';
import { useAdminStore } from '@/stores/adminStore';
import { useState, useEffect } from 'react';
import { User, Save, Camera, Lock } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function ProfilePage() {
  useAuthGuard();
  const showToast = useToastStore((s) => s.showToast);
  const { adminName, adminPhone, adminRole } = useAdminStore();
  const { data, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profile, setProfile] = useState<any>({
    name: adminName || '', phone: adminPhone || '', email: '', role: adminRole || 'ADMIN',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=60',
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (data?.success && data?.data) {
      setProfile((prev: any) => ({ ...prev, ...data.data }));
    }
  }, [data]);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      showToast('Please fill in both password fields', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to change password');
      showToast('Password changed successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile.mutateAsync(profile);
      showToast('Profile updated!', 'success');
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User /> Admin Profile
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Manage your administrator account settings</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1, background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-light)' }}>Loading profile...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
            <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: '16px' }}>
                <img src={profile.avatar} alt="Avatar"
                  style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border-color)' }} />
                <button style={{
                  position: 'absolute', bottom: '4px', right: '4px', background: 'var(--color-primary)',
                  color: '#FFF', border: 'none', borderRadius: '50%', width: '32px', height: '32px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  <Camera style={{ fontSize: '14px' }} />
                </button>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>{profile.name}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>{profile.role}</p>
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ padding: '10px', background: 'var(--bg-app)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-light)', textTransform: 'uppercase' }}>Phone</span>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{profile.phone || 'Not set'}</div>
                </div>
                <div style={{ padding: '10px', background: 'var(--bg-app)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-light)', textTransform: 'uppercase' }}>Email</span>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{profile.email || 'Not set'}</div>
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>Edit Profile Information</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label htmlFor="profile-fullname" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Full Name</label>
                    <input id="profile-fullname" className="form-input" value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })} style={{ marginTop: '4px' }} />
                  </div>
                  <div>
                    <label htmlFor="profile-phone" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Phone</label>
                    <input id="profile-phone" className="form-input" value={profile.phone} readOnly
                      style={{ marginTop: '4px', opacity: 0.6, cursor: 'not-allowed' }} />
                  </div>
                </div>
                <div>
                  <label htmlFor="profile-email" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Email Address</label>
                  <input id="profile-email" className="form-input" type="email" value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })} style={{ marginTop: '4px' }} />
                </div>
                <div>
                  <label htmlFor="profile-role" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Role</label>
                  <select id="profile-role" className="form-input" value={profile.role} disabled
                    style={{ marginTop: '4px', opacity: 0.6, cursor: 'not-allowed' }}>
                    <option value="ADMIN">Administrator</option>
                    <option value="SUPER_ADMIN">Super Administrator</option>
                    <option value="OPERATOR">Fleet Operator</option>
                  </select>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '8px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Lock size={14} /> Change Password
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label htmlFor="profile-curr-pass" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Current Password</label>
                      <input id="profile-curr-pass" className="form-input" type="password" placeholder="••••••••" value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label htmlFor="profile-new-pass" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>New Password</label>
                      <input id="profile-new-pass" className="form-input" type="password" placeholder="••••••••" value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)} style={{ marginTop: '4px' }} />
                    </div>
                  </div>
                  <button onClick={handleChangePassword} disabled={changingPassword}
                    style={{ marginTop: '12px', padding: '8px 16px', fontSize: '12px', borderRadius: '10px',
                      border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)',
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
                      opacity: changingPassword ? 0.7 : 1 }}>
                    <Lock size={12} /> {changingPassword ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
