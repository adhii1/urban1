'use client';

import { useState } from 'react';
import { CreditCard, Pause, Loader, AlertCircle, CheckCircle, Clock3, Calendar, ShieldAlert, Phone, Plus, Trash2, X, ChevronDown } from 'lucide-react';
import {
  useCustomerSubscriptions,
  usePauseSubscription,
  useEmergencyMode,
  useUpdateEmergencyMode,
  useTriggerSos,
  useAddEmergencyContact,
  useDeleteEmergencyContact,
  type SubscriptionData,
} from '@/lib/hooks/useCustomerQueries';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDays(days?: number[]) {
  if (!days || days.length === 0) return '';
  return [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).filter(Boolean).join(', ');
}

/**
 * Emergency Mode — lives on the subscription (armed per commute), not the
 * customer profile. Contacts are still the customer's own (shared across all
 * subscriptions); this panel manages the toggle, the SOS trigger, and the
 * contact list in one place, scoped to this one subscription's id.
 */
function EmergencyModePanel({ subscriptionId }: { subscriptionId: string }) {
  const { data, isLoading } = useEmergencyMode(subscriptionId);
  const updateMode = useUpdateEmergencyMode(subscriptionId);
  const triggerSos = useTriggerSos(subscriptionId);
  const addContact = useAddEmergencyContact();
  const deleteContact = useDeleteEmergencyContact();

  const [expanded, setExpanded] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', relationship: '' });

  const enabled = data?.emergencyMode?.enabled !== false;
  const contacts = data?.contacts || [];

  const handleSos = () => {
    if (!confirm('EMERGENCY SOS ALERT:\nAre you sure you want to alert the emergency dispatch team and your emergency contacts immediately?')) return;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => triggerSos.mutate([pos.coords.longitude, pos.coords.latitude]),
        () => triggerSos.mutate(undefined),
        { timeout: 4000 }
      );
    } else {
      triggerSos.mutate(undefined);
    }
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.phone) return;
    addContact.mutate(contactForm, {
      onSuccess: () => { setShowAddContact(false); setContactForm({ name: '', phone: '', relationship: '' }); },
    });
  };

  return (
    <div style={{ marginTop: '16px', border: '1px solid #FEE2E2', borderRadius: '12px', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', padding: '12px 14px', background: '#FEF2F2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#B91C1C' }}>
          <ShieldAlert size={15} /> Emergency Mode {isLoading ? '' : enabled ? '(Armed)' : '(Off)'}
        </span>
        <ChevronDown size={14} color="#B91C1C" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {expanded && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Arm SOS for this commute</p>
              <p style={{ fontSize: '11px', color: '#64748B' }}>Notifies your emergency contacts and TORQQ dispatch when triggered.</p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', flexShrink: 0 }}>
              <input
                type="checkbox" checked={enabled} disabled={updateMode.isPending || isLoading}
                onChange={(e) => updateMode.mutate(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', inset: 0, borderRadius: '24px', cursor: 'pointer',
                background: enabled ? '#16C15D' : '#CBD5E1', transition: 'background 0.15s',
              }}>
                <span style={{
                  position: 'absolute', top: '3px', left: enabled ? '21px' : '3px', width: '18px', height: '18px',
                  borderRadius: '50%', background: '#FFF', transition: 'left 0.15s',
                }} />
              </span>
            </label>
          </div>

          <button
            onClick={handleSos}
            disabled={!enabled || triggerSos.isPending}
            style={{
              padding: '12px', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '13px',
              background: enabled ? '#EF4444' : '#F1F5F9', color: enabled ? '#FFF' : '#94A3B8',
              cursor: enabled && !triggerSos.isPending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <ShieldAlert size={16} /> {triggerSos.isPending ? 'Alerting…' : '🆘 Trigger SOS'}
          </button>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Emergency Contacts</p>
              <button onClick={() => setShowAddContact(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#3B82F6', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={12} /> Add
              </button>
            </div>

            {contacts.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#94A3B8' }}>No emergency contacts added yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {contacts.map((c) => (
                  <div key={c._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      <Phone size={12} color="#64748B" />
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{c.name}</span>
                      <span style={{ color: '#64748B' }}>{c.phone}</span>
                      {c.relationship && <span style={{ color: '#94A3B8' }}>· {c.relationship}</span>}
                    </div>
                    <button onClick={() => deleteContact.mutate(c._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddContact && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowAddContact(false)}>
          <form onSubmit={handleAddContact} onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: '16px', width: '100%', maxWidth: '360px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Add Emergency Contact</h4>
              <button type="button" onClick={() => setShowAddContact(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input required placeholder="Contact name" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} style={{ padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} />
              <input required placeholder="Phone number" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} style={{ padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} />
              <input placeholder="Relationship (optional)" value={contactForm.relationship} onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })} style={{ padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} />
            </div>
            <button type="submit" disabled={addContact.isPending} style={{ width: '100%', marginTop: '16px', padding: '12px', borderRadius: '10px', border: 'none', background: '#3B82F6', color: '#FFF', fontWeight: 700, fontSize: '13px', cursor: addContact.isPending ? 'not-allowed' : 'pointer' }}>
              {addContact.isPending ? 'Adding…' : 'Add Contact'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * One subscription card. A customer can hold several at once — a weekday
 * commute at 08:00, an evening return at 18:00, a Saturday shuttle — so pause
 * is per-card and always names its own subscription id.
 */
function SubscriptionCard({
  subscription,
  isPrimary,
  onPause,
}: {
  subscription: SubscriptionData;
  isPrimary: boolean;
  onPause: (sub: SubscriptionData) => void;
}) {
  const planName = subscription.planId?.name || subscription.planType || subscription.plan || 'Unknown Plan';
  const serviceType = subscription.planId?.serviceType || '';
  const tier = subscription.planId?.tier || '';
  const features = subscription.planId?.features || [];
  const routeName = subscription.routeId?.name || '';
  const routeStart = subscription.routeId?.startLocation || '';
  const routeEnd = subscription.routeId?.endLocation || '';
  const isActive = subscription.status === 'ACTIVE';
  const canPause = isActive && (subscription.remainingPauseDays || 0) > 0;
  const days = formatDays(subscription.scheduleDays);

  return (
    <div style={{ background: '#FFF', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{planName}</div>
          {tier && <p style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{tier} Plan</p>}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
            {serviceType && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px',
                background: serviceType === 'Home-to-Office' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)',
                color: serviceType === 'Home-to-Office' ? '#3B82F6' : '#8B5CF6' }}>
                {serviceType}
              </span>
            )}
            {isPrimary && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px', background: '#F0FDF4', color: '#16A34A' }}>
                Primary
              </span>
            )}
          </div>
        </div>
        <span style={{
          padding: '4px 12px', borderRadius: '12px', fontSize: '10px', fontWeight: 600,
          background: isActive ? '#DCFCE7' : '#FEE2E2',
          color: isActive ? '#16C15D' : '#EF4444',
        }}>
          {subscription.status}
        </span>
      </div>

      {/* Pickup time + days: what distinguishes one subscription from another. */}
      {(subscription.pickupTime || days) && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12px', color: '#475569' }}>
          {subscription.pickupTime && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
              <Clock3 size={13} color="#3B82F6" /> {subscription.pickupTime}
            </span>
          )}
          {days && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Calendar size={13} color="#3B82F6" /> {days}
            </span>
          )}
        </div>
      )}

      {subscription.planId?.price && (
        <p style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>
          ₹{subscription.planId.price}/month
        </p>
      )}

      {routeName && (
        <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', marginBottom: '12px', fontSize: '12px' }}>
          <span style={{ fontWeight: 700, color: '#0F172A' }}>{routeName}</span>
          {routeStart && routeEnd && (
            <span style={{ color: '#64748B', marginLeft: '8px' }}>{routeStart} → {routeEnd}</span>
          )}
        </div>
      )}

      {features.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '8px' }}>Features</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {features.map((f, i) => (
              <li key={i} style={{ fontSize: '12px', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={12} color="#10B981" /> {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', marginBottom: '16px' }}>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Start Date</p>
          <p style={{ fontWeight: 700, color: '#0F172A' }}>
            {subscription.startDate ? new Date(subscription.startDate).toLocaleDateString('en-IN') : '-'}
          </p>
        </div>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>End Date</p>
          <p style={{ fontWeight: 700, color: '#0F172A' }}>
            {subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('en-IN') : '-'}
          </p>
        </div>
      </div>

      {subscription.remainingPauseDays !== undefined && subscription.remainingPauseDays > 0 && (
        <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(245,158,11,0.15)', marginBottom: canPause ? '12px' : 0 }}>
          <span style={{ fontWeight: 700, color: '#F59E0B' }}>{subscription.remainingPauseDays} pause days remaining</span>
        </div>
      )}

      {canPause && (
        <button
          onClick={() => onPause(subscription)}
          style={{
            width: '100%', padding: '14px', background: '#FFF', color: '#F59E0B', border: '1px solid #F59E0B33',
            borderRadius: '12px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <Pause size={16} /> Request Pause
        </button>
      )}

      <EmergencyModePanel subscriptionId={subscription._id} />
    </div>
  );
}

export default function CustomerSubscriptionPage() {
  const { data, isLoading, isError, error } = useCustomerSubscriptions();
  const pauseMutation = usePauseSubscription();

  // Which subscription the pause modal is for — null means closed. Held as the
  // subscription itself so the modal can name the commute being paused.
  const [pauseTarget, setPauseTarget] = useState<SubscriptionData | null>(null);
  const [pauseDate, setPauseDate] = useState('');

  const subscriptions = data?.subscriptions || [];
  const primaryId = data?.primarySubscriptionId || null;

  const handlePauseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseDate || !pauseTarget) return;
    pauseMutation.mutate(
      { date: pauseDate, subscriptionId: pauseTarget._id },
      {
        onSuccess: () => {
          setPauseTarget(null);
          setPauseDate('');
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Loader size={24} color="#16C15D" />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '32px', color: '#EF4444', fontSize: '12px' }}>
        <AlertCircle size={14} /> {(error as any)?.message || 'Failed to load subscription'}
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', background: '#F0FDF4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <CreditCard size={28} color="#16C15D" />
        </div>
        <p style={{ color: '#0F172A', fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>No Active Subscription</p>
        <p style={{ color: '#64748B', fontSize: '12px', marginBottom: '20px' }}>Subscribe to a plan to start your daily commute</p>
        <a href="/customer/subscribe" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '12px 24px', background: '#16C15D', color: '#FFF',
          borderRadius: '12px', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
        }}>
          <CreditCard size={16} /> Browse Plans
        </a>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
          {subscriptions.length > 1 ? `My Subscriptions (${subscriptions.length})` : 'My Subscription'}
        </h2>
        <a href="/customer/subscribe" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', background: '#F0FDF4', color: '#16A34A',
          borderRadius: '10px', fontWeight: 700, fontSize: '12px', textDecoration: 'none',
        }}>
          <CreditCard size={14} /> Add another
        </a>
      </div>

      {subscriptions.map((sub) => (
        <SubscriptionCard
          key={sub._id}
          subscription={sub}
          isPrimary={subscriptions.length > 1 && sub._id === primaryId}
          onPause={setPauseTarget}
        />
      ))}

      {/* Pause Modal */}
      {pauseTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setPauseTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: '20px', width: '100%', maxWidth: '400px', padding: '32px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>Request Subscription Pause</h3>
            <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '20px' }}>
              Pausing your{' '}
              <strong style={{ color: '#0F172A' }}>
                {pauseTarget.planId?.name || pauseTarget.subscriptionType || 'subscription'}
                {pauseTarget.pickupTime ? ` (${pauseTarget.pickupTime})` : ''}
              </strong>
              . Select the date from which you want it paused.
            </p>

            <form onSubmit={handlePauseRequest}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Pause From Date</label>
                <input
                  type="date" required value={pauseDate} onChange={(e) => setPauseDate(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', padding: '12px', border: '1px solid #E5E7EB', borderRadius: '10px', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button" onClick={() => setPauseTarget(null)}
                  style={{
                    flex: 1, padding: '12px', background: '#F1F5F9', color: '#64748B', border: 'none',
                    borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={pauseMutation.isPending}
                  style={{
                    flex: 1, padding: '12px', background: '#F59E0B', color: '#FFF', border: 'none',
                    borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    cursor: pauseMutation.isPending ? 'not-allowed' : 'pointer',
                    opacity: pauseMutation.isPending ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  {pauseMutation.isPending ? <><Loader size={14} /> Submitting...</> : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
