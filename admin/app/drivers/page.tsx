'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver, useAreas, useZones } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, Download, UploadCloud } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// --- Shared styles for the driver form ---
const sectionHeading: React.CSSProperties = { fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '14px' };
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' };
const fieldLabel: React.CSSProperties = { fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const inputStyle: React.CSSProperties = { fontSize: '12px', padding: '10px 12px' };

// Reusable labelled text input.
function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={fieldLabel}>{label}</label>
      <input type={type} className="form-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

export default function DriversPage() {
  useAuthGuard();
  const { data, isLoading } = useDrivers();
  const { data: areasData } = useAreas();
  const { data: zonesData } = useZones();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();
  const drivers = data?.success ? (data.data || data.drivers || []) : [];
  const areas = areasData?.success ? (areasData.data || []) : [];
  const zones = zonesData?.success ? (zonesData.data || []) : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    if (showModal) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const [editingDriver, setEditingDriver] = useState<any>(null);
  const emptyForm = {
    // Owner
    ownerName: '', ownerPhone: '',
    accountNumber: '', ifsc: '', accountHolderName: '', bankName: '', proofUrl: '',
    // Driver
    name: '', phone: '', password: '', vehicleModel: '', vehicleNumber: '', vehicleCapacity: '', licenseNumber: '',
    zoneId: '', areaId: '', upiId: '',
  };
  const [formData, setFormData] = useState(emptyForm);

  const filtered = drivers.filter((d: any) =>
    (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.userId?.phone || '').includes(searchTerm) ||
    (d.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [proofFileName, setProofFileName] = useState('');
  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('File must be under 5 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setProofFileName(file.name);
      // Store as a data URL so it persists without a separate upload endpoint.
      setFormData((prev) => ({ ...prev, proofUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      // Auth is cookie-based; fetch the CSV then trigger a browser download.
      const res = await fetch(`${API_BASE_URL}/admin/drivers/export`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drivers-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Failed to export drivers');
    } finally {
      setExporting(false);
    }
  };

  const openCreate = () => {
    setEditingDriver(null);
    setFormData(emptyForm);
    setProofFileName('');
    setShowModal(true);
  };

  const openEdit = (driver: any) => {
    setEditingDriver(driver);
    setProofFileName(driver.bankDetails?.proofUrl ? 'Existing proof on file' : '');
    setFormData({
      ownerName: driver.owner?.name || '',
      ownerPhone: driver.owner?.phone || '',
      accountNumber: driver.bankDetails?.accountNumber || '',
      ifsc: driver.bankDetails?.ifsc || '',
      accountHolderName: driver.bankDetails?.accountHolderName || '',
      bankName: driver.bankDetails?.bankName || '',
      proofUrl: driver.bankDetails?.proofUrl || '',
      name: driver.name || '',
      phone: driver.userId?.phone || '',
      password: '',
      vehicleModel: driver.vehicleModel || '',
      vehicleNumber: driver.vehicleNumber || '',
      vehicleCapacity: driver.vehicleCapacity?.toString() || '',
      licenseNumber: driver.licenseNumber || '',
      zoneId: driver.zoneId?._id || driver.zoneId || '',
      areaId: driver.areaId?._id || driver.areaId || '',
      upiId: driver.upiId || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const owner = { name: formData.ownerName || '', phone: formData.ownerPhone || '' };
      const bankDetails = {
        accountHolderName: formData.accountHolderName || '',
        accountNumber: formData.accountNumber || '',
        ifsc: formData.ifsc || '',
        bankName: formData.bankName || '',
        proofUrl: formData.proofUrl || '',
      };
      const core = {
        name: formData.name,
        vehicleModel: formData.vehicleModel,
        vehicleNumber: formData.vehicleNumber,
        vehicleCapacity: Number(formData.vehicleCapacity) || 4,
        licenseNumber: formData.licenseNumber,
        upiId: formData.upiId || '',
        owner,
        bankDetails,
      };

      if (editingDriver) {
        const payload: any = {
          ...core,
          areaId: formData.areaId || null,
          zoneId: formData.zoneId || null,
        };
        if (formData.password && formData.password.trim().length > 0) {
          payload.password = formData.password.trim();
        }
        await updateDriver.mutateAsync({ id: editingDriver._id || editingDriver.id, data: payload });
      } else {
        const payload: any = {
          ...core,
          phone: formData.phone,
          password: formData.password,
        };
        if (formData.areaId) payload.areaId = formData.areaId;
        if (formData.zoneId) payload.zoneId = formData.zoneId;
        await createDriver.mutateAsync(payload);
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save driver');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this driver?')) return;
    try {
      await deleteDriver.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete driver');
    }
  };

  const columns = ['Driver ID', 'Name', 'Phone', 'Vehicle No.', 'Capacity', 'Zone', 'Area', 'UPI', 'Status', 'Actions'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Drivers Management</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Register drivers (phone + password) and assign them to service areas</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleExport} disabled={exporting} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} /> {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
            <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
              <Plus size={14} /> Add Driver
            </button>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search drivers by name, phone or vehicle..."
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
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading drivers...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No drivers found.</td></tr>
              ) : filtered.map((driver: any) => (
                <tr key={driver._id || driver.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '12px', fontWeight: 800, color: '#2563EB', fontFamily: 'monospace' }}>{driver.driverCode || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{driver.name}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{driver.userId?.phone || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)', fontFamily: 'monospace' }}>{driver.vehicleNumber || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{driver.vehicleCapacity || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12px' }}>
                    {driver.zoneId?.name ? (
                      <span className="badge" style={{ fontSize: '9px', padding: '2px 8px', background: 'rgba(59,130,246,0.1)', color: '#2563EB' }}>{driver.zoneId.code ? `${driver.zoneId.code}` : driver.zoneId.name}</span>
                    ) : <span style={{ color: 'var(--text-light)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{driver.areaId?.name || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '11.5px', color: 'var(--text-light)', fontFamily: 'monospace' }}>{driver.upiId || '—'}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${driver.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                      {driver.status || 'Unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openEdit(driver)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(driver._id || driver.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-light)' }}>
          {filtered.length} driver{filtered.length !== 1 ? 's' : ''} total
        </p>
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="driver-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal-card" style={{ maxWidth: '640px', width: '100%' }}>
            <div className="modal-header" style={{ padding: '18px 24px' }}>
              <h3 id="driver-modal-title" style={{ fontSize: '18px', fontWeight: 800 }}>{editingDriver ? 'Edit Driver Profile' : 'Register New Driver'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={20} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* ===== OWNER DETAILS ===== */}
              <section>
                <p style={sectionHeading}>Owner Details</p>
                <div style={twoCol}>
                  <Field label="Owner Name" placeholder="e.g. Ramesh Kumar" value={formData.ownerName} onChange={(v) => setFormData({ ...formData, ownerName: v })} />
                  <Field label="Owner Phone Number" placeholder="e.g. 9876543210" type="tel" value={formData.ownerPhone} onChange={(v) => setFormData({ ...formData, ownerPhone: v })} />
                  <Field label="Bank Account Number" placeholder="e.g. 123456789012" value={formData.accountNumber} onChange={(v) => setFormData({ ...formData, accountNumber: v })} />
                  <Field label="IFSC Code" placeholder="e.g. HDFC0001234" value={formData.ifsc} onChange={(v) => setFormData({ ...formData, ifsc: v.toUpperCase() })} />
                  <Field label="Bank Account Holder Name" placeholder="e.g. Ramesh Kumar" value={formData.accountHolderName} onChange={(v) => setFormData({ ...formData, accountHolderName: v })} />
                  <Field label="Bank Name" placeholder="e.g. HDFC Bank" value={formData.bankName} onChange={(v) => setFormData({ ...formData, bankName: v })} />
                </div>

                {/* Bank account proof upload */}
                <div style={{ marginTop: '14px' }}>
                  <label style={fieldLabel}>Bank Account Proof (Optional)</label>
                  <label htmlFor="field-proof" style={{
                    marginTop: '6px', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px',
                    border: '1px dashed var(--border-color)', borderRadius: '10px', cursor: 'pointer',
                  }}>
                    <UploadCloud size={22} color="var(--text-light)" />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {proofFileName || 'Upload bank statement / passbook / cheque'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '2px' }}>PNG, JPG or PDF (Max 5 MB)</div>
                    </div>
                    <input id="field-proof" type="file" accept=".png,.jpg,.jpeg,.pdf" style={{ display: 'none' }} onChange={handleProofUpload} />
                  </label>
                </div>
              </section>

              {/* ===== DRIVER DETAILS ===== */}
              <section>
                <p style={sectionHeading}>Driver Details</p>
                <div style={twoCol}>
                  <Field label="Driver Name" placeholder="e.g. Suresh" value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} />
                  {!editingDriver ? (
                    <Field label="Driver Phone Number" placeholder="e.g. 9876543210" type="tel" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
                  ) : (
                    <Field label="Reset Password (Optional)" placeholder="Leave blank to keep" type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} />
                  )}
                </div>

                {!editingDriver && (
                  <div style={{ marginTop: '14px' }}>
                    <Field label="Password" placeholder="Min 6 characters" type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} />
                  </div>
                )}

                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <Field label="Vehicle Model" placeholder="e.g. Tata Nexon EV" value={formData.vehicleModel} onChange={(v) => setFormData({ ...formData, vehicleModel: v })} />
                  <Field label="Vehicle Number" placeholder="e.g. KA51MB4321" value={formData.vehicleNumber} onChange={(v) => setFormData({ ...formData, vehicleNumber: v.toUpperCase() })} />
                  <Field label="Capacity" placeholder="e.g. 4" type="number" value={formData.vehicleCapacity} onChange={(v) => setFormData({ ...formData, vehicleCapacity: v })} />
                  <Field label="License Number" placeholder="Driving license ID" value={formData.licenseNumber} onChange={(v) => setFormData({ ...formData, licenseNumber: v })} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={fieldLabel}>Zone (Primary Dispatch Grouping)</label>
                    <select className="form-input" value={formData.zoneId} onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })} style={inputStyle}>
                      <option value="">No zone</option>
                      {zones.map((z: any) => (<option key={z._id} value={z._id}>{z.code ? `${z.code} · ` : ''}{z.name}</option>))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={fieldLabel}>Service Area (Optional Pin Within Zone)</label>
                    <select className="form-input" value={formData.areaId} onChange={(e) => setFormData({ ...formData, areaId: e.target.value })} style={inputStyle}>
                      <option value="">No specific area</option>
                      {areas.map((area: any) => (<option key={area._id} value={area._id}>{area.name}</option>))}
                    </select>
                  </div>

                  <Field label="UPI ID (For Payouts)" placeholder="e.g. ravi@okhdfcbank" value={formData.upiId} onChange={(v) => setFormData({ ...formData, upiId: v })} />
                </div>
              </section>
            </div>
            <div className="modal-footer" style={{ padding: '14px 24px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: '12px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '12px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {editingDriver ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
