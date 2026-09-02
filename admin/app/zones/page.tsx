'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useZones, useCreateZone, useUpdateZone, useDeleteZone, useAssignAreasToZone, useAreas } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Layers, MapPin, Users } from 'lucide-react';

export default function ZonesPage() {
  useAuthGuard();
  const { data, isLoading } = useZones();
  const { data: areasData } = useAreas();
  const createZone = useCreateZone();
  const updateZone = useUpdateZone();
  const deleteZone = useDeleteZone();
  const assignAreas = useAssignAreasToZone();

  const zones = data?.success ? (data.data || []) : [];
  const areas = areasData?.success ? (areasData.data || []) : [];

  const [showModal, setShowModal] = useState(false);
  const [editingZone, setEditingZone] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', description: '', status: 'ACTIVE' });

  // Assign-areas panel
  const [assignZone, setAssignZone] = useState<any>(null);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowModal(false); setAssignZone(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openCreate = () => {
    setEditingZone(null);
    setFormData({ name: '', description: '', status: 'ACTIVE' });
    setShowModal(true);
  };

  const openEdit = (zone: any) => {
    setEditingZone(zone);
    setFormData({ name: zone.name || '', description: zone.description || '', status: zone.status || 'ACTIVE' });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editingZone) {
        await updateZone.mutateAsync({ id: editingZone._id, data: formData });
      } else {
        await createZone.mutateAsync(formData);
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save zone');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this zone? Its areas and drivers will be detached (not deleted).')) return;
    try {
      await deleteZone.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete zone');
    }
  };

  const openAssign = (zone: any) => {
    setAssignZone(zone);
    // Pre-select areas already in this zone
    const inZone = areas.filter((a: any) => (a.zoneId?._id || a.zoneId) === zone._id).map((a: any) => a._id);
    setSelectedAreaIds(inZone);
  };

  const toggleArea = (id: string) => {
    setSelectedAreaIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const saveAssign = async () => {
    try {
      await assignAreas.mutateAsync({ id: assignZone._id, areaIds: selectedAreaIds });
      setAssignZone(null);
    } catch (err: any) {
      alert(err.message || 'Failed to assign areas');
    }
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Zones</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Group areas into zones. Drivers belong to a zone and serve every area within it.</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>
            <Plus size={14} /> Add Zone
          </button>
        </div>

        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {['Code', 'Zone', 'Areas', 'Drivers', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '14px 18px', textAlign: 'left', fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading zones...</td></tr>
              ) : zones.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No zones yet. Create one to group your areas.</td></tr>
              ) : zones.map((zone: any) => (
                <tr key={zone._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '12px', fontWeight: 800, color: '#2563EB', fontFamily: 'monospace' }}>{zone.code || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Layers size={13} color="#3B82F6" /> {zone.name}</span>
                    {zone.description && <p style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: 400, marginTop: '2px' }}>{zone.description}</p>}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} color="#10B981" /> {zone.areaCount || 0}</span>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Users size={12} color="#F59E0B" /> {zone.driverCount || 0}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${zone.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>{zone.status}</span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button onClick={() => openAssign(zone)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', fontSize: '11px', fontWeight: 700, padding: 0 }} title="Assign areas">Assign Areas</button>
                      <button onClick={() => openEdit(zone)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(zone._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Zone modal */}
      {showModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>{editingZone ? 'Edit Zone' : 'Create Zone'}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Zone Name</label>
                <input className="form-input" placeholder="e.g. South Bengaluru" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Description</label>
                <input className="form-input" placeholder="Optional" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase' }}>Status</label>
                <select className="form-input" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ fontSize: '12px', padding: '10px 12px' }}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              {!editingZone && <p style={{ fontSize: '11px', color: 'var(--text-light)' }}>A zone code (Z1, Z2, ...) is generated automatically.</p>}
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>{editingZone ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign areas panel */}
      {assignZone && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setAssignZone(null); }}>
          <div className="modal-card" style={{ maxWidth: '460px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Assign Areas → {assignZone.name}</h3>
              <button onClick={() => setAssignZone(null)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
              {areas.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>No areas exist yet. Create areas first.</p>
              ) : areas.map((area: any) => {
                const checked = selectedAreaIds.includes(area._id);
                const otherZone = area.zoneId && (area.zoneId._id || area.zoneId) !== assignZone._id ? (area.zoneId.name || 'another zone') : null;
                return (
                  <label key={area._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleArea(area._id)} />
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-main)', fontWeight: 600 }}>{area.name}</span>
                    {otherZone && <span style={{ fontSize: '10px', color: '#F59E0B' }}>in {otherZone}</span>}
                  </label>
                );
              })}
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => setAssignZone(null)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={saveAssign} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>Save ({selectedAreaIds.length})</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
