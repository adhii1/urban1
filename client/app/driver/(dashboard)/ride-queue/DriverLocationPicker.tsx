'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Loader2, Map, Navigation, Search } from 'lucide-react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_KEY, hasGoogleMapsKey } from '@/lib/geo';

// Bangalore city center
const DEFAULT_LAT = 12.9716;
const DEFAULT_LNG = 77.5946;

interface DriverLocationPickerProps {
  onConfirm: (lat: number, lng: number, address: string) => void;
  onCancel: () => void;
}

/* ─── Helpers that must live inside APIProvider ─── */

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('click', (e: any) => {
      if (e.latLng) onMapClick(e.latLng.lat(), e.latLng.lng());
    });
    return () => listener.remove();
  }, [map, onMapClick]);
  return null;
}

function MapCenterUpdater({ lat, lng, zoom = 14 }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.setCenter({ lat, lng });
    map.setZoom(zoom);
  }, [map, lat, lng, zoom]);
  return null;
}

function ReverseGeocoder({
  lat, lng, onAddress,
}: { lat: number; lng: number; onAddress: (a: string) => void }) {
  const geocodingLib = useMapsLibrary('geocoding');
  const lastCoords = useRef({ lat: 0, lng: 0 });

  useEffect(() => {
    if (!geocodingLib) return;
    if (lastCoords.current.lat === lat && lastCoords.current.lng === lng) return;
    lastCoords.current = { lat, lng };
    const geocoder = new geocodingLib.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
      if (status === 'OK' && results?.length > 0) {
        onAddress(results[0].formatted_address);
      }
    });
  }, [geocodingLib, lat, lng, onAddress]);

  return null;
}

/* ─── Place search ─── */

interface PlacePrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

function PlaceAutocomplete({
  onPlaceSelected,
}: {
  onPlaceSelected: (lat: number, lng: number, address: string) => void;
}) {
  const places = useMapsLibrary('places');
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (places && !sessionTokenRef.current) {
      sessionTokenRef.current = new places.AutocompleteSessionToken();
    }
  }, [places]);

  useEffect(() => {
    if (!places || !query.trim()) { setPredictions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { suggestions } = await (places as any).AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedRegionCodes: ['IN'],
          sessionToken: sessionTokenRef.current,
        });
        const parsed: PlacePrediction[] = suggestions
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .map((p: any) => ({
            placeId: p.placeId,
            mainText: p.mainText?.text || p.text?.text || '',
            secondaryText: p.secondaryText?.text || '',
          }));
        setPredictions(parsed);
        setShowDropdown(parsed.length > 0);
        setActiveIndex(-1);
      } catch {
        setPredictions([]);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [places, query]);

  const handleSelect = async (prediction: PlacePrediction) => {
    if (!places) return;
    try {
      const place = new places.Place({ id: prediction.placeId });
      await place.fetchFields({ fields: ['formattedAddress', 'location'] });
      const loc = place.location;
      if (loc) {
        onPlaceSelected(loc.lat(), loc.lng(), place.formattedAddress || prediction.mainText);
        setQuery(prediction.mainText);
        setShowDropdown(false);
        setPredictions([]);
      }
    } catch { setShowDropdown(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, predictions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); handleSelect(predictions[activeIndex]); }
    else if (e.key === 'Escape') { setShowDropdown(false); }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Search Bangalore locations…"
          style={{
            width: '100%', padding: '10px 12px 10px 34px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, color: '#FFF', fontSize: 13, outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>
      {showDropdown && predictions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          maxHeight: 200, overflowY: 'auto', zIndex: 10000,
        }}>
          {predictions.map((p, i) => (
            <div
              key={p.placeId}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: activeIndex === i ? 'rgba(255,255,255,0.06)' : 'transparent',
              }}
            >
              <Map size={14} color="#94A3B8" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.mainText}</div>
                {p.secondaryText && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.secondaryText}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main body ─── */

function PickerBody({ onConfirm, onCancel }: DriverLocationPickerProps) {
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [address, setAddress] = useState('Bangalore City Center');

  const handleMapClick = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
  }, []);

  const handleReverseGeocode = useCallback((a: string) => {
    if (a) setAddress(a);
  }, []);

  const handlePlaceSelected = useCallback((newLat: number, newLng: number, newAddress: string) => {
    setLat(newLat);
    setLng(newLng);
    if (newAddress) setAddress(newAddress);
  }, []);

  const handleConfirm = () => {
    onConfirm(lat, lng, address || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Driver Location
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFF', marginTop: 2 }}>
              Set Your Location
            </div>
          </div>
          <button onClick={onCancel} style={styles.closeBtn}><X size={18} /></button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <PlaceAutocomplete onPlaceSelected={handlePlaceSelected} />
        </div>

        {/* Map */}
        <div style={{ position: 'relative', height: 300, background: '#0F172A' }}>
          <GoogleMap
            mapId="driver-location-picker"
            style={{ width: '100%', height: '100%' }}
            defaultCenter={{ lat, lng }}
            defaultZoom={14}
            gestureHandling="greedy"
            disableDefaultUI
          >
            <MapCenterUpdater lat={lat} lng={lng} />
            <AdvancedMarker position={{ lat, lng }}>
              <Pin background="#16C15D" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
            </AdvancedMarker>
            <MapClickHandler onMapClick={handleMapClick} />
          </GoogleMap>
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(15,23,42,0.92)', padding: '4px 10px', borderRadius: 20,
            fontSize: 10, color: '#94A3B8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <Map size={12} /> Tap map to set your position
          </div>
        </div>

        {/* Selected info */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
            Selected Location
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#FFF', marginBottom: 8, wordBreak: 'break-word', lineHeight: 1.4 }}>
            {address}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
          <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleConfirm} style={styles.confirmBtn}>
            <Navigation size={14} />
            <span style={{ marginLeft: 6 }}>Go Online Here</span>
          </button>
        </div>

        {/* Hidden reverse geocoder */}
        <ReverseGeocoder lat={lat} lng={lng} onAddress={handleReverseGeocode} />
      </div>
    </div>
  );
}

/* ─── Public component ─── */

export default function DriverLocationPicker(props: DriverLocationPickerProps) {
  if (!hasGoogleMapsKey) {
    return (
      <div style={styles.overlay} onClick={props.onCancel}>
        <div style={{ ...styles.modal, padding: 24, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: '#94A3B8', fontSize: 13 }}>
            Google Maps API key not configured.<br />
            Set <code style={{ color: '#16C15D' }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable map selection.
          </p>
          <button onClick={props.onCancel} style={{ ...styles.cancelBtn, marginTop: 16 }}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={['places', 'geocoding']}>
      <PickerBody {...props} />
    </APIProvider>
  );
}

/* ─── Styles ─── */

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 16,
  },
  modal: {
    background: '#0F172A', borderRadius: 16, width: '100%', maxWidth: 480,
    maxHeight: '92vh', overflow: 'auto', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255,255,255,0.08)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
    padding: 6, borderRadius: 8, color: '#94A3B8', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1, padding: 12, border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, background: 'transparent', color: '#94A3B8',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  confirmBtn: {
    flex: 1.5, padding: 12, border: 'none', borderRadius: 10,
    background: '#16C15D', color: '#FFF', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
