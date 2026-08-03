'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { usePlans, useCreatePlan, useUpdatePlan, useDeletePlan } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X } from 'lucide-react';

export default function PlansPage() {
  useAuthGuard();
  const { data, isLoading } = usePlans();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const plans = data?.success ? (data.data || []) : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    serviceType: 'Home-to-Office',
    tier: 'Flexy',
    description: '',
    durationDays: 30,
    price: 0,
    pauseDaysAllowed: 0,
    features: '',
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    if (showModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const filtered = plans.filter((p: any) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.serviceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.tier.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesService = !serviceFilter || p.serviceType === serviceFilter;
    return matchesSearch && matchesService;
  });

  const handleCreate = async () => {
    try {
      const data = {
        ...formData,
        features: formData.features ? formData.features.split(',').map((f: string) => f.trim()).filter(Boolean) : [],
      };
      if (editingPlan) {
        await updatePlan.mutateAsync({ id: editingPlan._id, data });
      } else {
        await createPlan.mutateAsync(data);
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save plan');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;
    try {
      await deletePlan.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete plan');
    }
  };

  const openCreate = () => {
    setEditingPlan(null);
    setFormData({
      name: '', serviceType: 'Home-to-Office', tier: 'Flexy', description: '',
      durationDays: 30, price: 0, pauseDaysAllowed: 0, features: '',
    });
    setShowModal(true);
  };

  const openEdit = (plan: any) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name || '',
      serviceType: plan.serviceType || 'Home-to-Office',
      tier: plan.tier || 'Flexy',
      description: plan.description || '',
      durationDays: plan.durationDays || 30,
      price: plan.price || 0,
      pauseDaysAllowed: plan.pauseDaysAllowed || 0,
      features: (plan.features || []).join(', '),
    });
    setShowModal(true);
  };

  const columns = ['Name', 'Service Type', 'Tier', 'Price', 'Duration', 'Pause Days', 'Status', 'Actions'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Plans Management</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Create and manage subscription plans</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Add Plan
          </button>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search plans..."
              className="form-input" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '34px', fontSize: '12.5px', height: '38px' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          <button onClick={() => setServiceFilter('')}
            style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              background: serviceFilter === '' ? 'var(--bg-card-solid)' : 'var(--bg-hover)',
              color: serviceFilter === '' ? 'var(--text-main)' : 'var(--text-light)' }}>
            All
          </button>
          {['Home-to-Office', 'Stop-to-Stop'].map((type) => (
            <button key={type} onClick={() => setServiceFilter(type)}
              style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                background: serviceFilter === type ? '#10B981' : 'var(--bg-hover)',
                color: serviceFilter === type ? '#fff' : 'var(--text-light)' }}>
              {type}
            </button>
          ))}
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
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading plans...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No plans found.</td></tr>
              ) : filtered.map((p: any) => (
                <tr key={p._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{p.name}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px',
                      background: p.serviceType === 'Home-to-Office' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)',
                      color: p.serviceType === 'Home-to-Office' ? '#3B82F6' : '#8B5CF6' }}>
                      {p.serviceType}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{p.tier}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>₹{p.price}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{p.durationDays} days</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{p.pauseDaysAllowed}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${p.isActive ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px' }}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Delete">
                        <Trash2 size={14} />
                      </button>
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
          aria-labelledby="plan-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 id="plan-modal-title" style={{ fontSize: '15px', fontWeight: 800 }}>{editingPlan ? 'Edit Plan' : 'Add Plan'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="plan-name" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</label>
                <input id="plan-name" className="form-input" type="text" placeholder="Plan name"
                  value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="plan-service-type" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Service Type</label>
                <select id="plan-service-type" className="form-input" value={formData.serviceType}
                  onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }}>
                  <option value="Home-to-Office">Home-to-Office</option>
                  <option value="Stop-to-Stop">Stop-to-Stop</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="plan-tier" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tier</label>
                <select id="plan-tier" className="form-input" value={formData.tier}
                  onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }}>
                  <option value="Flexy">Flexy</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Weekday">Weekday</option>
                  <option value="Standard">Standard</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="plan-description" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</label>
                <textarea id="plan-description" className="form-input" placeholder="Plan description"
                  value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  style={{ fontSize: '12px', padding: '10px 12px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor="plan-duration" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Duration (Days)</label>
                  <input id="plan-duration" className="form-input" type="number" min={1}
                    value={formData.durationDays} onChange={(e) => setFormData({ ...formData, durationDays: parseInt(e.target.value) || 30 })}
                    style={{ fontSize: '12px', padding: '10px 12px' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor="plan-price" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price (₹)</label>
                  <input id="plan-price" className="form-input" type="number" min={0}
                    value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                    style={{ fontSize: '12px', padding: '10px 12px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="plan-pause" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pause Days Allowed</label>
                <input id="plan-pause" className="form-input" type="number" min={0}
                  value={formData.pauseDaysAllowed} onChange={(e) => setFormData({ ...formData, pauseDaysAllowed: parseInt(e.target.value) || 0 })}
                  style={{ fontSize: '12px', padding: '10px 12px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="plan-features" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Features (comma-separated)</label>
                <input id="plan-features" className="form-input" type="text" placeholder="e.g. AC, Wi-Fi, Water Bottle"
                  value={formData.features} onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }} />
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {editingPlan ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
