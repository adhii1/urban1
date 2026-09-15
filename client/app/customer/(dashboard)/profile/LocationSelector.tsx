'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, LocateFixed, MapPin, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

interface LocationSelectorProps {
  type: 'pickup' | 'drop' | 'home';
  initialAddress?: string;
  initialCoordinates?: number[];
  onLocationSelect: (location: { address: string; coordinates: [number, number] }) => void;
  onCancel: () => void;
}

const DEFAULT_LAT = 12.9716; // Bangalore
const DEFAULT_LNG = 77.5946;

// Dynamically import the map to avoid SSR issues with Leaflet
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

export default function LocationSelector({ type, initialAddress, initialCoordinates, onLocationSelect, onCancel }: LocationSelectorProps) {
  const [lat, setLat] = useState(initialCoordinates?.[1] || DEFAULT_LAT);
  const [lng, setLng] = useState(initialCoordinates?.[0] || DEFAULT_LNG);
  const [address, setAddress] = useState(initialAddress || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search using Nominatim (free OpenStreetMap geocoder, no API key)
  const searchLocation = async (query: string) => {
    if (!query.trim() || query.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setSuggestions(data || []);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  };

  // Reverse geocode coordinates to address
  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data?.display_name) setAddress(data.display_name);
    } catch { /* keep existing address */ }
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchLocation(searchQuery), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const selectSuggestion = (item: { display_name: string; lat: string; lon: string }) => {
    const newLat = parseFloat(item.lat);
    const newLng = parseFloat(item.lon);
    setLat(newLat);
    setLng(newLng);
    setAddress(item.display_name);
    setSuggestions([]);
    setSearchQuery('');
  };

  const handleMapClick = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    reverseGeocode(newLat, newLng);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      () => { /* silently fail */ }
    );
  };

  const handleConfirm = () => {
    onLocationSelect({ address: address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`, coordinates: [lng, lat] });
  };

  const typeLabel = type === 'pickup' ? 'Pickup' : type === 'drop' ? 'Drop' : 'Home';
  const typeColor = type === 'pickup' ? '#16C15D' : type === 'drop' ? '#3B82F6' : '#8B5CF6';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Select {typeLabel} Location</h3>
            <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Tap the map or search for a place</p>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}><X size={20} /></button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', position: 'relative', zIndex: 2000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px', background: '#fff' }}>
            <Search size={16} color="#64748B" />
            <input
              type="text"
              placeholder="Search for a place..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', color: '#0F172A', background: 'transparent' }}
            />
            {searching && (
              <Loader2 size={16} color="#64748B" style={{ animation: 'spin 1s linear infinite' }} />
            )}
            {searchQuery && !searching && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSuggestions([]); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px', display: 'flex', alignItems: 'center' }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
            <button type="button" onClick={handleUseMyLocation} style={{ background: 'none', border: 'none', cursor: 'pointer', color: typeColor, padding: '2px', display: 'flex', alignItems: 'center' }} title="Use my location">
              <LocateFixed size={18} />
            </button>
          </div>

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              left: '20px',
              right: '20px',
              top: '58px',
              background: '#ffffff',
              border: '1.5px solid #CBD5E1',
              borderRadius: '10px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
              zIndex: 9999,
              maxHeight: '220px',
              overflowY: 'auto',
            }}>
              {suggestions.map((item, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => selectSuggestion(item)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '11px 14px',
                    border: 'none',
                    background: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#0F172A',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    borderBottom: idx < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                >
                  <MapPin size={14} style={{ flexShrink: 0, marginTop: '2px', color: typeColor }} />
                  <span style={{ lineHeight: '1.4' }}>{item.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div style={{ flex: 1, minHeight: '280px', position: 'relative', zIndex: 1 }}>
          <LeafletMap lat={lat} lng={lng} onMapClick={handleMapClick} markerColor={typeColor} />
        </div>

        {/* Footer: address + confirm */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0' }}>
          <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Selected location:</p>
          <p style={{ fontSize: '12px', color: '#0F172A', fontWeight: 600, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}
          </p>
          <p style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '12px' }}>
            Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}
          </p>
          <button
            onClick={handleConfirm}
            style={{ width: '100%', padding: '14px', background: typeColor, color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
          >
            Confirm {typeLabel} Location
          </button>
        </div>
      </div>
    </div>
  );
}
