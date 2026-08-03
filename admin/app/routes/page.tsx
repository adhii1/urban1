'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useRoutes, useCreateRoute, useUpdateRoute, useDeleteRoute } from '../../lib/hooks/useAdminQueries';
import { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, Crosshair } from 'lucide-react';
import StopMapPicker, { type PickerStop } from '../../components/StopMapPicker';

type FormStop = PickerStop;

const emptyForm = {
  name: '',
  startLocation: '',
  endLocation: '',
};

export default function RoutesPage() {
  useAuthGuard();
  const { data, isLoading } = useRoutes();
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute();
  const deleteRoute = useDeleteRoute();
  const routes = data?.success ? (data.data || data.routes || []) : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [stops, setStops] = useState<FormStop[]>([]);
  const [selectedStop, setSelectedStop] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Escape key modal close event listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showModal]);

  const filtered = routes.filter((r: any) =>
    (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.startLocation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.endLocation || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stopsFromRoute = (route: any): FormStop[] => {
    if (!Array.isArray(route.stops)) return [];
    return route.stops.map((s: any) => {
      const coords = s.location?.coordinates || s.coordinates || [];
      return {
        name: s.stopName || s.name || '',
        lat: typeof coords[1] === 'number' ? coords[1] : null,
        lng: typeof coords[0] === 'number' ? coords[0] : null,
      };
    });
  };

  const openCreate = () => {
    setEditingRoute(null);
    setForm(emptyForm);
    setStops([]);
    setSelectedStop(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (route: any) => {
    setEditingRoute(route);
    setForm({
      name: route.name || '',
      startLocation: route.startLocation || '',
      endLocation: route.endLocation || '',
    });
    setStops(stopsFromRoute(route));
    setSelectedStop(null);
    setError('');
    setShowModal(true);
  };

  const addStop = () => {
    setStops((prev) => [...prev, { name: '', lat: null, lng: null }]);
    setSelectedStop(stops.length);
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
    setSelectedStop(null);
  };

  const updateStop = (index: number, patch: Partial<FormStop>) => {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const onMapClick = (lat: number, lng: number) => {
    if (selectedStop == null) return;
    setStops((prev) =>
      prev.map((s, i) => (i === selectedStop ? { ...s, lat, lng } : s)),
    );
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('Route name is required.');
      return;
    }
    for (const s of stops) {
      if (s.name.trim() && (s.lat == null || s.lng == null)) {
        setError(`Stop "${s.name}" is missing coordinates. Click "Pick on map" to set them.`);
        return;
      }
    }
    const validStops = stops.filter((s) => s.name.trim() && s.lat != null && s.lng != null);
    const payload = {
      name: form.name,
      startLocation: form.startLocation,
      endLocation: form.endLocation,
      stops: validStops.map((s, i) => ({
        stopName: s.name.trim(),
        sequenceOrder: i + 1,
        location: {
          type: 'Point',
          coordinates: [s.lng as number, s.lat as number],
        },
      })),
    };
    setSaving(true);
    try {
      if (editingRoute) {
        await updateRoute.mutateAsync({ id: editingRoute._id || editingRoute.id, data: payload });
      } else {
        await createRoute.mutateAsync(payload);
      }
      setShowModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save route');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this route?')) return;
    try {
      await deleteRoute.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete route');
    }
  };

  const columns = ['Name', 'Start', 'End', 'Stops', 'Assigned Driver', 'Status', 'Actions'];

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Routes Management</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Define and manage commuter routes and stops</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Add Route
          </button>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search routes..."
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
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading routes...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No routes found.</td></tr>
              ) : filtered.map((r: any) => (
                <tr key={r._id || r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{r.name}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{r.startLocation || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{r.endLocation || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{Array.isArray(r.stops) ? r.stops.length : (r.stops || 0)} stops</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>{r.assignedDriver?.name || r.assignedDriver || '-'}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${r.isActive !== false ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                      {r.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(r._id || r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Delete">
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
          aria-labelledby="route-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 id="route-modal-title" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                  {editingRoute ? 'Configure Transit Route' : 'Establish New Transit Route'}
                </h3>
                <p style={{ fontSize: '11.5px', color: 'var(--text-light)', marginTop: '2px' }}>
                  Define the endpoints, stops timeline, and geographic coordinate mapping
                </p>
              </div>
              <button onClick={() => setShowModal(false)} aria-label="Close modal" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: '6px' }}><X size={18} /></button>
            </div>

            <div className="modal-body custom-scrollbar">
              {error && (
                <div role="alert" aria-live="assertive" style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', color: '#EF4444', fontSize: '12px', marginBottom: '16px', fontWeight: 500 }}>
                  {error}
                </div>
              )}

              <div className="route-modal-grid">
                
                {/* Left Side: General Fields & Stops list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* General Route Details Card */}
                  <div style={{ padding: '16px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                    <h4 style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-light)', marginBottom: '12px', letterSpacing: '0.5px' }}>
                      Route Specifications
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label id="lbl-route-name" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Route Name</label>
                        <input aria-labelledby="lbl-route-name" className="form-input" placeholder="e.g. Indiranagar to Whitefield ORR Express"
                          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                          style={{ fontSize: '12.5px', padding: '10px 12px' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label id="lbl-start-loc" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start Point</label>
                          <input aria-labelledby="lbl-start-loc" className="form-input" placeholder="e.g. Indiranagar Metro"
                            value={form.startLocation} onChange={(e) => setForm({ ...form, startLocation: e.target.value })}
                            style={{ fontSize: '12.5px', padding: '10px 12px' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label id="lbl-end-loc" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>End Point</label>
                          <input aria-labelledby="lbl-end-loc" className="form-input" placeholder="e.g. ITPL Gate 2"
                            value={form.endLocation} onChange={(e) => setForm({ ...form, endLocation: e.target.value })}
                            style={{ fontSize: '12.5px', padding: '10px 12px' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stops Timeline Section */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <h4 style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-light)', letterSpacing: '0.5px' }}>
                        Stops Sequence ({stops.length})
                      </h4>
                      <button onClick={addStop} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Plus size={12} aria-hidden="true" /> Add transit stop
                      </button>
                    </div>

                    {stops.length === 0 && (
                      <div style={{ padding: '24px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-light)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                        No route stops created. Click "Add transit stop" to build the pathway.
                      </div>
                    )}

                    <div style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: '6px' }} className="custom-scrollbar">
                      {stops.map((s, i) => (
                        <div key={i} style={{
                          display: 'flex',
                          gap: '12px',
                          padding: '14px 16px',
                          background: selectedStop === i ? 'rgba(16, 185, 129, 0.03)' : 'var(--bg-hover)',
                          border: `1px solid ${selectedStop === i ? 'var(--color-primary)' : 'var(--border-color)'}`,
                          borderRadius: '12px',
                          marginBottom: '12px',
                          position: 'relative',
                          transition: 'var(--transition-smooth)'
                        }}>
                          {/* Vertical route path indicator line */}
                          {i < stops.length - 1 && (
                            <div style={{
                              position: 'absolute',
                              left: '27px',
                              top: '40px',
                              bottom: '-20px',
                              width: '2px',
                              background: 'var(--border-color)',
                              zIndex: 1
                            }} />
                          )}

                          {/* Stop Number Circle */}
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: selectedStop === i ? 'var(--color-primary)' : 'var(--border-color)',
                            color: selectedStop === i ? '#FFF' : 'var(--text-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 800,
                            zIndex: 2,
                            marginTop: '6px'
                          }}>{i + 1}</div>

                          {/* Form fields for single Stop */}
                          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input 
                                aria-label={`Stop ${i + 1} Name`} 
                                className="form-input" 
                                placeholder={`Stop #${i + 1} Name`}
                                value={s.name} 
                                onChange={(e) => updateStop(i, { name: e.target.value })}
                                style={{ fontSize: '12px', padding: '8px 12px' }} 
                              />
                              
                              <button
                                onClick={() => setSelectedStop(selectedStop === i ? null : i)}
                                title="Set location by clicking map"
                                className="btn"
                                style={{
                                  padding: '8px 12px', 
                                  fontSize: '11px', 
                                  borderRadius: '8px',
                                  border: '1px solid var(--border-color)',
                                  background: selectedStop === i ? 'var(--color-primary)' : 'transparent',
                                  color: selectedStop === i ? '#FFF' : 'var(--text-light)',
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px',
                                }}
                              >
                                <Crosshair size={12} />
                                <span>{selectedStop === i ? 'Placing...' : 'Pick'}</span>
                              </button>
                              
                              <button 
                                onClick={() => removeStop(i)} 
                                aria-label={`Delete Stop ${i + 1}`} 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '6px' }}
                                title="Remove stop"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            {/* Dual coordinates entry */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div>
                                <label style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Latitude</label>
                                <input 
                                  aria-label={`Stop ${i + 1} Latitude`} 
                                  className="form-input" 
                                  type="number" 
                                  step="0.000001" 
                                  placeholder="e.g. 12.97159"
                                  value={s.lat ?? ''} 
                                  onChange={(e) => updateStop(i, { lat: e.target.value === '' ? null : Number(e.target.value) })}
                                  style={{ fontSize: '11px', padding: '6px 10px', marginTop: '2px' }} 
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Longitude</label>
                                <input 
                                  aria-label={`Stop ${i + 1} Longitude`} 
                                  className="form-input" 
                                  type="number" 
                                  step="0.000001" 
                                  placeholder="e.g. 77.59456"
                                  value={s.lng ?? ''} 
                                  onChange={(e) => updateStop(i, { lng: e.target.value === '' ? null : Number(e.target.value) })}
                                  style={{ fontSize: '11px', padding: '6px 10px', marginTop: '2px' }} 
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Map Picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Route Stops Visualizer & Picker
                  </label>
                  
                  <div style={{ position: 'relative', flexGrow: 1, minHeight: '380px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    {stops.length > 0 ? (
                      <StopMapPicker
                        stops={stops}
                        selectedIndex={selectedStop}
                        onSelect={() => {}}
                        onMapClick={onMapClick}
                        height={420}
                      />
                    ) : (
                      <div style={{ 
                        height: '420px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        background: 'var(--bg-app)', 
                        border: '1px dashed var(--border-color)',
                        color: 'var(--text-light)',
                        borderRadius: '12px',
                        fontSize: '12.5px'
                      }}>
                        Add stops to activate the interactive map visualizer.
                      </div>
                    )}

                    {/* Floating Command Center Overlay */}
                    {stops.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        right: '12px',
                        background: 'rgba(9, 13, 22, 0.85)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-block',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: selectedStop !== null ? '#F59E0B' : '#10B981',
                          }} className={selectedStop !== null ? "pulse-dot" : ""} />
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#FFF', letterSpacing: '0.3px' }}>
                            {selectedStop !== null 
                              ? `MAPPING STOP #${selectedStop + 1}: ${stops[selectedStop]?.name || 'Unnamed'}` 
                              : 'MAP CONTROLLER ACTIVE'}
                          </span>
                        </div>
                        <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700 }}>
                          {selectedStop !== null ? 'Click map to place' : 'Click "Pick" to position'}
                        </span>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-light)', lineHeight: '1.4' }}>
                    {selectedStop != null
                      ? `🎯 Click anywhere on the Google Map above to record the latitude/longitude coordinates for Stop #${selectedStop + 1} ("${stops[selectedStop]?.name || 'Unnamed'}").`
                      : '💡 To set coordinates, click the "Pick" button next to any stop, then select its position on the map.'}
                  </p>
                </div>

              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
                {saving ? 'Saving...' : (editingRoute ? 'Update Route' : 'Create Route')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
