'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useCorporates, useCreateCorporate, useUpdateCorporate, useDeleteCorporate } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, Building2, Users } from 'lucide-react';

const sectionHeading: React.CSSProperties = { fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' };
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' };
const fieldLabel: React.CSSProperties = { fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const inputStyle: React.CSSProperties = { fontSize: '12px', padding: '10px 12px' };

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={fieldLabel}>{label}</label>
      <input type={type} className="form-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

export default function CorporatesPage() {
  useAuthGuard();
  const { data, isLoading } = useCorporates();
  const createCorporate = useCreateCorporate();
  const updateCorporate = useUpdateCorporate();
  const deleteCorporate = useDeleteCorporate();
  const corporates = data?.success ? (data.data || []) : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCorporate, setEditingCorporate] = useState<any>(null);

  const emptyForm = {
    companyName: '', phone: '', password: '',
    contactName: '', contactDesignation: '',
    billingEmail: '', gstNumber: '', address: '', employeeLimit: '50',
  };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false); };
    if (showModal) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const filtered = corporates.filter((c: any) =>
    (c.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.userId?.phone || '').includes(searchTerm)
  );

  const openCreate = () => {
    setEditingCorporate(null);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const openEdit = (corp: any) => {
    setEditingCorporate(corp);
    setFormData({
      companyName: corp.companyName || '',
      phone: corp.userId?.phone || '',
      password: '',
      contactName: corp.contactPerson?.name || '',
      contactDesignation: corp.contactPerson?.designation || '',
      billingEmail: corp.billingEmail || '',
      gstNumber: corp.gstNumber || '',
      address: corp.address || '',
      employeeLimit: corp.employeeLimit?.toString() || '50',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const contactPerson = { name: formData.contactName || '', designation: formData.contactDesignation || '' };
      const core = {
        companyName: formData.companyName,
        contactPerson,
        billingEmail: formData.billingEmail || '',
        gstNumber: formData.gstNumber || '',
        address: formData.address || '',
        employeeLimit: Number(formData.employeeLimit) || 50,
      };

      if (editingCorporate) {
        const payload: any = { ...core };
        if (formData.password && formData.password.trim().length > 0) payload.password = formData.password.trim();
        await updateCorporate.mutateAsync({ id: editingCorporate._id, data: payload });
      } else {
        await createCorporate.mutateAsync({ ...core, phone: formData.phone, password: formData.password });
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save corporate account');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this corporate account? Its employees keep their own accounts but stop being linked to it.')) return;
    try {
      await deleteCorporate.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete corporate account');
    }
  };

  const columns = ['Company', 'Contact Phone', 'Billing Email', 'GST', 'Employees', 'Status', 'Actions'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Corporate Accounts</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Provision company accounts. They log in separately and manage their own employee roster.</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Add Corporate
          </button>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search corporate accounts by company or phone..."
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
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading corporate accounts...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No corporate accounts yet.</td></tr>
              ) : filtered.map((corp: any) => (
                <tr key={corp._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Building2 size={13} color="#10B981" /> {corp.companyName}</span>
                    {corp.contactPerson?.name && <p style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: 400, marginTop: '2px' }}>{corp.contactPerson.name}{corp.contactPerson.designation ? ` · ${corp.contactPerson.designation}` : ''}</p>}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{corp.userId?.phone || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '11.5px', color: 'var(--text-light)' }}>{corp.billingEmail || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '11.5px', color: 'var(--text-light)', fontFamily: 'monospace' }}>{corp.gstNumber || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Users size={12} color="#3B82F6" /> {corp.employeeCount || 0} / {corp.employeeLimit}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${corp.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>{corp.status}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openEdit(corp)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(corp._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-light)' }}>
          {filtered.length} corporate account{filtered.length !== 1 ? 's' : ''} total
        </p>
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="corporate-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal-card" style={{ maxWidth: '600px', width: '100%' }}>
            <div className="modal-header" style={{ padding: '18px 24px' }}>
              <h3 id="corporate-modal-title" style={{ fontSize: '18px', fontWeight: 800 }}>{editingCorporate ? 'Edit Corporate Account' : 'Register Corporate Account'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={20} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <section>
                <p style={sectionHeading}>Company Details</p>
                <div style={twoCol}>
                  <Field label="Company Name" placeholder="e.g. Acme Corp" value={formData.companyName} onChange={(v) => setFormData({ ...formData, companyName: v })} />
                  <Field label="GST Number" placeholder="Optional" value={formData.gstNumber} onChange={(v) => setFormData({ ...formData, gstNumber: v.toUpperCase() })} />
                  <Field label="Billing Email" placeholder="billing@company.com" type="email" value={formData.billingEmail} onChange={(v) => setFormData({ ...formData, billingEmail: v })} />
                  <Field label="Employee Seat Limit" placeholder="e.g. 50" type="number" value={formData.employeeLimit} onChange={(v) => setFormData({ ...formData, employeeLimit: v })} />
                </div>
                <div style={{ marginTop: '14px' }}>
                  <Field label="Address" placeholder="Optional" value={formData.address} onChange={(v) => setFormData({ ...formData, address: v })} />
                </div>
              </section>

              <section>
                <p style={sectionHeading}>Contact Person</p>
                <div style={twoCol}>
                  <Field label="Name" placeholder="e.g. Priya Nair" value={formData.contactName} onChange={(v) => setFormData({ ...formData, contactName: v })} />
                  <Field label="Designation" placeholder="e.g. HR Manager" value={formData.contactDesignation} onChange={(v) => setFormData({ ...formData, contactDesignation: v })} />
                </div>
              </section>

              <section>
                <p style={sectionHeading}>Login Credentials</p>
                <div style={twoCol}>
                  {!editingCorporate ? (
                    <Field label="Phone Number" placeholder="e.g. 9876543210" type="tel" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
                  ) : (
                    <Field label="Reset Password (Optional)" placeholder="Leave blank to keep" type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} />
                  )}
                  {!editingCorporate && (
                    <Field label="Password" placeholder="Min 6 characters" type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} />
                  )}
                </div>
              </section>
            </div>
            <div className="modal-footer" style={{ padding: '14px 24px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: '12px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '12px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {editingCorporate ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
