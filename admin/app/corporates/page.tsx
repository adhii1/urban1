'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import {
  useCorporates,
  useCreateCorporate,
  useUpdateCorporate,
  useDeleteCorporate,
  useApproveCorporate,
  useRejectCorporate,
  useAssignDriverToCorporate,
} from '../../lib/hooks/useAdminQueries';
import { useDrivers } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, Building2, Users, Check, XCircle, Clock, Car } from 'lucide-react';

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

/** Status badge colours and labels */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
    PENDING:   { bg: '#FEF3C7', color: '#D97706', icon: <Clock size={10} style={{ marginRight: 3 }} />,    label: 'Pending'   },
    ACTIVE:    { bg: '#D1FAE5', color: '#059669', icon: <Check size={10} style={{ marginRight: 3 }} />,    label: 'Active'    },
    REJECTED:  { bg: '#FEE2E2', color: '#DC2626', icon: <XCircle size={10} style={{ marginRight: 3 }} />, label: 'Rejected'  },
    INACTIVE:  { bg: '#F1F5F9', color: '#64748B', icon: null,                                              label: 'Inactive'  },
    SUSPENDED: { bg: '#FEE2E2', color: '#9A1212', icon: null,                                              label: 'Suspended' },
  };
  const s = map[status] || { bg: '#F1F5F9', color: '#64748B', icon: null, label: status };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 20, fontSize: '10px', fontWeight: 700, background: s.bg, color: s.color }}>
      {s.icon}{s.label}
    </span>
  );
}

/** Status filter tab options */
type FilterStatus = 'ALL' | 'PENDING' | 'ACTIVE' | 'REJECTED';

