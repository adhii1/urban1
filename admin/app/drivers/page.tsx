'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X } from 'lucide-react';

export default function DriversPage() {
  useAuthGuard();
  const { data, isLoading } = useDrivers();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();
  const drivers = data?.success ? (data.data || data.drivers || []) : [];

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
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '', phone: '', vehicleNumber: '', vehicleModel: '', vehicleCapacity: '', licenseNumber: '', routeId: '',
  });

  const filtered = drivers.filter((d: any) =>
    (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.phone || '').includes(searchTerm) ||
    (d.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openCreate = () => {
    setEditingDriver(null);
    setFormData({ name: '', phone: '', vehicleNumber: '', vehicleModel: '', vehicleCapacity: '', licenseNumber: '', routeId: '' });
    setShowModal(true);
  };

  const openEdit = (driver: any) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name || '', phone: driver.phone || '', vehicleNumber: driver.vehicleNumber || '',
      vehicleModel: driver.vehicleModel || '', vehicleCapacity: driver.vehicleCapacity || '',
      licenseNumber: driver.licenseNumber || '', routeId: driver.routeId?._id || driver.routeId || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editingDriver) {
        await updateDriver.mutateAsync({ id: editingDriver._id || editingDriver.id, data: formData });
      } else {
        await createDriver.mutateAsync(formData);
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

  const columns = ['Name', 'Phone', 'Vehicle No.', 'Model', 'Capacity', 'License', 'Route', 'Status', 'Actions'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Drivers Management</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Manage driver profiles and vehicle assignments</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Add Driver
          </button>
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
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{driver.name}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{driver.phone}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)', fontFamily: 'monospace' }}>{driver.vehicleNumber || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{driver.vehicleModel || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{driver.vehicleCapacity || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12px', color: 'var(--text-light)', fontFamily: 'monospace' }}>{driver.licenseNumber || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{driver.routeId?.name || driver.routeId || '-'}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${driver.isActive !== false ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                      {driver.isActive !== false ? 'Active' : 'Inactive'}
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
              {[
                { key: 'name', label: 'Name', placeholder: 'Driver full name', type: 'text' },
                { key: 'phone', label: 'Phone', placeholder: 'e.g. 9876543210', type: 'tel' },
                { key: 'vehicleNumber', label: 'Vehicle Number', placeholder: 'e.g. KA51MB4321', type: 'text' },
                { key: 'vehicleModel', label: 'Vehicle Model', placeholder: 'e.g. Tata Nexon EV', type: 'text' },
                { key: 'vehicleCapacity', label: 'Capacity', placeholder: 'e.g. 4', type: 'number' },
                { key: 'licenseNumber', label: 'License Number', placeholder: 'Driving license ID', type: 'text' },
                { key: 'routeId', label: 'Route ID (Optional)', placeholder: 'Assigned route ID', type: 'text' },
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
                {editingDriver ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
