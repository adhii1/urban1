'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver, useAreas, useZones } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, Download } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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
  const [formData, setFormData] = useState({
    name: '', phone: '', password: '', vehicleNumber: '', vehicleModel: '', vehicleCapacity: '', licenseNumber: '', areaId: '', zoneId: '', upiId: '',
    accountHolderName: '', accountNumber: '', ifsc: '',
  });

  const filtered = drivers.filter((d: any) =>
    (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.userId?.phone || '').includes(searchTerm) ||
    (d.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    setFormData({ name: '', phone: '', password: '', vehicleNumber: '', vehicleModel: '', vehicleCapacity: '', licenseNumber: '', areaId: '', zoneId: '', upiId: '', accountHolderName: '', accountNumber: '', ifsc: '' });
    setShowModal(true);
  };

  const openEdit = (driver: any) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name || '',
      phone: driver.userId?.phone || '',
      password: '',
      vehicleNumber: driver.vehicleNumber || '',
      vehicleModel: driver.vehicleModel || '',
      vehicleCapacity: driver.vehicleCapacity?.toString() || '',
      licenseNumber: driver.licenseNumber || '',
      areaId: driver.areaId?._id || driver.areaId || '',
      zoneId: driver.zoneId?._id || driver.zoneId || '',
      upiId: driver.upiId || '',
      accountHolderName: driver.bankDetails?.accountHolderName || '',
      accountNumber: driver.bankDetails?.accountNumber || '',
      ifsc: driver.bankDetails?.ifsc || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const bankDetails = {
        accountHolderName: formData.accountHolderName || '',
        accountNumber: formData.accountNumber || '',
        ifsc: formData.ifsc || '',
      };
      if (editingDriver) {
        const { phone, password, accountHolderName, accountNumber, ifsc, ...updateData } = formData;
        const payload: any = {
          ...updateData,
          vehicleCapacity: Number(updateData.vehicleCapacity) || 4,
          areaId: updateData.areaId || null,
          zoneId: updateData.zoneId || null,
          upiId: updateData.upiId || '',
          bankDetails,
        };
        if (password && password.trim().length > 0) {
          payload.password = password.trim();
        }
        await updateDriver.mutateAsync({ id: editingDriver._id || editingDriver.id, data: payload });
      } else {
        const { accountHolderName, accountNumber, ifsc, ...rest } = formData;
        const payload: any = {
          ...rest,
          vehicleCapacity: Number(formData.vehicleCapacity) || 4,
          areaId: formData.areaId || undefined,
          zoneId: formData.zoneId || undefined,
          upiId: formData.upiId || undefined,
          bankDetails,
        };
        if (!payload.areaId) delete payload.areaId;
        if (!payload.zoneId) delete payload.zoneId;
        if (!payload.upiId) delete payload.upiId;
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
          <div className="modal-card" style={{ maxWidth: '450px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 id="driver-modal-title" style={{ fontSize: '15px', fontWeight: 800 }}>{editingDriver ? 'Edit Driver Profile' : 'Register New Driver'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="field-name" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</label>
                <input id="field-name" type="text" className="form-input" placeholder="Driver full name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
              </div>

              {!editingDriver ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="field-phone" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone (username)</label>
                    <input id="field-phone" type="tel" className="form-input" placeholder="e.g. 9876543210" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="field-password" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                    <input id="field-password" type="password" className="form-input" placeholder="Min 6 characters" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor="field-password" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reset Password (Optional)</label>
                  <input id="field-password" type="password" className="form-input" placeholder="Leave empty to keep existing password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
                </div>
              )}

              {[
                { key: 'vehicleNumber', label: 'Vehicle Number', placeholder: 'e.g. KA51MB4321', type: 'text' },
                { key: 'vehicleModel', label: 'Vehicle Model', placeholder: 'e.g. Tata Nexon EV', type: 'text' },
                { key: 'vehicleCapacity', label: 'Capacity', placeholder: 'e.g. 4', type: 'number' },
                { key: 'licenseNumber', label: 'License Number', placeholder: 'Driving license ID', type: 'text' },
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="field-zoneId" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Zone (primary dispatch grouping)</label>
                <select
                  id="field-zoneId"
                  className="form-input"
                  value={formData.zoneId}
                  onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }}
                >
                  <option value="">No zone</option>
                  {zones.map((z: any) => (
                    <option key={z._id} value={z._id}>{z.code ? `${z.code} · ` : ''}{z.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="field-areaId" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Service Area (optional pin within zone)</label>
                <select
                  id="field-areaId"
                  className="form-input"
                  value={formData.areaId}
                  onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px' }}
                >
                  <option value="">No specific area</option>
                  {areas.map((area: any) => (
                    <option key={area._id} value={area._id}>{area.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="field-upiId" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>UPI ID (for payouts)</label>
                <input id="field-upiId" type="text" className="form-input" placeholder="e.g. ravi@okhdfcbank" value={formData.upiId} onChange={(e) => setFormData({ ...formData, upiId: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
              </div>

              {/* Bank details for payouts */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '2px' }}>
                <p style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Bank Details (payouts)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="field-accountHolderName" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Account Holder Name</label>
                    <input id="field-accountHolderName" type="text" className="form-input" placeholder="e.g. Ravi Kumar" value={formData.accountHolderName} onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="field-accountNumber" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Account Number</label>
                    <input id="field-accountNumber" type="text" className="form-input" placeholder="e.g. 123456789012" value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="field-ifsc" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>IFSC Code</label>
                    <input id="field-ifsc" type="text" className="form-input" placeholder="e.g. HDFC0001234" value={formData.ifsc} onChange={(e) => setFormData({ ...formData, ifsc: e.target.value.toUpperCase() })} style={{ fontSize: '12px', padding: '10px 12px' }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {editingDriver ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
