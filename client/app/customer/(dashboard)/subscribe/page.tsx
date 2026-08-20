'use client';

import { useState } from 'react';
import { MapPin, Calendar, Clock, Check, Loader, ArrowRight, Bus, Briefcase } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useToast } from '@/stores/toastStore';
import Link from 'next/link';

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

type BookingStep = 'type' | 'location' | 'schedule' | 'confirm' | 'result';

export default function SubscribePage() {
  const { showToast } = useToast();
  const [step, setStep] = useState<BookingStep>('type');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Form state
  const [subscriptionType, setSubscriptionType] = useState<'WEEKDAYS' | 'HYBRID' | ''>('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [dropAddress, setDropAddress] = useState('');
  const [dropLat, setDropLat] = useState('');
  const [dropLng, setDropLng] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [pickupTime, setPickupTime] = useState('08:00');

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async () => {
    if (!subscriptionType) { showToast('Select a subscription type', 'error'); return; }
    if (!pickupLat || !pickupLng || !dropLat || !dropLng) { showToast('Enter pickup and drop coordinates', 'error'); return; }
    if (subscriptionType === 'HYBRID' && selectedDays.length === 0) { showToast('Select at least one day for Hybrid', 'error'); return; }

    setLoading(true);
    try {
      const body = {
        subscriptionType,
        pickupLocation: {
          address: pickupAddress || `${pickupLat}, ${pickupLng}`,
          coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)],
        },
        dropLocation: {
          address: dropAddress || `${dropLat}, ${dropLng}`,
          coordinates: [parseFloat(dropLng), parseFloat(dropLat)],
        },
        scheduleDays: subscriptionType === 'WEEKDAYS' ? [1, 2, 3, 4, 5] : selectedDays,
        pickupTime,
        startDate: new Date().toISOString(),
      };

      const response = await api.post<any>('/book', body);
      setResult(response);
      setStep('result');
      showToast('Subscription created!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Booking failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>Subscribe to Commute</h2>
      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>Choose your plan, set your pickup/drop, and we auto-assign the best driver in your area.</p>

      {/* Step 1: Choose Type */}
      {step === 'type' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Select Commute Type</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => { setSubscriptionType('WEEKDAYS'); setSelectedDays([1, 2, 3, 4, 5]); setStep('location'); }}
              className="glass-card"
              style={{ padding: '20px', textAlign: 'left', border: subscriptionType === 'WEEKDAYS' ? '2px solid #16C15D' : '1px solid #E2E8F0', cursor: 'pointer', background: '#fff' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Briefcase size={20} color="#16C15D" />
                <strong style={{ fontSize: '15px', color: '#0F172A' }}>Weekdays (Mon-Fri)</strong>
              </div>
              <p style={{ fontSize: '12px', color: '#64748B' }}>Daily commute Monday through Friday. Fixed schedule, auto-assigned driver.</p>
            </button>

            <button
              onClick={() => { setSubscriptionType('HYBRID'); setSelectedDays([]); setStep('location'); }}
              className="glass-card"
              style={{ padding: '20px', textAlign: 'left', border: subscriptionType === 'HYBRID' ? '2px solid #3B82F6' : '1px solid #E2E8F0', cursor: 'pointer', background: '#fff' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Calendar size={20} color="#3B82F6" />
                <strong style={{ fontSize: '15px', color: '#0F172A' }}>Hybrid (Pick Your Days)</strong>
              </div>
              <p style={{ fontSize: '12px', color: '#64748B' }}>Choose specific days per week (e.g. Mon, Wed, Fri). Flexible schedule.</p>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Location */}
      {step === 'location' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
            <MapPin size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Set Pickup & Drop Locations
          </h3>
          <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '16px' }}>Enter coordinates (latitude, longitude). The system matches you to the nearest area driver.</p>

          <div className="glass-card" style={{ padding: '16px', marginBottom: '12px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#16C15D', textTransform: 'uppercase' }}>Pickup Location</label>
            <input type="text" placeholder="Address (optional)" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', marginTop: '6px', marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" placeholder="Latitude" value={pickupLat} onChange={(e) => setPickupLat(e.target.value)} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px' }} />
              <input type="text" placeholder="Longitude" value={pickupLng} onChange={(e) => setPickupLng(e.target.value)} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px' }} />
            </div>
          </div>

          <div className="glass-card" style={{ padding: '16px', marginBottom: '16px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase' }}>Drop Location</label>
            <input type="text" placeholder="Address (optional)" value={dropAddress} onChange={(e) => setDropAddress(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', marginTop: '6px', marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" placeholder="Latitude" value={dropLat} onChange={(e) => setDropLat(e.target.value)} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px' }} />
              <input type="text" placeholder="Longitude" value={dropLng} onChange={(e) => setDropLng(e.target.value)} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px' }} />
            </div>
          </div>

          <button onClick={() => setStep('schedule')} className="btn-redesign-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
            Continue <ArrowRight size={16} />
          </button>
          <button onClick={() => setStep('type')} style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>Back</button>
        </div>
      )}

      {/* Step 3: Schedule */}
      {step === 'schedule' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
            <Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />
            {subscriptionType === 'WEEKDAYS' ? 'Confirm Schedule' : 'Select Your Days'}
          </h3>

          {subscriptionType === 'HYBRID' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: selectedDays.includes(day.value) ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                    background: selectedDays.includes(day.value) ? '#EFF6FF' : '#fff',
                    color: selectedDays.includes(day.value) ? '#2563EB' : '#64748B',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {selectedDays.includes(day.value) && <Check size={12} style={{ marginRight: '4px' }} />}
                  {day.label}
                </button>
              ))}
            </div>
          )}

          {subscriptionType === 'WEEKDAYS' && (
            <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
              <p style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>Monday through Friday</p>
              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>Your commute will run every weekday automatically.</p>
            </div>
          )}

          <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Pickup Time
            </label>
            <input
              type="time"
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', marginTop: '8px' }}
            />
          </div>

          <button onClick={() => setStep('confirm')} className="btn-redesign-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
            Review Booking <ArrowRight size={16} />
          </button>
          <button onClick={() => setStep('location')} style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>Back</button>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 'confirm' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Confirm Your Subscription</h3>

          <div className="glass-card" style={{ padding: '16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Type</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{subscriptionType}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Days</span>
              <span style={{ fontSize: '13px', color: '#0F172A' }}>{selectedDays.map((d) => DAYS[d].label).join(', ')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Pickup Time</span>
              <span style={{ fontSize: '13px', color: '#0F172A' }}>{pickupTime}</span>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#16C15D', textTransform: 'uppercase' }}>Pickup</span>
              <p style={{ fontSize: '12px', color: '#0F172A', marginTop: '2px' }}>{pickupAddress || `${pickupLat}, ${pickupLng}`}</p>
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase' }}>Drop</span>
              <p style={{ fontSize: '12px', color: '#0F172A', marginTop: '2px' }}>{dropAddress || `${dropLat}, ${dropLng}`}</p>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={loading} className="btn-redesign-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
            {loading ? <><Loader size={16} className="animate-spin" /> Creating...</> : <>Confirm & Subscribe <Check size={16} /></>}
          </button>
          <button onClick={() => setStep('schedule')} style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>Back</button>
        </div>
      )}

      {/* Step 5: Result */}
      {step === 'result' && result && (
        <div>
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center', marginBottom: '16px' }}>
            <Check size={48} color="#16C15D" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>Subscription Active</h3>

            {result.data?.assignment ? (
              <div style={{ textAlign: 'left', marginTop: '16px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#16C15D', textTransform: 'uppercase', marginBottom: '8px' }}>Assigned Driver</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#F0FDF4', borderRadius: '10px' }}>
                  <Bus size={20} color="#16C15D" />
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{result.data.assignment.driver.name}</p>
                    <p style={{ fontSize: '12px', color: '#64748B' }}>{result.data.assignment.driver.vehicleNumber} · {result.data.assignment.driver.vehicleModel}</p>
                    <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Area: {result.data.assignment.area} · {result.data.assignment.distanceKm} km away · Capacity: {result.data.assignment.driver.vehicleCapacity}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '12px' }}>No driver available yet. Admin will assign one shortly.</p>
            )}

            {result.data?.tripsGenerated?.length > 0 && (
              <div style={{ textAlign: 'left', marginTop: '16px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', marginBottom: '8px' }}>Upcoming Trips Generated</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {result.data.tripsGenerated.map((date: string) => (
                    <span key={date} style={{ padding: '4px 10px', background: '#EFF6FF', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#2563EB' }}>{date}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link href="/customer/dashboard" className="btn-redesign-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', textDecoration: 'none' }}>
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
