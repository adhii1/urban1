'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Map, X, Loader2, LocateFixed, Navigation } from 'lucide-react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_KEY, hasGoogleMapsKey } from '@/lib/geo';

interface LocationSelectorProps {
  type: 'pickup' | 'drop' | 'home';
  initialAddress?: string;
  initialCoordinates?: number[];
  onLocationSelect: (location: { address: string; coordinates: [number, number] }) => void;
  onCancel: () => void;
}

const DEFAULT_LAT = 12.9716; // Bangalore latitude
const DEFAULT_LNG = 77.5946; // Bangalore longitude

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('click', (e: any) => {
      if (e.latLng) {
        onMapClick(e.latLng.lat(), e.latLng.lng());
      }
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

  // Create a session token once for billing
  useEffect(() => {
    if (places && !sessionTokenRef.current) {
      sessionTokenRef.current = new places.AutocompleteSessionToken();
    }
  }, [places]);

  // Debounced fetch of predictions
  useEffect(() => {
    if (!places || !query.trim()) {
      setPredictions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { suggestions } = await (places as any).AutocompleteSuggestion.fetchAutocompleteSuggestions(
          {
            input: query,
            includedRegionCodes: ['IN'],
            sessionToken: sessionTokenRef.current,
          }
        );
        const parsed: PlacePrediction[] = suggestions
          .map((s: any) => s.placePrediction)
          .filter((p: any) => p)
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
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [places, query]);

  const handleSelect = async (prediction: PlacePrediction) => {
    if (!places) return;
    try {
      const place = new places.Place({ id: prediction.placeId });
      await place.fetchFields({
        fields: ['formattedAddress', 'location'],
      });
      const loc = place.location;
      if (loc) {
        onPlaceSelected(loc.lat(), loc.lng(), place.formattedAddress || prediction.mainText);
        setQuery(prediction.mainText);
        setShowDropdown(false);
        setPredictions([]);
      }
    } catch {
      setShowDropdown(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(predictions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => predictions.length > 0 && setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Search a place in India…"
        style={styles.searchInput}
      />
      {showDropdown && predictions.length > 0 && (
        <div style={styles.dropdown}>
          {predictions.map((p, i) => (
            <div
              key={p.placeId}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(p);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                ...styles.dropdownItem,
                ...(activeIndex === i ? styles.dropdownItemActive : {}),
              }}
            >
              <Map size={14} color="#64748B" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={styles.dropdownMain}>{p.mainText}</div>
                {p.secondaryText && (
                  <div style={styles.dropdownSecondary}>{p.secondaryText}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReverseGeocoder({
  lat,
  lng,
  onAddress,
}: {
  lat: number;
  lng: number;
  onAddress: (address: string) => void;
}) {
  const geocodingLib = useMapsLibrary('geocoding');
  const lastCoords = useRef({ lat: 0, lng: 0 });

  useEffect(() => {
    if (!geocodingLib) return;
    if (lastCoords.current.lat === lat && lastCoords.current.lng === lng) return;
    lastCoords.current = { lat, lng };

    const geocoder = new geocodingLib.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
      if (status === 'OK' && results && results.length > 0) {
        onAddress(results[0].formatted_address);
      }
    });
  }, [geocodingLib, lat, lng, onAddress]);

  return null;
}

function SelectorBody({
  type,
  initialAddress,
  initialCoordinates,
  onLocationSelect,
  onCancel,
}: LocationSelectorProps) {
  const defaultCoords = [DEFAULT_LNG, DEFAULT_LAT];
  const validInitial =
    initialCoordinates && initialCoordinates.length >= 2
      ? initialCoordinates
      : defaultCoords;

  const [address, setAddress] = useState(initialAddress || '');
  const [lat, setLat] = useState(validInitial[1]);
  const [lng, setLng] = useState(validInitial[0]);
  const [loading, setLoading] = useState(false);

  const typeName = type === 'pickup' ? 'Pickup' : type === 'drop' ? 'Drop' : 'Home';
  const accentColor =
    type === 'pickup' ? '#16C15D' : type === 'drop' ? '#EF4444' : '#3B82F6';

  const handlePlaceSelected = useCallback(
    (newLat: number, newLng: number, newAddress: string) => {
      setLat(newLat);
      setLng(newLng);
      if (newAddress) setAddress(newAddress);
    },
    []
  );

  const handleReverseGeocode = useCallback((newAddress: string) => {
    if (newAddress) setAddress(newAddress);
  }, []);

  const handleMapClick = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
  }, []);

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setLoading(false);
      },
      () => setLoading(false)
    );
  };

  const handleResetToIndia = () => {
    setLat(DEFAULT_LAT);
    setLng(DEFAULT_LNG);
    setAddress('');
  };

  const handleConfirm = () => {
    onLocationSelect({
      address: address || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      coordinates: [lng, lat],
    });
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ ...styles.header, borderBottom: '1px solid #E5E7EB' }}>
          <div style={styles.headerLeft}>
            <div style={{ ...styles.typeBadge, background: accentColor }}>
              {type[0].toUpperCase()}
            </div>
            <div>
              <div
                style={{
                  fontSize: '10px',
                  color: '#64748B',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Location
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                Select {typeName} Point
              </div>
            </div>
          </div>
          <button onClick={onCancel} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Search Bar — using new PlaceAutocompleteElement (new Places API) */}
        <div
          style={{
            padding: '12px 16px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          <PlaceAutocomplete onPlaceSelected={handlePlaceSelected} />
        </div>

        {/* Map */}
        <div style={{ position: 'relative', height: '320px', background: '#E5E7EB' }}>
          <GoogleMap
            mapId="location-selector"
            style={{ width: '100%', height: '100%' }}
            defaultCenter={{ lat, lng }}
            defaultZoom={14}
            gestureHandling="greedy"
            disableDefaultUI
          >
            <MapCenterUpdater lat={lat} lng={lng} />
            <AdvancedMarker position={{ lat, lng }}>
              <Pin background={accentColor} borderColor="#FFFFFF" glyphColor="#FFFFFF" />
            </AdvancedMarker>
            <MapClickHandler onMapClick={handleMapClick} />
          </GoogleMap>
          <div style={styles.mapHint}>
            <Map size={12} /> Tap the map to drop a pin
          </div>
        </div>

        {/* Selected Info */}
        <div style={{ padding: '14px 16px', background: '#FFFFFF' }}>
          <div
            style={{
              fontSize: '10px',
              color: '#64748B',
              fontWeight: 600,
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            Selected Address
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#0F172A',
              marginBottom: '10px',
              minHeight: '18px',
              wordBreak: 'break-word',
            }}
          >
            {address || `Pin location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCurrentLocation} disabled={loading} style={styles.smallBtn}>
              {loading ? <Loader2 size={14} /> : <LocateFixed size={14} />}
              <span style={{ marginLeft: '4px' }}>My Location</span>
            </button>
            <button
              onClick={handleResetToIndia}
              style={{ ...styles.smallBtn, background: '#F1F5F9', color: '#475569' }}
            >
              <Navigation size={14} />
              <span style={{ marginLeft: '4px' }}>Reset to Bangalore</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onCancel} style={styles.cancelBtn}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{ ...styles.confirmBtn, background: accentColor }}
          >
            Confirm {typeName}
          </button>
        </div>

        {/* Hidden reverse geocoder (must be inside APIProvider) */}
        <ReverseGeocoder lat={lat} lng={lng} onAddress={handleReverseGeocode} />
      </div>
    </div>
  );
}

export default function LocationSelector(props: LocationSelectorProps) {
  if (!hasGoogleMapsKey) {
    return (
      <div style={styles.overlay} onClick={props.onCancel}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <h3 style={styles.title}>Select {props.type} Location</h3>
            <button onClick={props.onCancel} style={styles.closeBtn}>
              <X size={20} />
            </button>
          </div>
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: '#64748B',
              fontSize: '13px',
            }}
          >
            Google Maps API key not configured. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            to enable location selection.
          </div>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={['places', 'geocoding']}>
      <SelectorBody {...props} />
    </APIProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px',
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '92vh',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: '#FFFFFF',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  typeBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: 700,
  },
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#0F172A',
    margin: 0,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '8px',
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #CBD5E1',
    borderRadius: '10px',
    fontSize: '13px',
    outline: 'none',
    color: '#0F172A',
    background: '#FFFFFF',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
    maxHeight: '240px',
    overflowY: 'auto',
    zIndex: 10000,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    cursor: 'pointer',
    background: '#FFFFFF',
    color: '#0F172A',
    borderBottom: '1px solid #F1F5F9',
  },
  dropdownItemActive: {
    background: '#F1F5F9',
  },
  dropdownMain: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#0F172A',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dropdownSecondary: {
    fontSize: '11px',
    color: '#64748B',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mapHint: {
    position: 'absolute',
    top: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(255, 255, 255, 0.95)',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '10px',
    color: '#475569',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  smallBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#0F172A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #E5E7EB',
    background: '#FFFFFF',
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    border: '1px solid #CBD5E1',
    borderRadius: '10px',
    background: '#FFFFFF',
    color: '#0F172A',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  confirmBtn: {
    flex: 1.5,
    padding: '12px',
    border: 'none',
    borderRadius: '10px',
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
