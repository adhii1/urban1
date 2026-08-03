'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useSubscriptions, useCreateSubscription, useUpdateSubscription, usePauseSubscription, useResumeSubscription, useCustomers, useRoutes, usePlans } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pause, Play, Pencil, X } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'badge-success',
  PAUSED: 'badge-warning',
  CANCELLED: 'badge-danger',
  EXPIRED: 'badge-secondary',
};

export default function SubscriptionsPage() {
  useAuthGuard();
  const { data, isLoading } = useSubscriptions();
  const createSubscription = useCreateSubscription();
  const updateSubscription = useUpdateSubscription();
  const pauseSubscription = usePauseSubscription();
  const resumeSubscription = useResumeSubscription();
  const subscriptions = data?.success ? (data.data || data.subscriptions || []) : [];

  const { data: customersData } = useCustomers();
  const { data: routesData } = useRoutes();
  const { data: plansData } = usePlans();

  const customers = customersData?.success ? (customersData.data || []) : [];
  const routes = routesData?.success ? (routesData.data || []) : [];
  const plans = plansData?.success ? (plansData.data || []) : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    if (showModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const [editingSub, setEditingSub] = useState<any>(null);
  const [formData, setFormData] = useState({
    customerId: '', routeId: '', planId: '', startDate: '', endDate: '',
  });
  const [serviceFilter, setServiceFilter] = useState<string>('Home-to-Office');

  const filteredPlans = plans.filter((p: any) => p.serviceType === serviceFilter);

  useEffect(() => {
    if (formData.planId && formData.startDate) {
      const plan = plans.find((p: any) => p._id === formData.planId);
      if (plan) {
        const end = new Date(formData.startDate);
        end.setDate(end.getDate() + plan.durationDays);
        setFormData(prev => ({ ...prev, endDate: end.toISOString().split('T')[0] }));
      }
    }
  }, [formData.planId, formData.startDate, plans]);

  const filtered = subscriptions.filter((s: any) =>
    (s.customerName || s.customerId?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.routeName || s.routeId?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.status || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePause = async (id: string) => {
    try {
      await pauseSubscription.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to pause subscription');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await resumeSubscription.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to resume subscription');
    }
  };

  const handleCreate = async () => {
    try {
      if (editingSub) {
        await updateSubscription.mutateAsync({ id: editingSub._id || editingSub.id, data: formData });
      } else {
        await createSubscription.mutateAsync(formData);
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save subscription');
    }
  };

  const openCreate = () => {
    setEditingSub(null);
    setFormData({ customerId: '', routeId: '', planId: '', startDate: '', endDate: '' });
    setServiceFilter('Home-to-Office');
    setShowModal(true);
  };

  const openEdit = (sub: any) => {
    setEditingSub(sub);
    setFormData({
      customerId: sub.customerId?._id || sub.customerId || '',
      routeId: sub.routeId?._id || sub.routeId || '',
      planId: sub.planId?._id || sub.planId || '',
      startDate: sub.startDate ? sub.startDate.split('T')[0] : '',
      endDate: sub.endDate ? sub.endDate.split('T')[0] : '',
    });
    if (sub.planId?.serviceType) setServiceFilter(sub.planId.serviceType);
    setShowModal(true);
  };

  const columns = ['Customer', 'Route', 'Plan', 'Service', 'Start', 'End', 'Status', 'Actions'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Subscriptions Management</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Manage commuter subscription plans and billing</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Add Subscription
          </button>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search subscriptions..."
              className="form-input" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '34px', fontSize: '12.5px', height: '38px' }} />
          </div>
        </div>

        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {columns.map((h) => (
                  <th key={h} style={{ padding: '14px 18px', textAlign: 'left', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading subscriptions...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No subscriptions found.</td></tr>
              ) : filtered.map((s: any) => (
                <tr key={s._id || s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{s.customerId?.name || s.customerName || s.customerId || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{s.routeId?.name || s.routeName || s.routeId || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>
                    <span>{s.planId?.name || s.planType || s.planId || '-'}</span>
                    {s.planId?.tier && <span style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-hover)', color: 'var(--text-light)' }}>{s.planId.tier}</span>}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    {s.planId?.serviceType && <span style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '6px', background: s.planId.serviceType === 'Home-to-Office' ? '#10B981' : '#6366F1', color: '#fff', fontWeight: 700 }}>{s.planId.serviceType}</span>}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>
                    {s.startDate ? new Date(s.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>
                    {s.endDate ? new Date(s.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${STATUS_COLORS[s.status] || 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>{s.status}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit">
                        <Pencil size={14} />
                      </button>
                      {s.status === 'ACTIVE' ? (
                        <button onClick={() => handlePause(s._id || s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F59E0B', padding: 0 }} title="Pause">
                          <Pause size={14} />
                        </button>
                      ) : s.status === 'PAUSED' ? (
                        <button onClick={() => handleResume(s._id || s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10B981', padding: 0 }} title="Resume">
                          <Play size={14} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div 
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sub-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 id="sub-modal-title" style={{ fontSize: '15px', fontWeight: 800 }}>{editingSub ? 'Edit Subscription' : 'Add Subscription'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="sub-customer" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer</label>
                <select id="sub-customer" className="form-input" value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }}>
                  <option value="">Select Customer</option>
                  {customers.map((c: any) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="sub-route" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Route</label>
                <select id="sub-route" className="form-input" value={formData.routeId}
                  onChange={(e) => setFormData({ ...formData, routeId: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }}>
                  <option value="">Select Route</option>
                  {routes.map((r: any) => (
                    <option key={r._id} value={r._id}>{r.name} ({r.startLocation} → {r.endLocation})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Service Type</label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  {['Home-to-Office', 'Stop-to-Stop'].map((type) => (
                    <button key={type} type="button" onClick={() => setServiceFilter(type)}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        background: serviceFilter === type ? '#10B981' : 'var(--bg-hover)',
                        color: serviceFilter === type ? '#fff' : 'var(--text-light)',
                      }}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="sub-plan" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Plan</label>
                <select id="sub-plan" className="form-input" value={formData.planId}
                  onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }}>
                  <option value="">Select Plan</option>
                  {filteredPlans.map((p: any) => (
                    <option key={p._id} value={p._id}>{p.name} — ₹{p.price} ({p.durationDays} days, {p.tier})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="sub-start-date" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start Date</label>
                <input id="sub-start-date" className="form-input" type="date"
                  value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px', colorScheme: 'dark' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="sub-end-date" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>End Date</label>
                <input id="sub-end-date" className="form-input" type="date" readOnly
                  value={formData.endDate}
                  style={{ fontSize: '12px', padding: '10px 12px', colorScheme: 'dark', opacity: 0.7 }} />
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {editingSub ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
