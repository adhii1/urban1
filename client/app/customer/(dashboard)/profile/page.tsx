'use client';

import { User, Phone, LogOut, Loader, AlertCircle, Map, Pencil } from 'lucide-react';
import { useCustomerStore } from '@/stores/customerStore';
import { useCustomerProfile } from '@/lib/hooks/useCustomerQueries';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import LocationSelector from './LocationSelector';

export default function CustomerProfilePage() {
  const { userName, mobileNumber, logout } = useCustomerStore();
  const { data: profile, isLoading, isError, error, refetch } = useCustomerProfile();
  
  const [showLocationSelector, setShowLocationSelector] = useState<'pickup' | 'drop' | 'home' | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState<string | null>(null);

  const handleLogout = () => {
    logout();
    window.location.href = '/customer';
  };

  const LocationButton = ({ type, location, icon }: {
    type: 'pickup' | 'drop' | 'home';
    location?: { address?: string; coordinates?: number[] };
    icon: string;
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
      <div style={
        {
          width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: '600', color: 'white',
          background: type === 'pickup' ? '#16C15D' : type === 'drop' ? '#EF4444' : '#3B82F6'
        }
      }>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>{type} Location</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{location?.address || 'Not set'}</div>
      </div>
      <button
        onClick={() => setShowLocationSelector(type)}
        disabled={!!updatingLocation}
        style={{
          padding: '6px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px',
          cursor: 'pointer', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px'
        }}
      >
        <Pencil size={14} /> Edit
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Loader size={24} color="#16C15D" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: '#FFF', borderRadius: '16px', padding: '24px', textAlign: 'center', marginBottom: '20px' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', background: '#16C15D',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          fontSize: '32px', fontWeight: 700, color: '#FFF',
        }}>
          {(userName || 'U')[0].toUpperCase()}
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>{userName || 'User'}</h2>
        <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>+91 {mobileNumber || '---'}</p>
      </div>

      <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>Account Information</h3>
        {isError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: '#EF4444', fontSize: '12px' }}>
            <AlertCircle size={14} /> {(error as any)?.message || 'Failed to load profile'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <LocationButton type="home" location={profile?.homeLocation} icon="H" />
            <LocationButton type="pickup" location={profile?.pickupLocation} icon="P" />
            <LocationButton type="drop" location={profile?.dropLocation} icon="D" />
          </div>
        )}
      </div>

      <div style={{ background: '#FFF', borderRadius: '14px', overflow: 'hidden' }}>
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
          width: '100%', border: 'none', background: 'none', cursor: 'pointer',
        }}>
          <LogOut size={18} color="#EF4444" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444' }}>Logout</span>
        </button>
      </div>

      {showLocationSelector && (
        <LocationSelector
          type={showLocationSelector}
          initialAddress={
            showLocationSelector === 'home' ? profile?.homeLocation?.address :
            showLocationSelector === 'pickup' ? profile?.pickupLocation?.address :
            showLocationSelector === 'drop' ? profile?.dropLocation?.address : undefined
          }
          initialCoordinates={
            showLocationSelector === 'home' ? profile?.homeLocation?.coordinates as number[] :
            showLocationSelector === 'pickup' ? profile?.pickupLocation?.coordinates as number[] :
            showLocationSelector === 'drop' ? profile?.dropLocation?.coordinates as number[] : undefined
          }
          onLocationSelect={(location) => {
            setUpdatingLocation(showLocationSelector);
            const locationKey = showLocationSelector === 'pickup' ? 'pickupLocation' : showLocationSelector === 'drop' ? 'dropLocation' : 'homeLocation';
            api.put('/customer/profile', {
              [locationKey]: {
                address: location.address,
                coordinates: location.coordinates,
              },
            })
              .then(() => {
                refetch();
                setShowLocationSelector(null);
              })
              .catch(error => {
                console.error('Error updating location:', error);
              })
              .finally(() => {
                setUpdatingLocation(null);
              });
          }}
          onCancel={() => setShowLocationSelector(null)}
        />
      )}
    </div>
  );
}
