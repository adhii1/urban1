'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Check, MapPin, Calendar, Clock, Users, Loader, AlertCircle, ArrowLeft, Star } from 'lucide-react';
import {
  useBrowsePlans,
  useRoutesForPlan,
  usePurchaseSubscription,
  useVerifySubscriptionPayment,
  type PlanDetail,
  type RouteDetail,
} from '@/lib/hooks/useCustomerQueries';
import { useToastStore } from '@/stores/toastStore';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const TIER_COLORS: Record<string, { bg: string; fg: string; accent: string }> = {
  Flexy: { bg: '#FFF7ED', fg: '#EA580C', accent: '#FB923C' },
  Hybrid: { bg: '#EFF6FF', fg: '#2563EB', accent: '#60A5FA' },
  Weekday: { bg: '#F0FDF4', fg: '#16A34A', accent: '#4ADE80' },
  Standard: { bg: '#F8FAFC', fg: '#475569', accent: '#94A3B8' },
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PlansPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [serviceFilter, setServiceFilter] = useState<string>('Home-to-Office');
  const [selectedPlan, setSelectedPlan] = useState<PlanDetail | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteDetail | null>(null);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [pickupStopIndex, setPickupStopIndex] = useState<number | undefined>(undefined);
  const [dropStopIndex, setDropStopIndex] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [step, setStep] = useState<'browse' | 'configure' | 'payment'>('browse');

  const { data: plans, isLoading } = useBrowsePlans(serviceFilter);
  const { data: routes } = useRoutesForPlan(selectedPlan?._id || '');
  const purchaseMutation = usePurchaseSubscription();
  const verifyMutation = useVerifySubscriptionPayment();

  // Load Razorpay script
  useEffect(() => {
    if (document.getElementById('razorpay-script')) return;
    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const handleSelectPlan = (plan: PlanDetail) => {
    setSelectedPlan(plan);
    setSelectedRoute(null);
    setSelectedWeekdays([]);
    setPickupStopIndex(undefined);
    setDropStopIndex(undefined);
    setStep('configure');
  };

  const toggleWeekday = (day: number) => {
    const maxDays = selectedPlan?.bookingRules?.allowedDaysPerWeek || 3;
    setSelectedWeekdays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      if (prev.length >= maxDays) return prev;
      return [...prev, day];
    });
  };

  const handlePurchase = async () => {
    if (!selectedPlan || !selectedRoute) return;

    try {
      const result = await purchaseMutation.mutateAsync({
        planId: selectedPlan._id,
        routeId: selectedRoute._id,
        startDate,
        selectedWeekdays: selectedPlan.tier === 'Hybrid' ? selectedWeekdays : undefined,
        pickupStopIndex: selectedPlan.bookingRules?.useManagedStops ? pickupStopIndex : undefined,
        dropStopIndex: selectedPlan.bookingRules?.useManagedStops ? dropStopIndex : undefined,
      });

      const orderData = (result as any).data;
      if (!orderData) {
        addToast('Failed to create order', 'error');
        return;
      }

      // Open Razorpay checkout
      if (window.Razorpay) {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'TORQQ',
          description: `${orderData.plan?.name || selectedPlan.name} Subscription`,
          order_id: orderData.orderId,
          handler: async (response: any) => {
            // Verify payment
            try {
              await verifyMutation.mutateAsync({
                subscriptionId: orderData.subscriptionId,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });
              setStep('browse');
              setSelectedPlan(null);
            } catch {
              addToast('Payment verification failed', 'error');
            }
          },
          prefill: {},
          theme: { color: '#16C15D' },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', () => {
          addToast('Payment failed. Please try again.', 'error');
        });
        rzp.open();
      } else {
        // Fallback for mock mode (dev without Razorpay loaded)
        await verifyMutation.mutateAsync({
          subscriptionId: orderData.subscriptionId,
          orderId: orderData.orderId,
          paymentId: `pay_mock_${Date.now()}`,
          signature: 'mock_signature',
        });
        setStep('browse');
        setSelectedPlan(null);
        addToast('Subscription activated (mock payment)', 'success');
      }
    } catch (err: any) {
      addToast(err.message || 'Purchase failed', 'error');
    }
  };

  // --- Browse Step ---
  if (step === 'browse') {
    return (
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>Choose a Plan</h2>
        <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>Select a subscription plan that fits your commute</p>

        {/* Service type filter */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['Home-to-Office', 'Stop-to-Stop'].map((type) => (
            <button key={type} onClick={() => setServiceFilter(type)} style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none',
              background: serviceFilter === type ? '#16C15D' : '#F1F5F9',
              color: serviceFilter === type ? '#FFF' : '#64748B',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>
              {type}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Loader size={24} color="#16C15D" />
          </div>
        ) : !plans || plans.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontSize: '12px' }}>No plans available.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {plans.map((plan) => {
              const colors = TIER_COLORS[plan.tier] || TIER_COLORS.Standard;
              const rules = plan.bookingRules || {};
              return (
                <div key={plan._id} style={{
                  background: '#FFF', borderRadius: '14px', padding: '16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: `2px solid ${colors.accent}20`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: colors.bg, color: colors.fg }}>
                        {plan.tier}
                      </span>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginTop: '6px' }}>{plan.name}</h3>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>₹{plan.price}</div>
                      <div style={{ fontSize: '10px', color: '#64748B' }}>{plan.durationDays} days</div>
                    </div>
                  </div>

                  {plan.description && (
                    <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '10px' }}>{plan.description}</p>
                  )}

                  {/* Key features */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {!rules.isSharedRide && (
                      <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '6px', background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>
                        Single Person (like Ola/Uber)
                      </span>
                    )}
                    {rules.isSharedRide && (
                      <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '6px', background: '#DBEAFE', color: '#1D4ED8', fontWeight: 600 }}>
                        <Users size={9} style={{ display: 'inline', marginRight: '3px' }} />Shared Ride
                      </span>
                    )}
                    {(rules.minAdvanceBookingMinutes || 0) > 0 && (
                      <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '6px', background: '#F3E8FF', color: '#7C3AED', fontWeight: 600 }}>
                        <Clock size={9} style={{ display: 'inline', marginRight: '3px' }} />Book {Math.round((rules.minAdvanceBookingMinutes || 0) / 60)}h ahead
                      </span>
                    )}
                    {rules.allowedDaysPerWeek && rules.allowedDaysPerWeek < 7 && (
                      <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '6px', background: '#ECFDF5', color: '#065F46', fontWeight: 600 }}>
                        <Calendar size={9} style={{ display: 'inline', marginRight: '3px' }} />{rules.allowedDaysPerWeek} days/week
                      </span>
                    )}
                    {rules.isAlternateDay && (
                      <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '6px', background: '#FFF1F2', color: '#BE123C', fontWeight: 600 }}>
                        Alternate Days
                      </span>
                    )}
                  </div>

                  {plan.features && plan.features.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {plan.features.slice(0, 4).map((f, i) => (
                        <li key={i} style={{ fontSize: '11px', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Check size={11} color="#16C15D" /> {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  {plan.pauseDaysAllowed > 0 && (
                    <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '10px' }}>
                      {plan.pauseDaysAllowed} pause days included
                    </div>
                  )}

                  <button onClick={() => handleSelectPlan(plan)} style={{
                    width: '100%', padding: '12px', border: 'none', borderRadius: '10px',
                    background: `linear-gradient(135deg, ${colors.fg} 0%, ${colors.accent} 100%)`,
                    color: '#FFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  }}>
                    Select Plan
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Configure Step ---
  if (step === 'configure' && selectedPlan) {
    const colors = TIER_COLORS[selectedPlan.tier] || TIER_COLORS.Standard;
    const rules = selectedPlan.bookingRules || {};
    const needsWeekdaySelection = selectedPlan.tier === 'Hybrid';
    const needsStopSelection = rules.useManagedStops;

    const canProceed = selectedRoute &&
      (!needsWeekdaySelection || selectedWeekdays.length === (rules.allowedDaysPerWeek || 3)) &&
      (!needsStopSelection || (pickupStopIndex !== undefined && dropStopIndex !== undefined && pickupStopIndex !== dropStopIndex));

    return (
      <div>
        <button onClick={() => { setStep('browse'); setSelectedPlan(null); }} style={{
          background: 'none', border: 'none', color: '#16C15D', fontWeight: 600,
          fontSize: '13px', cursor: 'pointer', marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px',
        }}>
          <ArrowLeft size={14} /> Back to plans
        </button>

        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: colors.bg, color: colors.fg }}>
                {selectedPlan.tier}
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>{selectedPlan.name}</h3>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#16C15D' }}>₹{selectedPlan.price}</div>
          </div>
        </div>

        {/* Route Selection */}
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '10px' }}>Select Route</h4>
          {routes && routes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {routes.map((route) => (
                <div key={route._id} onClick={() => { setSelectedRoute(route); setPickupStopIndex(undefined); setDropStopIndex(undefined); }}
                  style={{
                    padding: '12px', borderRadius: '10px', cursor: 'pointer',
                    border: `2px solid ${selectedRoute?._id === route._id ? '#16C15D' : '#E2E8F0'}`,
                    background: selectedRoute?._id === route._id ? '#F0FDF4' : '#FFF',
                  }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{route.name}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    {route.startLocation} → {route.endLocation}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>
                    {route.stops?.length || 0} stops
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '12px', color: '#64748B' }}>No routes available for this plan.</p>
          )}
        </div>

        {/* Stop Selection (for managed-stop plans) */}
        {needsStopSelection && selectedRoute && selectedRoute.stops && (
          <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '10px' }}>
              <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />Select Pickup & Drop Stops
            </h4>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Pickup Stop</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                {selectedRoute.stops.map((stop, idx) => (
                  <div key={`pickup-${idx}`} onClick={() => setPickupStopIndex(idx)}
                    style={{
                      padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
                      border: `1.5px solid ${pickupStopIndex === idx ? '#16C15D' : '#E2E8F0'}`,
                      background: pickupStopIndex === idx ? '#F0FDF4' : '#FFF',
                      color: dropStopIndex === idx ? '#94A3B8' : '#0F172A',
                      opacity: dropStopIndex === idx ? 0.5 : 1,
                    }}>
                    <MapPin size={10} color="#16C15D" style={{ display: 'inline', marginRight: '6px' }} />
                    {stop.stopName}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Drop Stop</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                {selectedRoute.stops.map((stop, idx) => (
                  <div key={`drop-${idx}`} onClick={() => setDropStopIndex(idx)}
                    style={{
                      padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
                      border: `1.5px solid ${dropStopIndex === idx ? '#EF4444' : '#E2E8F0'}`,
                      background: dropStopIndex === idx ? '#FEF2F2' : '#FFF',
                      color: pickupStopIndex === idx ? '#94A3B8' : '#0F172A',
                      opacity: pickupStopIndex === idx ? 0.5 : 1,
                    }}>
                    <MapPin size={10} color="#EF4444" style={{ display: 'inline', marginRight: '6px' }} />
                    {stop.stopName}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Weekday Selection (for Hybrid plans) */}
        {needsWeekdaySelection && (
          <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
              Select Your {rules.allowedDaysPerWeek || 3} Commute Days
            </h4>
            <p style={{ fontSize: '10px', color: '#64748B', marginBottom: '10px' }}>
              Pick {rules.allowedDaysPerWeek || 3} days of the week you'll commute
            </p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {WEEKDAY_NAMES.map((name, idx) => (
                <button key={idx} onClick={() => toggleWeekday(idx)} style={{
                  padding: '10px 14px', borderRadius: '10px', border: 'none', fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer',
                  background: selectedWeekdays.includes(idx) ? '#16C15D' : '#F1F5F9',
                  color: selectedWeekdays.includes(idx) ? '#FFF' : '#64748B',
                }}>
                  {name}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '8px' }}>
              {selectedWeekdays.length}/{rules.allowedDaysPerWeek || 3} selected
            </p>
          </div>
        )}

        {/* Start Date */}
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>Start Date</h4>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            style={{
              width: '100%', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px',
              fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        {/* Purchase button */}
        <button onClick={handlePurchase}
          disabled={!canProceed || purchaseMutation.isPending}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: '12px',
            background: canProceed ? '#16C15D' : '#CBD5E1', color: '#FFF',
            fontSize: '14px', fontWeight: 700, cursor: canProceed ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            opacity: purchaseMutation.isPending ? 0.7 : 1,
          }}>
          {purchaseMutation.isPending ? (
            <><Loader size={16} /> Processing...</>
          ) : (
            <><CreditCard size={16} /> Pay ₹{selectedPlan.price} & Subscribe</>
          )}
        </button>
      </div>
    );
  }

  return null;
}
