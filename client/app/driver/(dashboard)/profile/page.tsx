'use client';

import { useDriverProfile } from '@/lib/hooks/useDriverQueries';
import { useDriverStore } from '@/stores/driverStore';
import { User, Phone, Car, Route, Hash, LogOut, IdCard, Wallet, Landmark, CreditCard } from 'lucide-react';

export default function DriverProfilePage() {
  const logout = useDriverStore((s) => s.logout);
  const { data: p, isLoading, error } = useDriverProfile();

  const handleLogout = () => {
    logout();
    window.location.href = '/driver/login';
  };

  if (isLoading) {
    return (
      <div style={{ padding: '16px', color: '#94A3B8', textAlign: 'center' }}>Loading profile...</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '16px', color: '#EF4444', textAlign: 'center' }}>Failed to load profile</div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF', marginBottom: '16px' }}>Profile</h2>

      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '24px', textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px',
      }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', background: '#16C15D',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          fontSize: '28px', fontWeight: 800, color: '#FFF',
        }}>
          {(p?.name || 'D')[0].toUpperCase()}
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>{p?.name || 'Driver'}</h3>
        {p?.driverCode && (
          <div style={{ display: 'inline-block', marginTop: '6px', padding: '3px 12px', background: '#16C15D20', borderRadius: '10px', fontSize: '12px', fontWeight: 800, fontFamily: 'monospace', color: '#16C15D' }}>
            {p.driverCode}
          </div>
        )}
        <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>+91 {p?.phone || '---'}</p>
        {p?.route?.name && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '10px',
            padding: '4px 12px', background: '#16C15D20', borderRadius: '12px',
            fontSize: '11px', color: '#16C15D', fontWeight: 600,
          }}>
            <Route size={12} /> {p.route.name}
          </div>
        )}
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: '14px', overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px',
      }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <User size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Name</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{p?.name || '---'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Phone size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Phone</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>+91 {p?.phone || '---'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Car size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Vehicle</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{p?.vehicleModel || '---'} • {p?.vehicleNumber || '---'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Car size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Capacity</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{p?.vehicleCapacity || '---'} passengers</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <IdCard size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Driver ID</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF', fontFamily: 'monospace' }}>{p?.driverCode || '---'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Wallet size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>UPI ID (payouts)</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{p?.upiId || 'Not set — contact admin'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Hash size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>License</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{p?.licenseNumber || '---'}</div>
          </div>
        </div>
      </div>

      {/* Bank details for payouts */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: '14px', overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Landmark size={16} color="#16C15D" />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFF' }}>Payout / Bank Details</span>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <User size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Account Holder Name</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{p?.bankDetails?.accountHolderName || '---'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <CreditCard size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Account Number</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF', fontFamily: 'monospace' }}>{p?.bankDetails?.accountNumber || '---'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Landmark size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>IFSC Code</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF', fontFamily: 'monospace' }}>{p?.bankDetails?.ifsc || '---'}</div>
          </div>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Landmark size={18} color="#94A3B8" />
          <div>
            <div style={{ fontSize: '10px', color: '#94A3B8' }}>Bank Name</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{p?.bankDetails?.bankName || '---'}</div>
          </div>
        </div>
      </div>

      <button onClick={handleLogout} style={{
        width: '100%', padding: '14px', background: 'rgba(239,68,68,0.1)', color: '#EF4444',
        border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', fontWeight: 700,
        fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}>
        <LogOut size={16} /> Logout
      </button>
    </div>
  );
}
