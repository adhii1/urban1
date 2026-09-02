'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useAreas, useCreateArea, useUpdateArea, useDeleteArea, useZones } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, MapPin } from 'lucide-react';

export default function AreasPage() {
  useAuthGuard();
  const { data, isLoading } = useAreas();
  const { data: zonesData } = useZones();
  const createArea = useCreateArea();
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();
  const areas = data?.success ? (data.data || []) : [];
  const zones = zonesData?.success ? (zonesData.data || []) : [];

  const [showModal, setShowModal] = useState(false);
  const [editingArea, setEditingArea] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', lat: '', lng: '', radiusKm: '5', zoneId: '' });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    if (showModal) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const openCreate = () => {
    setEditingArea(null);
    setFormData({ name: '', lat: '', lng: '', radiusKm: '5', zoneId: '' });
    setShowModal(true);
  };

  const openEdit = (area: any) => {
    setEditingArea(area);
    setFormData({
      name: area.name || '',
      lat: area.center?.coordinates?.[1]?.toString() || '',
      lng: area.center?.coordinates?.[0]?.toString() || '',
      radiusKm: area.radiusKm?.toString() || '5',
      zoneId: area.zoneId?._id || area.zoneId || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name,
      center: { coordinates: [parseFloat(formData.lng), parseFloat(formData.lat)] },
      radiusKm: parseFloat(formData.radiusKm),
      zoneId: formData.zoneId || null,
    };
    try {
      if (editingArea) {
        await updateArea.mutateAsync({ id: editingArea._id, data: payload });
      } else {
        await createArea.mutateAsync(payload);
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save area');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this area? Drivers assigned here will be unassigned.')) return;
    try {
      await deleteArea.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete area');
    }
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Service Areas</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Define geographic zones and assign drivers for automatic dispatch</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Add Area
          </button>
        </div>

        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {['Name', 'Zone', 'Center (Lat, Lng)', 'Radius', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '14px 18px', textAlign: 'left', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading areas...</td></tr>
              ) : areas.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No service areas defined yet.</td></tr>
              ) : areas.map((area: any) => (
                <tr key={area._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={13} color="#10B981" /> {area.name}</span>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12px', color: 'var(--text-light)' }}>
                    {area.zoneId?.name ? (
                      <span className="badge" style={{ fontSize: '9px', padding: '2px 8px', background: 'rgba(59,130,246,0.1)', color: '#2563EB' }}>
                        {area.zoneId.code ? `${area.zoneId.code} · ` : ''}{area.zoneId.name}
                      </span>
                    ) : <span style={{ color: 'var(--text-light)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12px', color: 'var(--text-light)', fontFamily: 'monospace' }}>
                    {area.center?.coordinates?.[1]?.toFixed(4)}, {area.center?.coordinates?.[0]?.toFixed(4)}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{area.radiusKm} km</td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${area.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                      {area.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openEdit(area)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(area._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="area-modal-title" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 id="area-modal-title" style={{ fontSize: '15px', fontWeight: 800 }}>{editingArea ? 'Edit Area' : 'Create Service Area'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { key: 'name', label: 'Area Name', placeholder: 'e.g. HSR Layout', type: 'text' },
                { key: 'lat', label: 'Center Latitude', placeholder: 'e.g. 12.9141', type: 'text' },
                { key: 'lng', label: 'Center Longitude', placeholder: 'e.g. 77.6501', type: 'text' },
                { key: 'radiusKm', label: 'Radius (km)', placeholder: 'e.g. 5', type: 'number' },
              ].map((field) => (
                <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor={`area-${field.key}`} style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{field.label}</label>
                  <input
                    id={`area-${field.key}`}
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
                <label htmlFor="area-zone" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Zone</label>
                <select
                  id="area-zone"
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
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {editingArea ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
