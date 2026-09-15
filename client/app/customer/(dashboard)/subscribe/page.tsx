'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Calendar, Clock, Check, Loader, ArrowRight, ArrowLeft, Bus, Briefcase, Users, Wallet, CreditCard, LocateFixed, ShieldAlert, AlertTriangle, X, Navigation, Car } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useToast } from '@/stores/toastStore';
import Link from 'next/link';
import LocationSelector from '../profile/LocationSelector';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

type BookingModel = 'HYBRID' | 'WEEKDAYS' | 'SHUTTLE';
type BookingStep = 'model' | 'location' | 'schedule' | 'confirm' | 'result';

const MODEL_INFO: Record<BookingModel, { title: string; subtitle: string; icon: any; color: string; description: string; priceLabel: string }> = {
  WEEKDAYS: {
    title: 'Weekday (5-Day)',
    subtitle: 'Mon–Fri daily commute',
    icon: Briefcase,
    color: '#16C15D',
    description: 'Full weekday commute Monday through Friday. Shared ride, auto-assigned driver. Best value for daily office commute.',
    priceLabel: '₹1,999/month',
  },
  HYBRID: {
    title: 'Hybrid (3-Day)',
    subtitle: 'Pick any 3 days per week',
    icon: Calendar,
    color: '#3B82F6',
    description: 'Choose your commute days (e.g. Mon, Wed, Fri). Shared ride with other passengers in your area. Auto-assigned driver.',
    priceLabel: '₹1,799/month',
  },
  SHUTTLE: {
    title: 'Shuttle',
    subtitle: 'Fixed route, bus-stop style',
    icon: Bus,
    color: '#8B5CF6',
    description: 'Fixed route with managed pickup/drop stops. Multiple passengers board at designated stops. Most affordable option.',
    priceLabel: '₹1,499/month',
  },
};

