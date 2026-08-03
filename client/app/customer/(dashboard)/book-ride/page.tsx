'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRideBooking } from '@/lib/hooks/useRideBooking';
import { useToastStore } from '@/stores/toastStore';
import LocationSelector from '../profile/LocationSelector';
import DriverMap from '@/components/shared/DriverMap';
import { Car, MapPin, Loader, Phone, Shield, Plus, Trash2, Navigation, Clock, Star, IndianRupee, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SelectedLocation {
  address: string;
  coordinates: [number, number];
}

// Client-side fare estimation (mirrors backend logic)
const FARE_CONFIG = {
  baseFare: 25,
  perKmRate: 12,
  perMinuteRate: 1.5,
  minimumFare: 40,
  nightMultiplier: 1.25,
};

const toRad = (deg: number) => (deg * Math.PI) / 180;
const haversineKm = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const getSpeed = (hour: number) => {
  if ((hour >= 8 && hour < 10) || (hour >= 18 && hour < 21)) return 15;
  if (hour >= 23 || hour < 6) return 30;
  return 20;
};

function estimateFare(pickup: SelectedLocation, drop: SelectedLocation, stops: SelectedLocation[]) {
  let distance = haversineKm(pickup.coordinates, drop.coordinates);
  let prev = pickup.coordinates;
  for (const s of stops) {
    distance += haversineKm(prev, s.coordinates);
    prev = s.coordinates;
  }
  const hour = new Date().getHours();
  const speed = getSpeed(hour);
  const minutes = Math.max(1, Math.round((distance / speed) * 60));
  let fare = FARE_CONFIG.baseFare + distance * FARE_CONFIG.perKmRate + minutes * FARE_CONFIG.perMinuteRate;
  const isNight = hour >= 22 || hour < 5;
  if (isNight) fare *= FARE_CONFIG.nightMultiplier;
  return {
    estimated: Math.max(FARE_CONFIG.minimumFare, Math.round(fare)),
    distanceKm: Math.round(distance * 100) / 100,
    durationMinutes: minutes,
    isNight,
  };
}

export default function BookRidePage() {
  const { activeRide, isConnected, isSearching, requestRide, cancelRide, rateRide, completedRideId } = useRideBooking();

  const addToast = useToastStore((s) => s.addToast);

  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [drop, setDrop] = useState<SelectedLocation | null>(null);
  const [stops, setStops] = useState<(SelectedLocation | null)[]>([]);
  const [locationPicker, setLocationPicker] = useState<'pickup' | 'drop' | number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelInput, setShowCancelInput] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [lastCompletedRideId, setLastCompletedRideId] = useState<string | null>(null);

  // Reset rating state when ride changes
  useEffect(() => {
    if (!activeRide || activeRide.status !== 'COMPLETED') return;
    if (lastCompletedRideId === activeRide._id) return;
    setLastCompletedRideId(activeRide._id);
    setUserRating(0);
    setRatingSubmitted(false);
  }, [activeRide, lastCompletedRideId]);

  const validStops = useMemo(
    () => stops.filter((s): s is SelectedLocation => s !== null),
    [stops]
  );

  // Client-side fare estimate (shown before booking)
  const previewEstimate = useMemo(() => {
    if (!pickup || !drop) return null;
    return estimateFare(pickup, drop, validStops);
  }, [pickup, drop, validStops]);

  const handleLocationSelect = useCallback((location: SelectedLocation) => {
    if (locationPicker === 'pickup') setPickup(location);
    else if (locationPicker === 'drop') setDrop(location);
    else if (typeof locationPicker === 'number') {
      setStops((prev) => {
        const next = [...prev];
        next[locationPicker] = location;
        return next;
      });
    }
    setLocationPicker(null);
  }, [locationPicker]);

  const addStop = () => { if (stops.length < 3) setStops((prev) => [...prev, null]); };
  const removeStop = (index: number) => setStops((prev) => prev.filter((_, i) => i !== index));

  const handleRequestRide = () => {
    if (!pickup || !drop) return;
    const mappedStops = validStops.map((s, i) => ({ address: s.address, coordinates: s.coordinates, sequenceOrder: i + 1 }));
    requestRide(pickup, drop, mappedStops.length > 0 ? mappedStops : undefined);
  };

  const handleCancelRide = () => {
    if (!activeRide) return;
    cancelRide(activeRide._id, cancelReason || undefined);
    setShowCancelInput(false);
    setCancelReason('');
    // Show cancellation fee warning if driver was assigned
    if (activeRide.acceptedDriverId) {
      addToast('Ride cancelled. Cancellation fee may apply.', 'warning');
    }
  };

  const handleRate = async () => {
    if (!activeRide || userRating === 0) return;
    const ok = await rateRide(activeRide._id, userRating);
    if (ok) setRatingSubmitted(true);
  };

  // Determine if we should show the post-ride rating panel
  const showRatingPanel = activeRide && activeRide.status === 'COMPLETED' && !ratingSubmitted;
  const showRatingDone = activeRide && activeRide.status === 'COMPLETED' && ratingSubmitted;

  const isActiveStatus = (s: string) => ['PENDING', 'ACCEPTED', 'DRIVER_ARRIVING', 'IN_PROGRESS', 'COMPLETED'].includes(s);
  const hasActiveRide = activeRide && isActiveStatus(activeRide.status);

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>
        Book a Ride
      </h2>

      {/* Connection indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '11px', color: isConnected ? '#16C15D' : '#EF4444' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? '#16C15D' : '#EF4444' }} />
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>

      {/* ============ Post-Ride: Rating Panel ============ */}
      {showRatingPanel && (
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
          {/* Ride summary */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%', background: '#DCFCE7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
            }}>
              <CheckCircle2 size={28} color="#16C15D" />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Ride Completed!</div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>You have reached your destination</div>
          </div>

          {/* Final fare + duration */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px',
          }}>
            <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>FINAL FARE</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#16C15D', marginTop: '4px' }}>
                ₹{activeRide.completedFare || activeRide.fareEstimate || '--'}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>DURATION</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                {activeRide.rideDurationMinutes || '--'}<span style={{ fontSize: '12px', marginLeft: '2px' }}>min</span>
              </div>
            </div>
          </div>

          {/* Fare breakdown */}
          {activeRide.fareBreakdown && (
            <details style={{ marginBottom: '16px', fontSize: '11px', color: '#475569' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#0F172A', marginBottom: '8px' }}>View fare breakdown</summary>
              <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '10px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span>Base fare</span><span>₹{activeRide.fareBreakdown.baseFare}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span>Distance ({activeRide.tripDistance || 0} km)</span><span>₹{activeRide.fareBreakdown.distanceCharge}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span>Time ({activeRide.tripDuration || 0} min)</span><span>₹{activeRide.fareBreakdown.timeCharge}</span>
                </div>
                {activeRide.fareBreakdown.nightCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#7C3AED' }}>
                    <span>Night charge</span><span>₹{activeRide.fareBreakdown.nightCharge}</span>
                  </div>
                )}
                {activeRide.fareBreakdown.surgeCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#EA580C' }}>
                    <span>Surge charge</span><span>₹{activeRide.fareBreakdown.surgeCharge}</span>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Rating */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '10px' }}>Rate your driver</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '12px' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setUserRating(n)}
                  onMouseEnter={() => setRatingHover(n)}
                  onMouseLeave={() => setRatingHover(0)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                    transform: (ratingHover || userRating) >= n ? 'scale(1.2)' : 'scale(1)',
                    transition: 'transform 0.15s',
                  }}
                >
                  <Star
                    size={28}
                    fill={(ratingHover || userRating) >= n ? '#F59E0B' : 'none'}
                    color={(ratingHover || userRating) >= n ? '#F59E0B' : '#CBD5E1'}
                  />
                </button>
              ))}
            </div>
            <button
              onClick={handleRate}
              disabled={userRating === 0}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                background: userRating > 0 ? '#16C15D' : '#CBD5E1', color: '#FFF',
                fontSize: '13px', fontWeight: 700, cursor: userRating > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Submit Rating
            </button>
          </div>
        </div>
      )}

      {showRatingDone && (
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '16px', textAlign: 'center' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%', background: '#DCFCE7',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <CheckCircle2 size={28} color="#16C15D" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Thanks for your feedback!</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
            You rated {userRating} star{userRating !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#16C15D', marginTop: '10px' }}>
            Final fare: ₹{activeRide?.completedFare || activeRide?.fareEstimate}
          </div>
        </div>
      )}

      {/* ============ Active Ride Status Panel ============ */}
      {hasActiveRide && activeRide.status !== 'COMPLETED' && (
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: '16px' }}>

          {/* PENDING: Searching */}
          {isSearching && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', background: '#F0FDF4',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}>
                <Loader size={24} color="#16C15D" />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Searching for drivers...</div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>This may take a moment</div>

              {/* Server-confirmed fare estimate */}
              {activeRide.fareEstimate && (
                <div style={{
                  marginTop: '16px', background: '#F0FDF4', borderRadius: '10px', padding: '12px',
                  border: '1px solid #BBF7D0',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#166534', letterSpacing: '0.5px' }}>ESTIMATED FARE</div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: '#16C15D', marginTop: '4px' }}>
                    ₹{activeRide.fareEstimate}
                  </div>
                  <div style={{ fontSize: '10px', color: '#166534', marginTop: '4px' }}>
                    {activeRide.tripDistance} km · ~{activeRide.tripDuration} min
                    {activeRide.surgeInfo && (
                      <span style={{ color: '#EA580C', marginLeft: '6px' }}>
                        · {activeRide.surgeInfo.label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ACCEPTED: Driver assigned */}
          {!isSearching && activeRide.status === 'ACCEPTED' && activeRide.acceptedDriverId && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 600, background: '#DCFCE7', color: '#16C15D' }}>
                  DRIVER ASSIGNED
                </div>
              </div>

              <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: '#16C15D',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, fontSize: '16px',
                  }}>
                    {activeRide.acceptedDriverId.name?.[0] || 'D'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{activeRide.acceptedDriverId.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      {activeRide.acceptedDriverId.vehicleModel} · {activeRide.acceptedDriverId.vehicleNumber}
                    </div>
                  </div>
                  <a href={`tel:${activeRide.acceptedDriverId.phone || ''}`} style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: activeRide.acceptedDriverId.phone ? '#16C15D' : '#CBD5E1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', textDecoration: 'none',
                    cursor: activeRide.acceptedDriverId.phone ? 'pointer' : 'not-allowed',
                  }}>
                    <Phone size={16} />
                  </a>
                </div>
              </div>

              {/* Driver Location Map */}
              {activeRide.acceptedDriverId?.currentLocation && (
                <div style={{ marginBottom: '12px' }}>
                  <DriverMap
                    driverLocation={activeRide.acceptedDriverId.currentLocation}
                    pickupLocation={activeRide.pickupLocation}
                    dropLocation={activeRide.dropLocation}
                    status={activeRide.status}
                  />
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
                    Live driver tracking
                  </div>
                </div>
              )}

              {/* Fare preview */}
              {activeRide.fareEstimate && (
                <div style={{ background: '#FFFBEB', borderRadius: '10px', padding: '10px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <IndianRupee size={16} color="#D97706" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#92400E' }}>ESTIMATED FARE</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#92400E' }}>₹{activeRide.fareEstimate}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '10px', color: '#92400E' }}>
                    <div>{activeRide.tripDistance} km</div>
                    <div>~{activeRide.tripDuration} min</div>
                  </div>
                </div>
              )}

              {activeRide.otp?.code && (
                <div style={{ background: '#FEF3C7', borderRadius: '10px', padding: '12px', textAlign: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Shield size={14} color="#92400E" />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#92400E' }}>YOUR RIDE OTP</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#92400E', letterSpacing: '6px', fontFamily: 'monospace' }}>
                    {activeRide.otp.code}
                  </div>
                  <div style={{ fontSize: '10px', color: '#B45309', marginTop: '4px' }}>Share this 6-digit code with your driver</div>
                </div>
              )}

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                  <MapPin size={14} color="#16C15D" />
                  <span style={{ fontSize: '12px', color: '#0F172A' }}>{activeRide.pickupLocation?.address}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                  <MapPin size={14} color="#EF4444" />
                  <span style={{ fontSize: '12px', color: '#0F172A' }}>{activeRide.dropLocation?.address}</span>
                </div>
              </div>

              {activeRide.acceptedDriverId.currentLocation && (
                <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '10px', fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <Navigation size={12} />
                  Driver location: {activeRide.acceptedDriverId.currentLocation.coordinates[1].toFixed(5)}, {activeRide.acceptedDriverId.currentLocation.coordinates[0].toFixed(5)}
                </div>
              )}
            </div>
          )}

          {/* DRIVER_ARRIVING */}
          {!isSearching && activeRide.status === 'DRIVER_ARRIVING' && activeRide.acceptedDriverId && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 600, background: '#DBEAFE', color: '#2563EB' }}>
                  DRIVER ARRIVING
                </div>
                {activeRide.pickupEtaMinutes && (
                  <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 700 }}>~{activeRide.pickupEtaMinutes} min away</span>
                )}
              </div>

              <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: '#2563EB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, fontSize: '16px',
                  }}>
                    {activeRide.acceptedDriverId.name?.[0] || 'D'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{activeRide.acceptedDriverId.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      {activeRide.acceptedDriverId.vehicleModel} · {activeRide.acceptedDriverId.vehicleNumber}
                    </div>
                  </div>
                  <a href={`tel:${activeRide.acceptedDriverId.phone || ''}`} style={{
                    width: '36px', height: '36px', borderRadius: '50%', background: '#2563EB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', textDecoration: 'none',
                  }}>
                    <Phone size={16} />
                  </a>
                </div>
              </div>

              {/* Driver Location Map */}
              {activeRide.acceptedDriverId?.currentLocation && (
                <div style={{ marginBottom: '12px' }}>
                  <DriverMap
                    driverLocation={activeRide.acceptedDriverId.currentLocation}
                    pickupLocation={activeRide.pickupLocation}
                    dropLocation={activeRide.dropLocation}
                    status="DRIVER_ARRIVING"
                  />
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
                    Live driver tracking
                  </div>
                </div>
              )}

              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', marginBottom: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '6px', fontWeight: 600 }}>ESTIMATED PICKUP TIME</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#2563EB' }}>
                  {activeRide.pickupEtaMinutes || '--'}<span style={{ fontSize: '14px', fontWeight: 600, marginLeft: '4px' }}>min</span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '6px' }}>Live ETA updates from driver</div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                  <MapPin size={14} color="#16C15D" />
                  <span style={{ fontSize: '12px', color: '#0F172A' }}>{activeRide.pickupLocation?.address}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                  <MapPin size={14} color="#EF4444" />
                  <span style={{ fontSize: '12px', color: '#0F172A' }}>{activeRide.dropLocation?.address}</span>
                </div>
              </div>
            </div>
          )}

          {/* IN_PROGRESS */}
          {!isSearching && activeRide.status === 'IN_PROGRESS' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 600, background: '#DBEAFE', color: '#2563EB', display: 'inline-block' }}>
                  RIDE IN PROGRESS
                </div>
              </div>

              {activeRide.acceptedDriverId && (
                <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%', background: '#16C15D',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, fontSize: '16px',
                    }}>
                      {activeRide.acceptedDriverId.name?.[0] || 'D'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{activeRide.acceptedDriverId.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {activeRide.acceptedDriverId.vehicleModel} · {activeRide.acceptedDriverId.vehicleNumber}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Driver Location Map */}
              {activeRide.acceptedDriverId?.currentLocation && (
                <div style={{ marginBottom: '12px' }}>
                  <DriverMap
                    driverLocation={activeRide.acceptedDriverId.currentLocation}
                    pickupLocation={activeRide.pickupLocation}
                    dropLocation={activeRide.dropLocation}
                    status="IN_PROGRESS"
                  />
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
                    Live driver tracking
                  </div>
                </div>
              )}

              {/* Live ETA to drop */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <Clock size={10} /> ETA TO DROP
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                    {activeRide.dropoffEtaMinutes || '--'}
                    <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '3px' }}>min</span>
                  </div>
                  <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '4px' }}>Live from driver</div>
                </div>
                <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>DISTANCE LEFT</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#16C15D', marginTop: '4px' }}>
                    {activeRide.distanceToDestination?.toFixed(1) || '--'}
                    <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '3px' }}>km</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                  <MapPin size={14} color="#EF4444" />
                  <span style={{ fontSize: '12px', color: '#0F172A', fontWeight: 600 }}>{activeRide.dropLocation?.address}</span>
                </div>
              </div>
            </div>
          )}

          {/* Cancel button (for non-IN_PROGRESS active rides) */}
          {!['IN_PROGRESS', 'COMPLETED'].includes(activeRide.status) && (
            <>
              {!showCancelInput ? (
                <button onClick={() => setShowCancelInput(true)} style={{
                  width: '100%', padding: '10px', border: '1px solid #FCA5A5', borderRadius: '10px',
                  background: '#FFF', color: '#EF4444', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '8px',
                }}>
                  Cancel Ride
                </button>
              ) : (
                <div style={{ marginTop: '8px' }}>
                  <input type="text" placeholder="Reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '10px',
                    fontSize: '12px', outline: 'none', boxSizing: 'border-box', marginBottom: '8px',
                  }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => { setShowCancelInput(false); setCancelReason(''); }} style={{
                      flex: 1, padding: '10px', border: '1px solid #CBD5E1', borderRadius: '10px',
                      background: '#FFF', color: '#0F172A', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}>
                      Keep Ride
                    </button>
                    <button onClick={handleCancelRide} style={{
                      flex: 1, padding: '10px', border: 'none', borderRadius: '10px', background: '#EF4444',
                      color: '#FFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}>
                      Confirm Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ Booking Form ============ */}
      {!hasActiveRide && (
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {/* Pickup */}
          <div onClick={() => setLocationPicker('pickup')} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
            background: '#F0FDF4', borderRadius: '10px', cursor: 'pointer', marginBottom: '8px',
            border: '2px solid transparent',
          }}>
            <MapPin size={16} color="#16C15D" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>PICKUP</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pickup?.address || 'Tap to select pickup location'}
              </div>
            </div>
          </div>

          {/* Stops */}
          {stops.map((stop, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div onClick={() => setLocationPicker(index)} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                background: '#FFFBEB', borderRadius: '10px', cursor: 'pointer', flex: 1,
              }}>
                <MapPin size={16} color="#F59E0B" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>STOP {index + 1}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {stop?.address || 'Tap to select stop'}
                  </div>
                </div>
              </div>
              <button onClick={() => removeStop(index)} style={{
                width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#FEE2E2',
                color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {stops.length < 3 && (
            <button onClick={addStop} style={{
              width: '100%', padding: '8px', border: '1px dashed #CBD5E1', borderRadius: '10px',
              background: 'transparent', color: '#64748B', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '8px',
            }}>
              <Plus size={14} /> Add Stop
            </button>
          )}

          {/* Drop */}
          <div onClick={() => setLocationPicker('drop')} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
            background: '#FEF2F2', borderRadius: '10px', cursor: 'pointer', marginBottom: '16px',
          }}>
            <MapPin size={16} color="#EF4444" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>DROP</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {drop?.address || 'Tap to select drop location'}
              </div>
            </div>
          </div>

          {/* Pre-booking fare estimate */}
          {previewEstimate && (
            <div style={{
              background: previewEstimate.isNight ? '#F5F3FF' : '#F0FDF4',
              borderRadius: '12px', padding: '14px', marginBottom: '14px',
              border: `1px solid ${previewEstimate.isNight ? '#DDD6FE' : '#BBF7D0'}`,
            }}>
              {previewEstimate.isNight && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px',
                  padding: '6px 10px', background: '#EDE9FE', borderRadius: '8px',
                }}>
                  <AlertTriangle size={12} color="#7C3AED" />
                  <span style={{ fontSize: '10px', color: '#6D28D9', fontWeight: 600 }}>
                    Night time (10 PM – 5 AM) — 25% surcharge applies
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, letterSpacing: '0.5px' }}>ESTIMATED FARE</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: previewEstimate.isNight ? '#7C3AED' : '#16C15D', lineHeight: 1 }}>
                    ₹{previewEstimate.estimated}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '11px', color: '#475569' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                    <Navigation size={11} /> {previewEstimate.distanceKm} km
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '2px' }}>
                    <Clock size={11} /> ~{previewEstimate.durationMinutes} min
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '8px' }}>
                Final fare may vary based on actual route, traffic, and demand
              </div>
            </div>
          )}

          {/* Request button */}
          <button onClick={handleRequestRide} disabled={!pickup || !drop} style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: '12px',
            background: pickup && drop ? '#16C15D' : '#CBD5E1', color: '#FFF', fontSize: '14px', fontWeight: 700,
            cursor: pickup && drop ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            <Car size={16} /> Request Ride
            {previewEstimate && <span style={{ marginLeft: '4px', opacity: 0.9 }}>· ₹{previewEstimate.estimated}</span>}
          </button>
        </div>
      )}

      {/* Location Selector Modal */}
      {locationPicker !== null && (
        <LocationSelector
          type={typeof locationPicker === 'number' ? 'pickup' : locationPicker}
          initialAddress={
            locationPicker === 'pickup' ? pickup?.address :
            locationPicker === 'drop' ? drop?.address :
            stops[locationPicker as number]?.address
          }
          initialCoordinates={
            locationPicker === 'pickup' ? pickup?.coordinates :
            locationPicker === 'drop' ? drop?.coordinates :
            stops[locationPicker as number]?.coordinates
          }
          onLocationSelect={handleLocationSelect}
          onCancel={() => setLocationPicker(null)}
        />
      )}
    </div>
  );
}
