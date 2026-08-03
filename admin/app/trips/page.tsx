'use client';

import DashboardLayout from '../../components/DashboardLayout';
import { useAuthGuard } from '../../lib/hooks/useAuthGuard';
import { useTrips, useCreateTrip, useUpdateTrip, useReassignTrip, useRoutes, useDrivers, useCustomers } from '../../lib/hooks/useAdminQueries';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, RefreshCw, X, Trash2, ChevronDown, XCircle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'badge-info',
  IN_PROGRESS: 'badge-success',
  COMPLETED: 'badge-secondary',
  CANCELLED: 'badge-danger',
};

const DROPDOWN_BG = 'var(--bg-card-solid)';
const DROPDOWN_BORDER = 'var(--border-color)';
const DROPDOWN_HOVER = 'var(--bg-hover)';

function useDropdownPosition(ref: React.RefObject<HTMLDivElement | null>, isOpen: boolean) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const update = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [ref]);

  useEffect(() => {
    if (isOpen) {
      update();
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      return () => {
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      };
    }
  }, [isOpen, update]);

  return pos;
}

export default function TripsPage() {
  useAuthGuard();
  const { data, isLoading } = useTrips();
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const reassignTrip = useReassignTrip();
  const trips = data?.success ? (data.data || data.trips || []) : [];

  const { data: routesData } = useRoutes();
  const routes = routesData?.success ? (routesData.data || routesData.routes || []) : [];
  const { data: driversData } = useDrivers();
  const drivers = driversData?.success ? (driversData.data || driversData.drivers || []) : [];
  const { data: customersData } = useCustomers();
  const customers = customersData?.success ? (customersData.data || customersData.customers || []) : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [formData, setFormData] = useState({ routeId: '', driverId: '', tripDate: '', customerIds: [] as string[] });
  const [routeSearch, setRouteSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [openRouteDropdown, setOpenRouteDropdown] = useState(false);
  const [openDriverDropdown, setOpenDriverDropdown] = useState(false);
  const [reassignDriverSearch, setReassignDriverSearch] = useState('');
  const [openReassignDriverDropdown, setOpenReassignDriverDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [openCustomerDropdown, setOpenCustomerDropdown] = useState(false);
  const [reassignCustomerSearch, setReassignCustomerSearch] = useState('');
  const [openReassignCustomerDropdown, setOpenReassignCustomerDropdown] = useState(false);

  const routeDropdownRef = useRef<HTMLDivElement>(null);
  const driverDropdownRef = useRef<HTMLDivElement>(null);
  const reassignDriverDropdownRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const reassignCustomerDropdownRef = useRef<HTMLDivElement>(null);
  const routePanelRef = useRef<HTMLDivElement>(null);
  const driverPanelRef = useRef<HTMLDivElement>(null);
  const reassignDriverPanelRef = useRef<HTMLDivElement>(null);
  const customerPanelRef = useRef<HTMLDivElement>(null);
  const reassignCustomerPanelRef = useRef<HTMLDivElement>(null);

  const routePos = useDropdownPosition(routeDropdownRef, openRouteDropdown);
  const driverPos = useDropdownPosition(driverDropdownRef, openDriverDropdown);
  const reassignDriverPos = useDropdownPosition(reassignDriverDropdownRef, openReassignDriverDropdown);
  const customerPos = useDropdownPosition(customerDropdownRef, openCustomerDropdown);
  const reassignCustomerPos = useDropdownPosition(reassignCustomerDropdownRef, openReassignCustomerDropdown);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (routeDropdownRef.current && !routeDropdownRef.current.contains(target) && routePanelRef.current && !routePanelRef.current.contains(target)) setOpenRouteDropdown(false);
      if (driverDropdownRef.current && !driverDropdownRef.current.contains(target) && driverPanelRef.current && !driverPanelRef.current.contains(target)) setOpenDriverDropdown(false);
      if (reassignDriverDropdownRef.current && !reassignDriverDropdownRef.current.contains(target) && reassignDriverPanelRef.current && !reassignDriverPanelRef.current.contains(target)) setOpenReassignDriverDropdown(false);
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(target) && customerPanelRef.current && !customerPanelRef.current.contains(target)) setOpenCustomerDropdown(false);
      if (reassignCustomerDropdownRef.current && !reassignCustomerDropdownRef.current.contains(target) && reassignCustomerPanelRef.current && !reassignCustomerPanelRef.current.contains(target)) setOpenReassignCustomerDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredRoutes = routes.filter((r: any) => {
    const q = routeSearch.toLowerCase();
    return (r.name || '').toLowerCase().includes(q) ||
      (r.startLocation || '').toLowerCase().includes(q) ||
      (r.endLocation || '').toLowerCase().includes(q);
  });

  const filteredDrivers = drivers.filter((d: any) => {
    const q = driverSearch.toLowerCase();
    return (d.name || '').toLowerCase().includes(q) ||
      (d.phone || '').toLowerCase().includes(q) ||
      (d.email || '').toLowerCase().includes(q);
  });

  const filteredCustomers = customers.filter((c: any) => {
    const q = customerSearch.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q);
  });

  const filtered = trips.filter((t: any) => {
    const matchSearch = (t.routeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.driverName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreate = async () => {
    try {
      const payload = {
        routeId: formData.routeId,
        driverId: formData.driverId,
        tripDate: formData.tripDate,
        customerIds: formData.customerIds,
      };
      await createTrip.mutateAsync(payload);
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to create trip');
    }
  };

  const handleReassign = async () => {
    if (!selectedTrip) return;
    try {
      const payload = {
        driverId: formData.driverId,
        customerIds: formData.customerIds.length > 0 ? formData.customerIds : undefined,
      };
      await reassignTrip.mutateAsync({ id: selectedTrip._id || selectedTrip.id, data: payload });
      setShowReassignModal(false);
      setSelectedTrip(null);
    } catch (err: any) {
      alert(err.message || 'Failed to reassign trip');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this trip?')) return;
    try {
      await updateTrip.mutateAsync({ id, data: { status: 'CANCELLED' } });
    } catch (err: any) {
      alert(err.message || 'Failed to cancel trip');
    }
  };

  const openReassign = (trip: any) => {
    setSelectedTrip(trip);
    setFormData({ routeId: trip.routeId || '', driverId: '', tripDate: trip.tripDate || '', customerIds: [] });
    setShowReassignModal(true);
  };

  const closeAllDropdowns = () => {
    setOpenRouteDropdown(false);
    setOpenDriverDropdown(false);
    setOpenCustomerDropdown(false);
  };

  const closeAllReassignDropdowns = () => {
    setOpenReassignDriverDropdown(false);
    setOpenReassignCustomerDropdown(false);
  };

  const columns = ['Route', 'Driver', 'Date', 'Status', 'Passengers', 'Actions'];

  const dropdownPanelStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    background: DROPDOWN_BG,
    border: `1px solid ${DROPDOWN_BORDER}`,
    borderRadius: '10px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    maxHeight: '240px',
    overflow: 'hidden',
  };

  const dropdownItemStyle: React.CSSProperties = {
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '12px',
    borderBottom: `1px solid ${DROPDOWN_BORDER}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    transition: 'background 0.15s',
  };

  return (
    <DashboardLayout>
      <div className="fade-in">
        <div className="flex-between" style={{ marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Trip Management</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Create and manage commuter trips</p>
          </div>
          <button onClick={() => { setFormData({ routeId: '', driverId: '', tripDate: '', customerIds: [] }); setRouteSearch(''); setDriverSearch(''); setCustomerSearch(''); setShowModal(true); }}
            className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>
            <Plus size={14} /> Create Trip
          </button>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flexGrow: 1, minWidth: '200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search by route or driver..."
              className="form-input" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '34px', fontSize: '12.5px', height: '38px' }} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="form-input" style={{ width: 'auto', fontSize: '12px', padding: '8px 12px', height: '38px', cursor: 'pointer' }}>
            <option value="ALL">All Statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
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
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>Loading trips...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>No trips found.</td></tr>
              ) : filtered.map((t: any) => (
                <tr key={t._id || t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{t.routeName || t.routeId?.name || t.routeId || '-'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-main)' }}>{t.driverName || t.driverId?.name || t.driverId || 'Unassigned'}</td>
                  <td style={{ padding: '12px 18px', fontSize: '12.5px', color: 'var(--text-light)' }}>
                    {t.tripDate ? new Date(t.tripDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <span className={`badge ${STATUS_COLORS[t.status] || 'badge-secondary'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>{t.status}</span>
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{t.manifest?.length || t.customerIds?.length || t.passengerCount || 0}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {(t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS') && (
                        <button onClick={() => openReassign(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }} title="Reassign">
                          <RefreshCw size={14} />
                        </button>
                      )}
                      {(t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS') && (
                        <button onClick={() => handleCancel(t._id || t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 0 }} title="Cancel">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); closeAllDropdowns(); } }}>
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Create Trip</h3>
              <button onClick={() => { setShowModal(false); closeAllDropdowns(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Route Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }} ref={routeDropdownRef}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Route</label>
                <div onClick={() => setOpenRouteDropdown(!openRouteDropdown)}
                  className="form-input" style={{ fontSize: '12px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '40px' }}>
                  <span style={{ color: formData.routeId ? 'var(--text-main)' : 'var(--text-light)' }}>
                    {(() => {
                      const found = routes.find((r: any) => (r._id || r.id) === formData.routeId);
                      return found ? `${found.name} — ${found.startLocation} → ${found.endLocation}` : 'Unknown Route';
                    })()}
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                </div>
              </div>
              {/* Driver Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }} ref={driverDropdownRef}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Driver</label>
                <div onClick={() => setOpenDriverDropdown(!openDriverDropdown)}
                  className="form-input" style={{ fontSize: '12px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '40px' }}>
                  <span style={{ color: formData.driverId ? 'var(--text-main)' : 'var(--text-light)' }}>
                    {formData.driverId
                      ? drivers.find((d: any) => (d._id || d.id) === formData.driverId)
                        ? `${drivers.find((d: any) => (d._id || d.id) === formData.driverId).name}${drivers.find((d: any) => (d._id || d.id) === formData.driverId).phone ? ` — ${drivers.find((d: any) => (d._id || d.id) === formData.driverId).phone}` : ''}`
                        : formData.driverId
                      : 'Search or select a driver...'}
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trip Date</label>
                <input className="form-input" type="date"
                  value={formData.tripDate} onChange={(e) => setFormData({ ...formData, tripDate: e.target.value })}
                  style={{ fontSize: '12px', padding: '10px 12px', colorScheme: 'dark' }} />
              </div>
              {/* Customer Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }} ref={customerDropdownRef}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customers</label>
                <div onClick={() => setOpenCustomerDropdown(!openCustomerDropdown)}
                  className="form-input" style={{ fontSize: '12px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '40px', flexWrap: 'wrap', gap: '4px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, minWidth: 0 }}>
                    {formData.customerIds.length === 0 ? (
                      <span style={{ color: 'var(--text-light)' }}>Search or select customers...</span>
                    ) : formData.customerIds.map((cid: string) => {
                      const c = customers.find((cu: any) => (cu._id || cu.id) === cid);
                      return (
                        <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {c ? c.name : cid}
                          <XCircle size={12} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, customerIds: formData.customerIds.filter((id) => id !== cid) }); }} />
                        </span>
                      );
                    })}
                  </div>
                  <ChevronDown size={14} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => { setShowModal(false); closeAllDropdowns(); }} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleCreate} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Route Dropdown Portal */}
      {showModal && openRouteDropdown && (
        <div ref={routePanelRef} style={{ ...dropdownPanelStyle, top: routePos.top, left: routePos.left, width: routePos.width }}>
          <div style={{ padding: '8px', borderBottom: `1px solid ${DROPDOWN_BORDER}` }} onMouseDown={(e) => e.stopPropagation()}>
            <input className="form-input" placeholder="Search routes..."
              value={routeSearch} onChange={(e) => setRouteSearch(e.target.value)}
              autoFocus style={{ fontSize: '11px', padding: '8px 10px' }} />
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filteredRoutes.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-light)', fontSize: '11px' }}>No routes found</div>
            ) : filteredRoutes.map((r: any) => (
              <div key={r._id || r.id} onMouseDown={(e) => { e.stopPropagation(); setFormData({ ...formData, routeId: r._id || r.id }); setOpenRouteDropdown(false); setRouteSearch(''); }}
                style={dropdownItemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = DROPDOWN_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{r.name}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>{r.startLocation} → {r.endLocation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Driver Dropdown Portal - Create */}
      {showModal && openDriverDropdown && (
        <div ref={driverPanelRef} style={{ ...dropdownPanelStyle, top: driverPos.top, left: driverPos.left, width: driverPos.width }}>
          <div style={{ padding: '8px', borderBottom: `1px solid ${DROPDOWN_BORDER}` }} onMouseDown={(e) => e.stopPropagation()}>
            <input className="form-input" placeholder="Search drivers..."
              value={driverSearch} onChange={(e) => setDriverSearch(e.target.value)}
              autoFocus style={{ fontSize: '11px', padding: '8px 10px' }} />
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filteredDrivers.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-light)', fontSize: '11px' }}>No drivers found</div>
            ) : filteredDrivers.map((d: any) => (
              <div key={d._id || d.id} onMouseDown={(e) => { e.stopPropagation(); setFormData({ ...formData, driverId: d._id || d.id }); setOpenDriverDropdown(false); setDriverSearch(''); }}
                style={dropdownItemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = DROPDOWN_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{d.name}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>{d.phone || d.email || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Dropdown Portal - Create */}
      {showModal && openCustomerDropdown && (
        <div ref={customerPanelRef} style={{ ...dropdownPanelStyle, top: customerPos.top, left: customerPos.left, width: customerPos.width }}>
          <div style={{ padding: '8px', borderBottom: `1px solid ${DROPDOWN_BORDER}` }} onMouseDown={(e) => e.stopPropagation()}>
            <input className="form-input" placeholder="Search customers..."
              value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
              autoFocus style={{ fontSize: '11px', padding: '8px 10px' }} />
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-light)', fontSize: '11px' }}>No customers found</div>
            ) : filteredCustomers.map((c: any) => {
              const cid = c._id || c.id;
              const isSelected = formData.customerIds.includes(cid);
              return (
                <div key={cid} onMouseDown={(e) => {
                  e.stopPropagation();
                  setFormData({ ...formData, customerIds: isSelected ? formData.customerIds.filter((id) => id !== cid) : [...formData.customerIds, cid] });
                }}
                  style={{ ...dropdownItemStyle, background: isSelected ? 'rgba(16,185,129,0.1)' : 'transparent' }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = DROPDOWN_HOVER; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'rgba(16,185,129,0.1)' : 'transparent'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '4px', border: isSelected ? 'none' : '1.5px solid var(--border-color)', background: isSelected ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '9px', color: '#fff', fontWeight: 700 }}>
                      {isSelected && '✓'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>{c.phone || c.email || '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showReassignModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowReassignModal(false); setSelectedTrip(null); closeAllReassignDropdowns(); } }}>
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Reassign Trip</h3>
              <button onClick={() => { setShowReassignModal(false); setSelectedTrip(null); closeAllReassignDropdowns(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 0 }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Reassign Driver Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }} ref={reassignDriverDropdownRef}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>New Driver</label>
                <div onClick={() => setOpenReassignDriverDropdown(!openReassignDriverDropdown)}
                  className="form-input" style={{ fontSize: '12px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '40px' }}>
                  <span style={{ color: formData.driverId ? 'var(--text-main)' : 'var(--text-light)' }}>
                    {formData.driverId
                      ? drivers.find((d: any) => (d._id || d.id) === formData.driverId)
                        ? `${drivers.find((d: any) => (d._id || d.id) === formData.driverId).name}${drivers.find((d: any) => (d._id || d.id) === formData.driverId).phone ? ` — ${drivers.find((d: any) => (d._id || d.id) === formData.driverId).phone}` : ''}`
                        : formData.driverId
                      : 'Search or select a driver...'}
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                </div>
              </div>
              {/* Reassign Customer Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }} ref={reassignCustomerDropdownRef}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customers (optional)</label>
                <div onClick={() => setOpenReassignCustomerDropdown(!openReassignCustomerDropdown)}
                  className="form-input" style={{ fontSize: '12px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '40px', flexWrap: 'wrap', gap: '4px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, minWidth: 0 }}>
                    {formData.customerIds.length === 0 ? (
                      <span style={{ color: 'var(--text-light)' }}>Search or select customers...</span>
                    ) : formData.customerIds.map((cid: string) => {
                      const c = customers.find((cu: any) => (cu._id || cu.id) === cid);
                      return (
                        <span key={cid} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {c ? c.name : cid}
                          <XCircle size={12} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, customerIds: formData.customerIds.filter((id) => id !== cid) }); }} />
                        </span>
                      );
                    })}
                  </div>
                  <ChevronDown size={14} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button onClick={() => { setShowReassignModal(false); setSelectedTrip(null); closeAllReassignDropdowns(); }} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px' }}>Cancel</button>
              <button onClick={handleReassign} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '11px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}>Reassign</button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Dropdown Portal - Reassign */}
      {showReassignModal && openReassignDriverDropdown && (
        <div ref={reassignDriverPanelRef} style={{ ...dropdownPanelStyle, top: reassignDriverPos.top, left: reassignDriverPos.left, width: reassignDriverPos.width }}>
          <div style={{ padding: '8px', borderBottom: `1px solid ${DROPDOWN_BORDER}` }} onMouseDown={(e) => e.stopPropagation()}>
            <input className="form-input" placeholder="Search drivers..."
              value={reassignDriverSearch} onChange={(e) => setReassignDriverSearch(e.target.value)}
              autoFocus style={{ fontSize: '11px', padding: '8px 10px' }} />
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filteredDrivers.filter((d: any) => {
              const q = reassignDriverSearch.toLowerCase();
              return (d.name || '').toLowerCase().includes(q) ||
                (d.phone || '').toLowerCase().includes(q) ||
                (d.email || '').toLowerCase().includes(q);
            }).length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-light)', fontSize: '11px' }}>No drivers found</div>
            ) : filteredDrivers.filter((d: any) => {
              const q = reassignDriverSearch.toLowerCase();
              return (d.name || '').toLowerCase().includes(q) ||
                (d.phone || '').toLowerCase().includes(q) ||
                (d.email || '').toLowerCase().includes(q);
            }).map((d: any) => (
              <div key={d._id || d.id} onMouseDown={(e) => { e.stopPropagation(); setFormData({ ...formData, driverId: d._id || d.id }); setOpenReassignDriverDropdown(false); setReassignDriverSearch(''); }}
                style={dropdownItemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = DROPDOWN_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{d.name}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>{d.phone || d.email || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Dropdown Portal - Reassign */}
      {showReassignModal && openReassignCustomerDropdown && (
        <div ref={reassignCustomerPanelRef} style={{ ...dropdownPanelStyle, top: reassignCustomerPos.top, left: reassignCustomerPos.left, width: reassignCustomerPos.width }}>
          <div style={{ padding: '8px', borderBottom: `1px solid ${DROPDOWN_BORDER}` }} onMouseDown={(e) => e.stopPropagation()}>
            <input className="form-input" placeholder="Search customers..."
              value={reassignCustomerSearch} onChange={(e) => setReassignCustomerSearch(e.target.value)}
              autoFocus style={{ fontSize: '11px', padding: '8px 10px' }} />
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {customers.filter((c: any) => {
              const q = reassignCustomerSearch.toLowerCase();
              return (c.name || '').toLowerCase().includes(q) ||
                (c.phone || '').toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q);
            }).length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-light)', fontSize: '11px' }}>No customers found</div>
            ) : customers.filter((c: any) => {
              const q = reassignCustomerSearch.toLowerCase();
              return (c.name || '').toLowerCase().includes(q) ||
                (c.phone || '').toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q);
            }).map((c: any) => {
              const cid = c._id || c.id;
              const isSelected = formData.customerIds.includes(cid);
              return (
                <div key={cid} onMouseDown={(e) => {
                  e.stopPropagation();
                  setFormData({ ...formData, customerIds: isSelected ? formData.customerIds.filter((id) => id !== cid) : [...formData.customerIds, cid] });
                }}
                  style={{ ...dropdownItemStyle, background: isSelected ? 'rgba(16,185,129,0.1)' : 'transparent' }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = DROPDOWN_HOVER; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'rgba(16,185,129,0.1)' : 'transparent'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '4px', border: isSelected ? 'none' : '1.5px solid var(--border-color)', background: isSelected ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '9px', color: '#fff', fontWeight: 700 }}>
                      {isSelected && '✓'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-light)' }}>{c.phone || c.email || '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