export default function SubscribePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<BookingStep>('model');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Emergency dialog state
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('Medical / Urgent Health Contingency');

  // Form state
  const [model, setModel] = useState<BookingModel | ''>('');
  // Location as { address, coordinates: [lng, lat] }
  const [pickup, setPickup] = useState<{ address: string; coordinates: [number, number] } | null>(null);
  const [drop, setDrop] = useState<{ address: string; coordinates: [number, number] } | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [pickupTime, setPickupTime] = useState('08:00');
  // Which location the picker modal is editing ('pickup' | 'drop' | null)
  const [locationPicker, setLocationPicker] = useState<'pickup' | 'drop' | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'razorpay'>('wallet');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [plans, setPlans] = useState<any[]>([]);

  // Load plan catalog (for real prices), wallet balance, and Razorpay checkout.
  useEffect(() => {
    api.get<any[]>('/customer/plans').then((r) => setPlans(r.data || [])).catch(() => {});
    api.get<any>('/wallet').then((r) => setWalletBalance(r.data?.balance ?? 0)).catch(() => {});
    if (!document.getElementById('razorpay-script')) {
      const script = document.createElement('script');
      script.id = 'razorpay-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // subscriptionType -> Plan.tier, to look up the live price from the catalog.
  const TIER_FOR_MODEL: Record<BookingModel, string> = { WEEKDAYS: 'Weekday', HYBRID: 'Hybrid', SHUTTLE: 'Standard' };
  const planForModel = model ? plans.find((p) => p.tier === TIER_FOR_MODEL[model]) : null;
  const planPrice: number | null = planForModel?.price ?? null;

  const toggleDay = (day: number) => {
    if (model === 'HYBRID' && (day === 0 || day === 6)) {
      showToast('Hybrid plans run on weekdays only', 'error');
      return;
    }
    if (model === 'HYBRID' && !selectedDays.includes(day) && selectedDays.length >= 3) {
      showToast('Hybrid plan allows max 3 days per week', 'error');
      return;
    }
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const selectModel = (m: BookingModel) => {
    setModel(m);
    if (m === 'WEEKDAYS') setSelectedDays([1, 2, 3, 4, 5]);
    else if (m === 'SHUTTLE') setSelectedDays([1, 2, 3, 4, 5]);
    else setSelectedDays([]);
    setStep('location');
  };

  const handleLocationSelect = (loc: { address: string; coordinates: [number, number] }) => {
    if (locationPicker === 'pickup') setPickup(loc);
    else if (locationPicker === 'drop') setDrop(loc);
    setLocationPicker(null);
  };

  const buildBody = (method: 'wallet' | 'razorpay') => ({
    subscriptionType: model,
    pickupLocation: {
      address: pickup?.address || '',
      coordinates: pickup?.coordinates || [0, 0],
    },
    dropLocation: {
      address: drop?.address || '',
      coordinates: drop?.coordinates || [0, 0],
    },
    scheduleDays: selectedDays,
    pickupTime,
    startDate: new Date().toISOString(),
    paymentMethod: method,
  });

  const finish = (response: any) => {
    setResult(response);
    setStep('result');
    showToast('Subscription active!', 'success');
  };

  const handleSubmit = async () => {
    if (!model) { showToast('Select a booking model', 'error'); return; }
    if (!pickup || !drop) { showToast('Set pickup and drop locations', 'error'); return; }
    if (model === 'HYBRID' && selectedDays.length !== 3) { showToast('Select exactly 3 weekdays for the Hybrid plan', 'error'); return; }

    setLoading(true);
    try {
      if (paymentMethod === 'wallet') {
        const response = await api.post<any>('/book', buildBody('wallet'));
        finish(response);
      } else {
        // Razorpay: create the order, complete checkout, then verify.
        const orderRes = await api.post<any>('/book', buildBody('razorpay'));
        const data = orderRes.data;
        const verifyAndFinish = async (payment: { orderId: string; paymentId: string; signature: string }) => {
          await api.post('/customer/subscriptions/verify-payment', {
            subscriptionId: data.subscriptionId,
            orderId: payment.orderId,
            paymentId: payment.paymentId,
            signature: payment.signature,
          });
          // Re-read the activated subscription (with driver assignment) for the result screen.
          const booking = await api.get<any>('/booking');
          finish({ data: { subscription: booking.data, assignment: booking.data?.assignedDriverId ? { driver: booking.data.assignedDriverId, area: booking.data.assignedAreaId?.name } : null } });
        };

        if (window.Razorpay && data.order?.orderId) {
          const rzp = new window.Razorpay({
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
            amount: data.order.amount,
            currency: data.order.currency || 'INR',
            name: 'TORQQ',
            description: `${model} subscription`,
            order_id: data.order.orderId,
            handler: (resp: any) => {
              verifyAndFinish({ orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
                .catch((e) => showToast(e.message || 'Payment verification failed', 'error'))
                .finally(() => setLoading(false));
            },
            theme: { color: '#16C15D' },
          });
          rzp.on('payment.failed', () => { showToast('Payment failed. Please try again.', 'error'); setLoading(false); });
          rzp.open();
          return; // handler/finally manages loading
        }

        // Mock mode (no Razorpay script / dev): verify with mock identifiers.
        await verifyAndFinish({ orderId: data.order.orderId, paymentId: `pay_mock_${Date.now()}`, signature: 'mock_signature' });
      }
    } catch (err: any) {
      showToast(err.message || 'Booking failed', 'error');
    } finally {
      if (paymentMethod === 'wallet') setLoading(false);
    }
  };

  const modelInfo = model ? MODEL_INFO[model] : null;

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>Book Your Commute</h2>
      <p style={{ fontSize: '13px', color: '#475569', marginBottom: '24px' }}>Choose a plan, set your route, and we auto-assign the best driver.</p>

      {/* Step 1: Choose Model */}
      {step === 'model' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Select Commute Model</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(Object.keys(MODEL_INFO) as BookingModel[]).map((key) => {
              const info = MODEL_INFO[key];
              const Icon = info.icon;
              return (
                <button
                  key={key}
                  onClick={() => selectModel(key)}
                  className="glass-card"
                  style={{ padding: '18px', textAlign: 'left', border: model === key ? `2px solid ${info.color}` : '1px solid #E2E8F0', cursor: 'pointer', background: '#fff', transition: 'all 0.2s ease' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${info.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={18} color={info.color} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '14px', color: '#0F172A' }}>{info.title}</strong>
                      <span style={{ float: 'right', fontSize: '12px', fontWeight: 700, color: info.color }}>{info.priceLabel}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748B', paddingLeft: '48px' }}>{info.description}</p>
                </button>
              );
            })}

            {/* Flexy Ride Option */}
            <button
              type="button"
              onClick={() => router.push('/customer/book-ride')}
              className="glass-card"
              style={{
                padding: '18px',
                textAlign: 'left',
                border: '1.5px solid #FDE68A',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 100%)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Navigation size={18} color="#D97706" />
                </span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '14px', color: '#92400E' }}>Flexy Ride</strong>
                    <span style={{ fontSize: '10px', fontWeight: 800, background: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      On-Demand
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#D97706' }}>Pay-per-ride</span>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#78350F', paddingLeft: '48px', margin: 0, opacity: 0.9 }}>
                Single-passenger on-demand ride (like Ola/Uber). Immediate pickup or advance scheduling — no monthly subscription needed.
              </p>
            </button>

            {/* Emergency Ride Option */}
            <button
              type="button"
              onClick={() => {
                setEmergencyAcknowledged(false);
                setShowEmergencyModal(true);
              }}
              className="glass-card"
              style={{
                padding: '18px',
                textAlign: 'left',
                border: '1.5px solid #FCA5A5',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldAlert size={18} color="#DC2626" />
                </span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '14px', color: '#991B1B' }}>Emergency Ride</strong>
                    <span style={{ fontSize: '10px', fontWeight: 800, background: '#FEE2E2', color: '#B91C1C', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      Urgent Only
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626' }}>Priority On-Demand</span>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#7F1D1D', paddingLeft: '48px', margin: 0, opacity: 0.9 }}>
                Immediate priority dispatch for critical contingencies & corporate emergencies. Follows on-demand Flexy logic with mandatory corporate protocol authorization.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Location with Map */}
      {step === 'location' && modelInfo && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${modelInfo.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <modelInfo.icon size={14} color={modelInfo.color} />
            </span>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{modelInfo.title} — Set Locations</h3>
          </div>

          <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '16px' }}>
            Search for a place, drop a pin on the map, or use your current location.
          </p>

          {/* Pickup picker */}
          <button
            onClick={() => setLocationPicker('pickup')}
            style={{ width: '100%', textAlign: 'left', padding: '14px', marginBottom: '12px', borderRadius: '12px', border: pickup ? '2px solid #16C15D' : '1px dashed #CBD5E1', background: pickup ? '#F0FDF4' : '#fff', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={16} color="#16C15D" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#16C15D', textTransform: 'uppercase' }}>Pickup Location</p>
                <p style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pickup ? pickup.address : 'Tap to set pickup'}
                </p>
              </div>
            </div>
          </button>

          {/* Drop picker */}
          <button
            onClick={() => setLocationPicker('drop')}
            style={{ width: '100%', textAlign: 'left', padding: '14px', marginBottom: '20px', borderRadius: '12px', border: drop ? '2px solid #3B82F6' : '1px dashed #CBD5E1', background: drop ? '#EFF6FF' : '#fff', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={16} color="#3B82F6" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase' }}>Drop Location</p>
                <p style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {drop ? drop.address : 'Tap to set drop'}
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => { if (!pickup || !drop) { showToast('Set both pickup and drop', 'error'); return; } setStep('schedule'); }}
            className="btn-redesign-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '14px', opacity: pickup && drop ? 1 : 0.6 }}
          >
            Continue <ArrowRight size={16} />
          </button>
          <button onClick={() => { setStep('model'); setModel(''); }} style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>
            <ArrowLeft size={12} style={{ display: 'inline', marginRight: '4px' }} /> Back to models
          </button>
        </div>
      )}

      {/* Step 3: Schedule */}
      {step === 'schedule' && modelInfo && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
            <Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />
            {model === 'HYBRID' ? 'Pick Your 3 Days' : 'Confirm Schedule'}
          </h3>

          {/* Day selection for HYBRID */}
          {model === 'HYBRID' && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px' }}>Select exactly 3 days per week for your commute:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {DAYS.filter((d) => d.value >= 1 && d.value <= 6).map((day) => (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(day.value)}
                    style={{
                      padding: '10px 16px', borderRadius: '10px',
                      border: selectedDays.includes(day.value) ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                      background: selectedDays.includes(day.value) ? '#EFF6FF' : '#fff',
                      color: selectedDays.includes(day.value) ? '#2563EB' : '#64748B',
                      fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    {selectedDays.includes(day.value) && <Check size={12} style={{ marginRight: '4px' }} />}
                    {day.label}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: '8px', fontSize: '11px', color: selectedDays.length === 3 ? '#16C15D' : '#F59E0B', fontWeight: 600 }}>
                {selectedDays.length}/3 days selected
              </p>
            </div>
          )}

          {/* Info for WEEKDAYS */}
          {model === 'WEEKDAYS' && (
            <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
              <p style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>Monday through Friday</p>
              <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>5 days/week. Auto-scheduled, auto-assigned driver in your area.</p>
            </div>
          )}

          {/* Info for SHUTTLE */}
          {model === 'SHUTTLE' && (
            <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Bus size={16} color="#8B5CF6" />
                <p style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>Shuttle — Fixed Route</p>
              </div>
              <p style={{ fontSize: '12px', color: '#64748B' }}>You'll be picked up at the nearest admin-defined stop. Multiple passengers share the vehicle. Most affordable.</p>
              <p style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>Schedule: Monday – Friday, managed stops.</p>
            </div>
          )}

          {/* Pickup time */}
          <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Daily Pickup Time
            </label>
            <input
              type="time"
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '14px', marginTop: '8px' }}
            />
          </div>

          <button
            onClick={() => setStep('confirm')}
            disabled={model === 'HYBRID' && selectedDays.length !== 3}
            className="btn-redesign-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '14px', opacity: model === 'HYBRID' && selectedDays.length !== 3 ? 0.5 : 1 }}
          >
            Review Booking <ArrowRight size={16} />
          </button>
          <button onClick={() => setStep('location')} style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>
            <ArrowLeft size={12} style={{ display: 'inline', marginRight: '4px' }} /> Back
          </button>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 'confirm' && modelInfo && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Confirm Your Booking</h3>

          <div className="glass-card" style={{ padding: '18px', marginBottom: '16px' }}>
            {/* Plan summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${modelInfo.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <modelInfo.icon size={16} color={modelInfo.color} />
              </span>
              <div>
                <strong style={{ fontSize: '14px', color: '#0F172A' }}>{modelInfo.title}</strong>
                <p style={{ fontSize: '11px', color: '#64748B' }}>{modelInfo.priceLabel}</p>
              </div>
            </div>

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Schedule</span>
                <span style={{ color: '#0F172A', fontWeight: 700 }}>
                  {selectedDays.map((d) => DAYS[d].label).join(', ')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Pickup Time</span>
                <span style={{ color: '#0F172A', fontWeight: 700 }}>{pickupTime}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Ride Type</span>
                <span style={{ color: '#0F172A', fontWeight: 700 }}>Shared (pooled)</span>
              </div>
            </div>

            {/* Locations */}
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#16C15D', textTransform: 'uppercase' }}>Pickup</span>
                <p style={{ fontSize: '12px', color: '#0F172A', marginTop: '2px' }}>{pickup?.address || 'Not set'}</p>
              </div>
              <div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase' }}>Drop</span>
                <p style={{ fontSize: '12px', color: '#0F172A', marginTop: '2px' }}>{drop?.address || 'Not set'}</p>
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="glass-card" style={{ padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: '13px', color: '#0F172A' }}>Payment</strong>
              {planPrice != null && <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>₹{planPrice}</span>}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setPaymentMethod('wallet')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: paymentMethod === 'wallet' ? '2px solid #16C15D' : '1px solid #E2E8F0', background: paymentMethod === 'wallet' ? '#F0FDF4' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <Wallet size={14} color="#16C15D" style={{ display: 'inline', marginRight: '6px' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Wallet</span>
                <p style={{ fontSize: '11px', color: walletBalance != null && planPrice != null && walletBalance < planPrice ? '#DC2626' : '#64748B', marginTop: '4px' }}>
                  Balance: ₹{walletBalance ?? '—'}
                </p>
              </button>
              <button onClick={() => setPaymentMethod('razorpay')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: paymentMethod === 'razorpay' ? '2px solid #3B82F6' : '1px solid #E2E8F0', background: paymentMethod === 'razorpay' ? '#EFF6FF' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <CreditCard size={14} color="#3B82F6" style={{ display: 'inline', marginRight: '6px' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Pay online</span>
                <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>Card / UPI / netbanking</p>
              </button>
            </div>
            {paymentMethod === 'wallet' && walletBalance != null && planPrice != null && walletBalance < planPrice && (
              <p style={{ fontSize: '11px', color: '#DC2626', marginTop: '8px' }}>
                Insufficient balance. <Link href="/customer/wallet" style={{ color: '#16C15D', fontWeight: 700 }}>Add money →</Link>
              </p>
            )}
          </div>

          <button onClick={handleSubmit} disabled={loading} className="btn-redesign-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
            {loading ? <><Loader size={16} /> Booking...</> : <>Confirm & Subscribe <Check size={16} /></>}
          </button>
          <button onClick={() => setStep('schedule')} style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'none', border: 'none', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}>
            <ArrowLeft size={12} style={{ display: 'inline', marginRight: '4px' }} /> Back
          </button>
        </div>
      )}

      {/* Step 5: Result */}
      {step === 'result' && result && (
        <div>
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center', marginBottom: '16px' }}>
            <Check size={48} color="#16C15D" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>Subscription Active!</h3>
            <p style={{ fontSize: '13px', color: '#64748B' }}>Your {modelInfo?.title} commute is booked.</p>

            {result.data?.assignment ? (
              <div style={{ textAlign: 'left', marginTop: '20px' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#16C15D', textTransform: 'uppercase', marginBottom: '8px' }}>Assigned Driver</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: '#F0FDF4', borderRadius: '12px' }}>
                  <Users size={22} color="#16C15D" />
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{result.data.assignment.driver.name}</p>
                    <p style={{ fontSize: '12px', color: '#475569' }}>
                      {result.data.assignment.driver.vehicleNumber} · {result.data.assignment.driver.vehicleModel}
                    </p>
                    <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      Area: {result.data.assignment.area} · {result.data.assignment.distanceKm} km · Capacity: {result.data.assignment.driver.vehicleCapacity}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '16px', padding: '12px', background: '#FFF7ED', borderRadius: '10px', textAlign: 'left' }}>
                <p style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>No driver matched yet</p>
                <p style={{ fontSize: '11px', color: '#78716C', marginTop: '4px' }}>{result.data?.reason || 'Admin will manually assign a driver shortly.'}</p>
              </div>
            )}

            {result.data?.tripsGenerated?.length > 0 && (
              <div style={{ textAlign: 'left', marginTop: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', marginBottom: '6px' }}>Upcoming Trips</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {result.data.tripsGenerated.map((date: string) => (
                    <span key={date} style={{ padding: '4px 10px', background: '#EFF6FF', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#2563EB' }}>{date}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link href="/customer/dashboard" className="btn-redesign-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', textDecoration: 'none', display: 'flex' }}>
            Go to Dashboard
          </Link>
        </div>
      )}

      {/* Location picker modal (search + current location + map) */}
      {locationPicker && (
        <LocationSelector
          type={locationPicker}
          initialAddress={locationPicker === 'pickup' ? pickup?.address : drop?.address}
          initialCoordinates={locationPicker === 'pickup' ? pickup?.coordinates : drop?.coordinates}
          onLocationSelect={handleLocationSelect}
          onCancel={() => setLocationPicker(null)}
        />
      )}

      {/* Corporate Emergency Protocol Dialog */}
      {showEmergencyModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05)',
            border: '1.5px solid #FEE2E2',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #FEF2F2 0%, #FFF5F5 100%)',
              padding: '18px 20px',
              borderBottom: '1px solid #FEE2E2',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
            }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <ShieldAlert size={22} color="#DC2626" />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#991B1B', margin: 0 }}>
                    Emergency Ride Authorization
                  </h3>
                  <p style={{ fontSize: '11px', color: '#B91C1C', margin: '2px 0 0 0', fontWeight: 600 }}>
                    Corporate Duty-of-Care & Travel Policy Protocol
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94A3B8',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {/* Corporate Compliance Notice */}
              <div style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '11px',
                color: '#92400E',
                lineHeight: '1.5',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                  <AlertTriangle size={14} color="#D97706" />
                  MANDATORY CORPORATE POLICY DISCLOSURE
                </div>
                Emergency Ride dispatch operates under on-demand Flexy dispatch architecture with priority queue allocation. Pursuant to corporate transit compliance, this service is <strong>strictly provisioned for urgent, time-critical exigencies</strong> where scheduled commute tiers are unviable.
              </div>

              {/* Exigency Category */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                  letterSpacing: '0.5px',
                }}>
                  Exigency Classification
                </label>
                <select
                  value={emergencyReason}
                  onChange={(e) => setEmergencyReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    color: '#0F172A',
                    background: '#F8FAFC',
                    outline: 'none',
                  }}
                >
                  <option value="Medical / Urgent Health Contingency">Medical / Urgent Health Contingency</option>
                  <option value="Business-Critical Client Exigency">Business-Critical Client Exigency</option>
                  <option value="Transit Breakdown / Unscheduled Stranded">Transit Breakdown / Unscheduled Stranded</option>
                  <option value="Late Shift / Safety & Duty of Care">Late Shift / Safety & Duty of Care</option>
                  <option value="Other Unforeseen Exigency">Other Urgent Unforeseen Exigency</option>
                </select>
              </div>

              {/* Policy Terms */}
              <div style={{
                fontSize: '11px',
                color: '#64748B',
                lineHeight: '1.5',
                marginBottom: '16px',
                padding: '10px',
                background: '#F8FAFC',
                borderRadius: '8px',
              }}>
                <p style={{ margin: '0 0 6px 0' }}>• Dispatched as an immediate on-demand ride (single-passenger, Flexy fare model).</p>
                <p style={{ margin: '0 0 6px 0' }}>• Requests are priority-routed and recorded in corporate travel compliance logs.</p>
                <p style={{ margin: 0 }}>• Non-urgent transit should be scheduled through standard commute plans or regular Flexy.</p>
              </div>

              {/* Acknowledgment Checkbox */}
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                cursor: 'pointer',
                marginBottom: '20px',
                userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={emergencyAcknowledged}
                  onChange={(e) => setEmergencyAcknowledged(e.target.checked)}
                  style={{
                    marginTop: '2px',
                    accentColor: '#DC2626',
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                  }}
                />
                <span style={{ fontSize: '11.5px', color: '#1E293B', fontWeight: 600, lineHeight: '1.4' }}>
                  I certify that this booking constitutes an urgent exigency under corporate travel guidelines and authorizes priority dispatch.
                </span>
              </label>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEmergencyModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#64748B',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!emergencyAcknowledged}
                  onClick={() => {
                    setShowEmergencyModal(false);
                    router.push(`/customer/book-ride?mode=emergency&reason=${encodeURIComponent(emergencyReason)}`);
                  }}
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: emergencyAcknowledged ? '#DC2626' : '#FCA5A5',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: emergencyAcknowledged ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: emergencyAcknowledged ? '0 2px 8px rgba(220, 38, 38, 0.35)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <ShieldAlert size={15} />
                  Authorize & Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