export default function CorporatesPage() {
  useAuthGuard();
  const { data, isLoading } = useCorporates();
  const { data: driversData } = useDrivers();
  const createCorporate = useCreateCorporate();
  const updateCorporate = useUpdateCorporate();
  const deleteCorporate = useDeleteCorporate();
  const approveCorporate = useApproveCorporate();
  const rejectCorporate = useRejectCorporate();
  const assignDriver = useAssignDriverToCorporate();

  const corporates: any[] = data?.success ? (data.data || []) : [];
  const drivers: any[] = driversData?.success ? (driversData.data || []) : [];
  // Only ACTIVE drivers are sensible choices for assignment
  const activeDrivers = drivers.filter((d: any) => d.status === 'ACTIVE' || !d.status);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingCorporate, setEditingCorporate] = useState<any>(null);

  // ── Reject confirmation ──────────────────────────────────────────
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Assign-driver panel ──────────────────────────────────────────
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState('');

  const emptyForm = {
    companyName: '', phone: '', password: '',
    contactName: '', contactDesignation: '',
    billingEmail: '', gstNumber: '', address: '', employeeLimit: '50',
  };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowModal(false); setRejectTarget(null); setAssignTarget(null); } };
    if (showModal || rejectTarget || assignTarget) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, rejectTarget, assignTarget]);

  const filtered = corporates.filter((c: any) => {
    const matchesSearch =
      (c.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.userId?.phone || '').includes(searchTerm);
    const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = corporates.filter((c: any) => c.status === 'PENDING').length;

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

  const handleApprove = async (corp: any) => {
    if (!confirm(`Approve ${corp.companyName}? They will be able to sign in immediately.`)) return;
    try {
      await approveCorporate.mutateAsync(corp._id);
    } catch (err: any) {
      alert(err.message || 'Failed to approve');
    }
  };

  const openReject = (corp: any) => {
    setRejectTarget(corp);
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await rejectCorporate.mutateAsync({ id: rejectTarget._id, reason: rejectReason.trim() || undefined });
      setRejectTarget(null);
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
    }
  };

  const openAssignDriver = (corp: any) => {
    setAssignTarget(corp);
    setSelectedDriver(corp.assignedDriverId?._id || corp.assignedDriverId || '');
  };

  const handleAssignDriver = async () => {
    if (!assignTarget || !selectedDriver) return;
    try {
      await assignDriver.mutateAsync({ id: assignTarget._id, driverId: selectedDriver });
      setAssignTarget(null);
    } catch (err: any) {
      alert(err.message || 'Failed to assign driver');
    }
  };

  const columns = ['Company', 'Contact Phone', 'Billing Email', 'GST', 'Employees', 'Status', 'Actions'];
  const filterTabs: FilterStatus[] = ['ALL', 'PENDING', 'ACTIVE', 'REJECTED'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Corporate Accounts</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Provision company accounts. They log in separately and manage their own employee roster.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {pendingCount > 0 && (
              <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: '11px', fontWeight: 700, background: '#FEF3C7', color: '#D97706', border: '1px solid #FCD34D' }}>
                <Clock size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {pendingCount} pending review
              </span>
            )}
            <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
              <Plus size={14} /> Add Corporate
            </button>
          </div>
        </div>

        {/* Search + status filter bar */}
        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flexGrow: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search by company or phone..."
              className="form-input" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '34px', fontSize: '12.5px', height: '38px' }} />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {filterTabs.map((tab) => (
              <button key={tab} onClick={() => setFilterStatus(tab)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '11px', fontWeight: 700, background: filterStatus === tab ? 'var(--accent)' : 'transparent', color: filterStatus === tab ? '#fff' : 'var(--text-light)', transition: 'all 0.15s' }}>
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                {tab === 'PENDING' && pendingCount > 0 && (
                  <span style={{ marginLeft: 5, padding: '1px 5px', borderRadius: 10, background: filterStatus === tab ? 'rgba(255,255,255,0.25)' : '#FEF3C7', color: filterStatus === tab ? '#fff' : '#D97706', fontSize: '10px' }}>{pendingCount}</span>
                )}
              </button>
            ))}
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
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No corporate accounts{filterStatus !== 'ALL' ? ` with status ${filterStatus}` : ''}.</td></tr>
              ) : filtered.map((corp: any) => (
                <tr key={corp._id} style={{ borderBottom: '1px solid var(--border-color)', background: corp.status === 'PENDING' ? 'rgba(254,243,199,0.06)' : undefined }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Building2 size={13} color="#10B981" /> {corp.companyName}</span>
                    {corp.contactPerson?.name && <p style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: 400, marginTop: '2px' }}>{corp.contactPerson.name}{corp.contactPerson.designation ? ` · ${corp.contactPerson.designation}` : ''}</p>}
                    {corp.assignedDriverId && (
                      <p style={{ fontSize: '10px', color: '#3B82F6', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Car size={10} /> {typeof corp.assignedDriverId === 'object' ? (corp.assignedDriverId.name || 'Driver assigned') : 'Driver assigned'}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{corp.userId?.phone || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '11.5px', color: 'var(--text-light)' }}>{corp.billingEmail || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '11.5px', color: 'var(--text-light)', fontFamily: 'monospace' }}>{corp.gstNumber || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Users size={12} color="#3B82F6" /> {corp.employeeCount || 0} / {corp.employeeLimit}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <StatusBadge status={corp.status} />
                    {corp.rejectionReason && (
                      <p style={{ fontSize: '10px', color: '#DC2626', marginTop: 3, maxWidth: 120 }} title={corp.rejectionReason}>
                        {corp.rejectionReason.length > 30 ? corp.rejectionReason.slice(0, 30) + '…' : corp.rejectionReason}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Approve / Reject — only for PENDING accounts */}
                      {corp.status === 'PENDING' && (
                        <>
                          <button onClick={() => handleApprove(corp)} title="Approve" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #10B981', background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>
                            <Check size={11} /> Approve
                          </button>
                          <button onClick={() => openReject(corp)} title="Reject" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>
                            <XCircle size={11} /> Reject
                          </button>
                        </>
                      )}
                      {/* Assign driver — for ACTIVE accounts */}
                      {corp.status === 'ACTIVE' && (
                        <button onClick={() => openAssignDriver(corp)} title="Assign Driver" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #93C5FD', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>
                          <Car size={11} /> {corp.assignedDriverId ? 'Change Driver' : 'Assign Driver'}
                        </button>
                      )}
                      {/* Edit / Delete — always available */}
                      <button onClick={() => openEdit(corp)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 2 }} title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(corp._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2 }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-light)' }}>
          {filtered.length} corporate account{filtered.length !== 1 ? 's' : ''} shown
        </p>
      </div>

      {/* ── Create / Edit modal ──────────────────────────────────── */}
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

      {/* ── Reject confirmation modal ────────────────────────────── */}
      {rejectTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectTarget(null); }}
        >
          <div className="modal-card" style={{ maxWidth: '420px', width: '100%' }}>
            <div className="modal-header" style={{ padding: '18px 24px' }}>
              <h3 id="reject-modal-title" style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626' }}>
                <XCircle size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Reject {rejectTarget.companyName}?
              </h3>
              <button onClick={() => setRejectTarget(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-light)', marginBottom: 12 }}>
                The company will not be able to sign in. You can optionally provide a reason (visible internally).
              </p>
              <label style={fieldLabel}>Rejection Reason (Optional)</label>
              <textarea
                className="form-input"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Incomplete documentation"
                style={{ width: '100%', fontSize: '12px', padding: '10px 12px', resize: 'vertical', marginTop: 4, boxSizing: 'border-box' }}
              />
            </div>
            <div className="modal-footer" style={{ padding: '14px 24px' }}>
              <button onClick={() => setRejectTarget(null)} className="btn btn-secondary" style={{ padding: '9px 18px', fontSize: '12px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleReject} className="btn" style={{ padding: '9px 18px', fontSize: '12px', borderRadius: '8px', background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Driver modal ──────────────────────────────────── */}
      {assignTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setAssignTarget(null); }}
        >
          <div className="modal-card" style={{ maxWidth: '400px', width: '100%' }}>
            <div className="modal-header" style={{ padding: '18px 24px' }}>
              <h3 id="assign-modal-title" style={{ fontSize: '16px', fontWeight: 800 }}>
                <Car size={15} style={{ marginRight: 6, verticalAlign: 'middle', color: '#3B82F6' }} />
                Assign Driver — {assignTarget.companyName}
              </h3>
              <button onClick={() => setAssignTarget(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-light)', marginBottom: 12 }}>
                Assign a dedicated driver to service this company&apos;s employees. This is metadata only — subscription-level driver assignment remains separate.
              </p>
              <label style={fieldLabel}>Select Driver</label>
              <select
                className="form-input"
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                style={{ width: '100%', fontSize: '12px', padding: '10px 12px', marginTop: 4 }}
              >
                <option value="">— Choose a driver —</option>
                {activeDrivers.map((d: any) => (
                  <option key={d._id} value={d._id}>
                    {d.name}{d.vehicleNumber ? ` · ${d.vehicleNumber}` : ''}
                  </option>
                ))}
              </select>
              {activeDrivers.length === 0 && (
                <p style={{ fontSize: '11px', color: '#EF4444', marginTop: 6 }}>No active drivers available. Create a driver first.</p>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '14px 24px' }}>
              <button onClick={() => setAssignTarget(null)} className="btn btn-secondary" style={{ padding: '9px 18px', fontSize: '12px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleAssignDriver} disabled={!selectedDriver} className="btn btn-primary" style={{ padding: '9px 18px', fontSize: '12px', borderRadius: '8px', opacity: selectedDriver ? 1 : 0.5, cursor: selectedDriver ? 'pointer' : 'not-allowed' }}>
                Assign Driver
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
