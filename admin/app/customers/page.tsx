'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useBanCustomer } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, ShieldBan, X } from 'lucide-react';

export default function CustomersPage() {
  useAuthGuard();

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

  const locStr = (loc: any): string => {
    if (!loc) return '-';
    if (typeof loc === 'string') return loc;
    if (loc.address) return loc.address;
    if (Array.isArray(loc.coordinates)) return `${loc.coordinates[1]?.toFixed(4)}, ${loc.coordinates[0]?.toFixed(4)}`;
    return '-';
  };
  const { data, isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const banCustomer = useBanCustomer();
  const customers = data?.success ? (data.data || data.customers || []) : [];

  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '', phone: '', homeLocation: '', pickupLocation: '', dropLocation: '',
  });

  const filtered = customers.filter((c: any) =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').includes(searchTerm)
  );

  const openCreate = () => {
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', homeLocation: '', pickupLocation: '', dropLocation: '' });
    setShowModal(true);
  };

  const openEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '', phone: customer.phone || '',
      homeLocation: locStr(customer.homeLocation),
      pickupLocation: locStr(customer.pickupLocation),
      dropLocation: locStr(customer.dropLocation),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editingCustomer) {
        await updateCustomer.mutateAsync({ id: editingCustomer._id || editingCustomer.id, data: formData });
      } else {
        await createCustomer.mutateAsync(formData);
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save customer');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer?')) return;
    try {
      await deleteCustomer.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer');
    }
  };

  const handleBan = async (id: string) => {
    if (!confirm('Ban this customer?')) return;
    try {
      await banCustomer.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to ban customer');
    }
  };

  const columns = ['Name', 'Phone', 'Home Location', 'Pickup', 'Drop', 'Subscription', 'Status', 'Actions'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Customers Management</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Manage customer accounts, subscriptions, and status</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Add Customer
          </button>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search customers..."
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
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No customers found.</td></tr>
              ) : filtered.map((c: any) => (
                <tr key={c._id || c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{c.phone}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{locStr(c.homeLocation)}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{locStr(c.pickupLocation)}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{locStr(c.dropLocation)}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: c.subscription ? 'var(--color-primary)' : 'var(--text-light)', fontWeight: c.subscription ? 600 : 400 }}>
                    {c.subscription?.planType || c.subscription?.status || (typeof c.subscription === 'string' ? c.subscription : '') || 'None'}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${c.isBanned ? 'badge-danger' : c.isActive !== false ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                      {c.isBanned ? 'Banned' : c.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit">
                        <Pencil size={14} />
                      </button>
                      {!c.isBanned && (
                        <button onClick={() => handleBan(c._id || c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F59E0B', padding: 0 }} title="Ban">
                          <ShieldBan size={14} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(c._id || c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Delete">
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
          aria-labelledby="customer-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 id="customer-modal-title" style={{ fontSize: '15px', fontWeight: 800 }}>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { key: 'name', label: 'Name', placeholder: 'Customer full name', type: 'text' },
                { key: 'phone', label: 'Phone', placeholder: 'e.g. 9876543210', type: 'tel' },
                { key: 'homeLocation', label: 'Home Location (Optional)', placeholder: 'Home address', type: 'text' },
                { key: 'pickupLocation', label: 'Pickup Location (Optional)', placeholder: 'Regular pickup point', type: 'text' },
                { key: 'dropLocation', label: 'Drop Location (Optional)', placeholder: 'Regular drop point', type: 'text' },
              ].map((field) => (
                <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor={`field-${field.key}`} style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{field.label}</label>
                  <input 
                    id={`field-${field.key}`}
                    type={field.type}
                    className="form-input" 
                    placeholder={field.placeholder}
                    value={(formData as any)[field.key]}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    style={{ fontSize: '12px', padding: '10px 12px' }} 
                  />
                </div>
              ))}
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {editingCustomer ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
