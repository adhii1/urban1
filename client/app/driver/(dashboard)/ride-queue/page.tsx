'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Power,
  Navigation,
  CheckCircle2,
  X,
  Clock,
  Navigation2,
  Loader,
  Car,
  Crosshair,
} from 'lucide-react';
import { useDriverSocket } from '@/lib/hooks/useDriverSocket';
import type { ShuttleRide, ActiveShuttle, ShuttleSequenceEntry } from '@/lib/hooks/useDriverSocket';
import { useToastStore } from '@/stores/toastStore';
import DriverLocationPicker from './DriverLocationPicker';
import DriverMap from '@/components/shared/DriverMap';
import type { ShuttleStopMarker } from '@/components/shared/DriverMap';

export default function DriverRideQueuePage() {
  const {
    isConnected,
    isOnline,
    incomingRides,
    activeRide,
    goOnline,
    goOffline,
    updateLocation,
    acceptRide,
    rejectRide,
    headToPickup,
    verifyOtp,
    completeRide,
    cancelRide,
    shuttleMode,
    enterShuttleMode,
    exitShuttleMode,
    shuttleListing,
    activeShuttle,
    isLoadingShuttleListing,
    fetchShuttleListing,
    acceptShuttleRides,
    verifyShuttlePickup,
    completeShuttleDrop,
    getShuttleNavigationUrl,
    cancelShuttle,
  } = useDriverSocket();
  const addToast = useToastStore((s) => s.addToast);

  const [otp, setOtp] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [manualLocation, setManualLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [selectedShuttleRideIds, setSelectedShuttleRideIds] = useState<Set<string>>(new Set());
  const [shuttleOtps, setShuttleOtps] = useState<Record<string, string>>({});
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shuttleModeRef = useRef(shuttleMode);
  shuttleModeRef.current = shuttleMode;

  // Periodically update driver location when online
  useEffect(() => {
    if (isOnline) {
      const loc = manualLocation;
      if (loc) {
        updateLocation(loc.lat, loc.lng);
        if (shuttleModeRef.current) fetchShuttleListing(loc.lat, loc.lng);
        locationIntervalRef.current = setInterval(() => {
          updateLocation(loc.lat, loc.lng);
          if (shuttleModeRef.current) fetchShuttleListing(loc.lat, loc.lng);
        }, 30000);
      } else if (navigator.geolocation) {
        const onError = (err: GeolocationPositionError) => {
          addToast(`Location update failed: ${err.message || 'unknown error'}`, 'error');
        };
        const onSuccess = (pos: GeolocationPosition) => {
          updateLocation(pos.coords.latitude, pos.coords.longitude);
          if (shuttleModeRef.current) fetchShuttleListing(pos.coords.latitude, pos.coords.longitude);
        };

        locationIntervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(onSuccess, onError, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        }, 30000); // every 30s

        // Initial location
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            updateLocation(pos.coords.latitude, pos.coords.longitude);
            if (shuttleModeRef.current) fetchShuttleListing(pos.coords.latitude, pos.coords.longitude);
          },
          onError,
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    }
    return () => {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [isOnline, updateLocation, addToast, manualLocation, fetchShuttleListing]);

  const handleToggleOnline = () => {
    if (isOnline) {
      goOffline();
      setManualLocation(null);
      addToast('You are now offline', 'info');
      return;
    }
    // Show map picker so driver can select a location (e.g. Bangalore)
    setShowLocationPicker(true);
  };

  const handleChangeLocation = () => {
    setShowLocationPicker(true);
  };

  const handleLocationConfirmed = (lat: number, lng: number, address: string) => {
    setShowLocationPicker(false);
    const loc = { lat, lng, address };
    setManualLocation(loc);
    if (isOnline) {
      updateLocation(lat, lng);
      if (shuttleMode) fetchShuttleListing(lat, lng);
      addToast(`Location updated: ${address}`, 'success');
    } else {
      goOnline(lat, lng);
      if (shuttleMode) fetchShuttleListing(lat, lng);
      addToast(`Online at: ${address}`, 'success');
    }
  };

  const handleAccept = (rideRequestId: string) => {
    acceptRide(rideRequestId);
  };

  const handleHeadToPickup = () => {
    if (!activeRide) return;
    headToPickup(activeRide.rideRequestId);
  };

  const handleReject = (rideRequestId: string) => {
    rejectRide(rideRequestId);
  };

  const handleVerifyOtp = () => {
    if (!activeRide) return;
    if (otp.length !== 6) {
      addToast('Please enter a 6-digit OTP', 'warning');
      return;
    }
    verifyOtp(activeRide.rideRequestId, otp);
    setOtp('');
  };

  const handleComplete = () => {
    if (!activeRide) return;
    completeRide(activeRide.rideRequestId);
  };

  const handleCancel = () => {
    if (!activeRide) return;
    if (confirm('Are you sure you want to cancel this ride?')) {
      cancelRide(activeRide.rideRequestId, 'Driver cancelled');
    }
  };

  const buildNavUrl = (dest: { address: string; coordinates: [number, number] }, waypoints?: any[]) => {
    const [lng, lat] = dest.coordinates;
    let url = `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${lat},${lng}&travelmode=driving`;
    if (waypoints && waypoints.length > 0) {
      const wpStr = waypoints.map((w) => `${w.coordinates[1]},${w.coordinates[0]}`).join('|');
      url += `&waypoints=${wpStr}`;
    }
    return url;
  };

  console.log('[FRONTEND_RENDER]', 'rendering page', {
    'incomingRides.length': incomingRides.length,
    activeRide: activeRide ? { rideRequestId: activeRide.rideRequestId, status: activeRide.status } : null,
    activeShuttle: activeShuttle ? { shuttleSessionId: activeShuttle.shuttleSessionId, status: activeShuttle.status } : null,
    shuttleMode
  });

  if (incomingRides.length > 0) {
    if (shuttleMode) {
      console.log('[FRONTEND_FILTER]', 'Hidden because:\nshuttleMode=true');
    } else if (activeShuttle) {
      console.log('[FRONTEND_FILTER]', 'Hidden because:\nactiveShuttle=true');
    }
  } else {
    console.log('[FRONTEND_FILTER]', 'Hidden because:\nincomingRides.length=0');
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF' }}>Ride Queue</h2>
        <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
          Real-time ride requests and active trip management
        </p>
      </div>

      {/* Driver Location Picker Modal */}
      {showLocationPicker && (
        <DriverLocationPicker
          onConfirm={handleLocationConfirmed}
          onCancel={() => setShowLocationPicker(false)}
        />
      )}

      {/* Connection + Online Status */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px',
        border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: isConnected ? '#16C15D' : '#EF4444',
                boxShadow: isConnected ? '0 0 8px #16C15D' : '0 0 8px #EF4444',
              }} />
              <span style={{ fontSize: '12px', color: '#FFF', fontWeight: 600 }}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#94A3B8' }}>
              {isOnline ? 'Receiving ride requests' : 'Go online to receive rides'}
            </p>
          </div>
          <button
            onClick={handleToggleOnline}
            disabled={isLocating}
            style={{
              padding: '10px 20px', borderRadius: '24px', border: 'none',
              background: isOnline ? '#EF4444' : '#16C15D',
              color: '#FFF', fontSize: '12px', fontWeight: 700,
              cursor: isLocating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              opacity: isLocating ? 0.6 : 1,
            }}
          >
            {isLocating ? <Loader size={14} /> : <Power size={14} />}
            {isLocating ? 'Locating...' : isOnline ? 'Go Offline' : 'Go Online'}
          </button>
        </div>

        {/* Change Location button — visible when online with manual location */}
        {isOnline && manualLocation && (
          <div style={{
            marginTop: '12px', paddingTop: '12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <button
              onClick={handleChangeLocation}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '8px',
                border: '1px solid rgba(22,193,93,0.25)', background: 'rgba(22,193,93,0.08)',
                color: '#16C15D', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <Crosshair size={12} />
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📍 {manualLocation.address}
              </span>
              <span style={{ fontSize: '10px', opacity: 0.7, whiteSpace: 'nowrap' }}>Change</span>
            </button>
          </div>
        )}

        {isOnline && (
          <div style={{
            marginTop: '12px', paddingTop: '12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>DRIVER MODE</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { exitShuttleMode(); setSelectedShuttleRideIds(new Set()); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  border: '1px solid',
                  borderColor: !shuttleMode ? 'rgba(22,193,93,0.5)' : 'rgba(255,255,255,0.1)',
                  background: !shuttleMode ? 'rgba(22,193,93,0.15)' : 'rgba(255,255,255,0.03)',
                  color: !shuttleMode ? '#16C15D' : '#94A3B8',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Solo Ride
              </button>
              <button
                onClick={() => { enterShuttleMode(); fetchShuttleListing(manualLocation?.lat || 0, manualLocation?.lng || 0); setSelectedShuttleRideIds(new Set()); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  border: '1px solid',
                  borderColor: shuttleMode ? 'rgba(37,99,235,0.5)' : 'rgba(255,255,255,0.1)',
                  background: shuttleMode ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.03)',
                  color: shuttleMode ? '#2563EB' : '#94A3B8',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Shuttle Mode
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Ride Panel */}
      {activeRide && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(22,193,93,0.15), rgba(22,193,93,0.05))',
          borderRadius: '14px', padding: '16px',
          border: '1px solid rgba(22,193,93,0.3)', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Car size={16} color="#16C15D" />
            <span style={{ fontSize: '13px', color: '#16C15D', fontWeight: 700 }}>
              {activeRide.status === 'ACCEPTED' && 'Accepted — Navigate to Pickup'}
              {activeRide.status === 'DRIVER_ARRIVING' && `Heading to Pickup — ETA ${activeRide.pickupEtaMinutes || '--'} min`}
              {activeRide.status === 'IN_PROGRESS' && 'In Progress — Navigate to Drop'}
              {activeRide.status === 'PENDING' && 'Pending Acceptance'}
            </span>
          </div>

          {activeRide.pickup && (
            <div style={{ marginBottom: '8px' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pickup</p>
              <p style={{ fontSize: '13px', color: '#FFF', fontWeight: 600 }}>{activeRide.pickup.address}</p>
            </div>
          )}
          {activeRide.drop && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Drop</p>
              <p style={{ fontSize: '13px', color: '#FFF', fontWeight: 600 }}>{activeRide.drop.address}</p>
            </div>
          )}

          {/* Fare Information */}
          {activeRide.fareEstimate && (
            <div style={{
              background: 'rgba(22,193,93,0.1)',
              border: '1px solid rgba(22,193,93,0.2)',
              borderRadius: '10px',
              padding: '10px',
              marginBottom: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <p style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px' }}>ESTIMATED FARE</p>
                <p style={{ fontSize: '18px', color: '#16C15D', fontWeight: 700 }}>₹{activeRide.fareEstimate}</p>
              </div>
              {activeRide.tripDistance !== undefined && activeRide.tripDistance !== null && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px' }}>DISTANCE</p>
                  <p style={{ fontSize: '14px', color: '#FFF', fontWeight: 600 }}>{activeRide.tripDistance.toFixed(1)} km</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation button */}
          {activeRide.status === 'ACCEPTED' && activeRide.pickup && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                onClick={handleHeadToPickup}
                style={{
                  flex: 1, padding: '12px', background: '#2563EB', color: '#FFF',
                  border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                <Navigation size={14} /> Head to Pickup
              </button>
              <a
                href={buildNavUrl(activeRide.pickup)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '12px 16px', background: '#4285F4', color: '#FFF',
                  borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <Navigation size={14} /> Map
              </a>
            </div>
          )}

          {activeRide.status === 'DRIVER_ARRIVING' && activeRide.pickup && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                background: 'rgba(37,99,235,0.15)', borderRadius: '10px', padding: '12px',
                textAlign: 'center', marginBottom: '10px',
              }}>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>ESTIMATED PICKUP TIME</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB' }}>
                  {activeRide.pickupEtaMinutes || '--'}
                  <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '4px' }}>min</span>
                </div>
              </div>
              <a
                href={buildNavUrl(activeRide.pickup)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  width: '100%', padding: '12px', background: '#4285F4', color: '#FFF',
                  borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
                }}
              >
                <Navigation size={14} /> Open in Google Maps
              </a>
            </div>
          )}

          {activeRide.status === 'IN_PROGRESS' && activeRide.drop && (
            <div>
              {/* Map for driver during IN_PROGRESS */}
              {activeRide.pickup && activeRide.drop && (
                <div style={{ marginBottom: '12px' }}>
                  <DriverMap
                    pickupLocation={activeRide.pickup}
                    dropLocation={activeRide.drop}
                    status="IN_PROGRESS"
                  />
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>
                    Route to destination
                  </div>
                </div>
              )}

              {/* ETA to drop for driver */}
              {activeRide.dropoffEtaMinutes && (
                <div style={{
                  background: 'rgba(37,99,235,0.15)',
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '12px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>ETA TO DROP</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB' }}>
                    {activeRide.dropoffEtaMinutes}
                    <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '4px' }}>min</span>
                  </div>
                </div>
              )}

              <a href={buildNavUrl(activeRide.drop, activeRide.stops)} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '12px', background: '#4285F4', color: '#FFF',
                borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
                marginBottom: '12px',
              }}>
                <Navigation size={14} /> Navigate to Drop ({activeRide.stops?.length || 0} stops)
              </a>
            </div>
          )}

          {/* OTP Verification — shown when driver is arriving at pickup */}
          {activeRide.status === 'DRIVER_ARRIVING' && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Customer OTP (verify at pickup)
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit"
                  style={{
                    flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                    color: '#FFF', fontSize: '18px', textAlign: 'center', letterSpacing: '8px',
                    fontWeight: 700, fontFamily: 'monospace',
                  }}
                />
                <button onClick={handleVerifyOtp} style={{
                  padding: '12px 20px', background: '#16C15D', color: '#FFF',
                  border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '12px',
                  cursor: 'pointer',
                }}>
                  Verify
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeRide.status === 'IN_PROGRESS' && (
              <button onClick={handleComplete} style={{
                flex: 1, padding: '12px', background: '#16C15D', color: '#FFF',
                border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '12px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <CheckCircle2 size={14} /> Complete Ride
              </button>
            )}
            <button onClick={handleCancel} style={{
              flex: activeRide.status === 'IN_PROGRESS' ? 0 : 1,
              padding: '12px 20px', background: 'rgba(239,68,68,0.15)', color: '#EF4444',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', fontWeight: 700,
              fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* ActiveShuttle Panel */}
      {activeShuttle && (
        <ActiveShuttlePanel
          shuttle={activeShuttle}
          shuttleOtps={shuttleOtps}
          setShuttleOtps={setShuttleOtps}
          driverLocation={manualLocation ? { coordinates: [manualLocation.lng, manualLocation.lat] as [number, number] } : undefined}
          onVerifyPickup={(rideRequestId, otp) => verifyShuttlePickup(activeShuttle.shuttleSessionId, rideRequestId, otp)}
          onCompleteDrop={(rideRequestId) => completeShuttleDrop(activeShuttle.shuttleSessionId, rideRequestId)}
          onNavigate={() => getShuttleNavigationUrl(activeShuttle.shuttleSessionId)}
          onCancel={() => {
            if (confirm('Cancel entire shuttle? All customers will need to re-book.')) {
              cancelShuttle(activeShuttle.shuttleSessionId, 'Driver cancelled shuttle');
            }
          }}
        />
      )}

      {/* Shuttle Mode Listing */}
      {shuttleMode && !activeShuttle && (
        <>
          <div style={{
            background: 'rgba(37,99,235,0.08)', borderRadius: '14px', padding: '14px',
            border: '1px solid rgba(37,99,235,0.25)', marginBottom: '12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <p style={{ fontSize: '13px', color: '#2563EB', fontWeight: 700 }}>Shuttle Mode</p>
              <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                Select rides to pick up multiple passengers
              </p>
            </div>
            <button
              onClick={() => {
                if (manualLocation) fetchShuttleListing(manualLocation.lat, manualLocation.lng);
              }}
              style={{
                padding: '8px 14px', background: 'rgba(37,99,235,0.2)',
                border: '1px solid rgba(37,99,235,0.4)', borderRadius: '8px',
                color: '#2563EB', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              ↻ Refresh
            </button>
          </div>

          {isLoadingShuttleListing && (
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '40px',
              textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px',
            }}>
              <Loader size={24} color="rgba(255,255,255,0.3)" style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '13px', color: '#94A3B8' }}>Loading nearby rides...</p>
            </div>
          )}

          {!isLoadingShuttleListing && shuttleListing.length === 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '40px',
              textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <Navigation2 size={32} color="rgba(255,255,255,0.2)" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '13px', color: '#94A3B8' }}>
                No rides nearby. Check back soon!
              </p>
            </div>
          )}

          {shuttleListing.length > 0 && (
            <>
              <ShuttleRideListing
                rides={shuttleListing}
                selectedIds={selectedShuttleRideIds}
                onToggle={(id) => {
                  setSelectedShuttleRideIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onAcceptSelected={() => {
                  if (selectedShuttleRideIds.size === 0) {
                    addToast('Select at least one ride', 'warning');
                    return;
                  }
                  acceptShuttleRides(Array.from(selectedShuttleRideIds));
                }}
              />
            </>
          )}
        </>
      )}

      {/* Solo Mode Incoming Rides */}
      {!shuttleMode && !activeShuttle && !activeRide && incomingRides.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '40px',
          textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <Navigation2 size={32} color="rgba(255,255,255,0.2)" style={{ marginBottom: '12px' }} />
          <p style={{ fontSize: '13px', color: '#94A3B8' }}>
            Go online to start receiving ride requests
          </p>
        </div>
      )}

      {!shuttleMode && !activeShuttle && incomingRides.length > 0 && (
        <>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#FFF', marginBottom: '12px' }}>
            Incoming Requests ({incomingRides.length})
          </h3>
          {incomingRides.map((ride) => (
            <IncomingRideCard
              key={ride.rideRequestId}
              ride={ride}
              onAccept={() => handleAccept(ride.rideRequestId)}
              onReject={() => handleReject(ride.rideRequestId)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function IncomingRideCard({
  ride,
  onAccept,
  onReject,
}: {
  ride: any;
  onAccept: () => void;
  onReject: () => void;
}) {
  console.log('[FRONTEND_RENDER]', 'IncomingRideCard rendered\n', {
    rideRequestId: ride.rideRequestId,
    isBundleOffer: !!ride.isBundleOffer,
    stopsLength: ride.stops?.length
  });

  const expiresAt = ride.expiresAt ? new Date(ride.expiresAt).getTime() : Date.now() + 60000;
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const ms = expiresAt - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        const ms = expiresAt - Date.now();
        return Math.max(0, Math.floor(ms / 1000));
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isExpiring = secondsLeft < 30;

  return (
    <div style={{
      background: 'rgba(245,158,11,0.08)', borderRadius: '14px', padding: '14px',
      border: `1px solid ${isExpiring ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
      marginBottom: '10px',
      animation: isExpiring ? 'pulse 1s infinite' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{
          fontSize: '11px', color: isExpiring ? '#EF4444' : '#F59E0B', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <Clock size={12} />
          {minutes}:{String(seconds).padStart(2, '0')} left
        </span>
        <span style={{ fontSize: '10px', color: '#94A3B8' }}>
          {ride.distanceKm !== undefined && ride.distanceKm !== null ? `${ride.distanceKm.toFixed(1)} km away` : 'distance unknown'} · ~{ride.etaMinutes ?? '?'} min
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16C15D' }} />
          <div style={{ width: '1px', flex: 1, background: 'rgba(255,255,255,0.2)', minHeight: '20px' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '12px', color: '#FFF', fontWeight: 600, marginBottom: '2px' }}>{ride.pickup?.address || 'Unknown pickup'}</p>
          <p style={{ fontSize: '12px', color: '#FFF', fontWeight: 600, marginTop: '16px' }}>{ride.drop?.address || 'Unknown drop'}</p>
        </div>
      </div>

      {ride.fareEstimate && (
        <div style={{ 
          background: 'rgba(22,193,93,0.15)', 
          border: '1px solid rgba(22,193,93,0.3)',
          borderRadius: '8px', 
          padding: '8px', 
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <p style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px' }}>ESTIMATED FARE</p>
            <p style={{ fontSize: '16px', color: '#16C15D', fontWeight: 700 }}>₹{ride.fareEstimate}</p>
          </div>
          {ride.tripDistance !== undefined && ride.tripDistance !== null && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px' }}>TRIP DISTANCE</p>
              <p style={{ fontSize: '14px', color: '#FFF', fontWeight: 600 }}>{ride.tripDistance.toFixed(1)} km</p>
            </div>
          )}
        </div>
      )}

      {ride.stops && ride.stops.length > 0 && (
        <p style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '10px' }}>
          + {ride.stops.length} additional stop{ride.stops.length > 1 ? 's' : ''}
        </p>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onReject} style={{
          flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
          color: '#94A3B8', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}>
          <X size={12} /> Reject
        </button>
        <button onClick={onAccept} style={{
          flex: 2, padding: '10px', background: '#16C15D', border: 'none',
          borderRadius: '8px', color: '#FFF', fontSize: '12px', fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        }}>
          <CheckCircle2 size={12} /> Accept
        </button>
      </div>
    </div>
  );
}

function ShuttleRideListing({
  rides,
  selectedIds,
  onToggle,
  onAcceptSelected,
}: {
  rides: ShuttleRide[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onAcceptSelected: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#FFF' }}>
          Nearby Rides ({rides.length})
        </h3>
        <span style={{ fontSize: '11px', color: '#94A3B8' }}>
          {selectedIds.size} selected
        </span>
      </div>
      {rides.map((ride) => {
        const isSelected = selectedIds.has(ride.rideRequestId);
        return (
          <div
            key={ride.rideRequestId}
            onClick={() => onToggle(ride.rideRequestId)}
            style={{
              background: isSelected ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.03)',
              borderRadius: '14px', padding: '14px',
              border: `1px solid ${isSelected ? 'rgba(37,99,235,0.4)' : 'rgba(255,255,255,0.08)'}`,
              marginBottom: '10px', cursor: 'pointer',
              display: 'flex', alignItems: 'flex-start', gap: '12px',
            }}
          >
            <div style={{
              width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
              border: `2px solid ${isSelected ? '#2563EB' : '#475569'}`,
              background: isSelected ? '#2563EB' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isSelected && (
                <CheckCircle2 size={12} color="#FFF" />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  {ride.distanceKm !== undefined ? `${ride.distanceKm.toFixed(1)} km away` : ''}
                </span>
                <span style={{ fontSize: '12px', color: '#FFF', fontWeight: 600 }}>{ride.customerName}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16C15D' }} />
                  <div style={{ width: '1px', flex: 1, background: 'rgba(255,255,255,0.2)', minHeight: '20px' }} />
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#FFF', fontWeight: 600, marginBottom: '16px' }}>
                    {ride.pickup?.address || 'Unknown pickup'}
                  </p>
                  <p style={{ fontSize: '12px', color: '#FFF', fontWeight: 600 }}>
                    {ride.drop?.address || 'Unknown drop'}
                  </p>
                </div>
              </div>
              {ride.fareEstimate && (
                <span style={{ fontSize: '14px', color: '#16C15D', fontWeight: 700 }}>
                  ₹{ride.fareEstimate}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {rides.length > 0 && (
        <button
          onClick={onAcceptSelected}
          style={{
            width: '100%', padding: '14px', background: '#2563EB', border: 'none',
            borderRadius: '12px', color: '#FFF', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', marginTop: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          Accept {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Rides
        </button>
      )}
    </div>
  );
}

function ActiveShuttlePanel({
  shuttle,
  shuttleOtps,
  setShuttleOtps,
  driverLocation,
  onVerifyPickup,
  onCompleteDrop,
  onNavigate,
  onCancel,
}: {
  shuttle: ActiveShuttle;
  shuttleOtps: Record<string, string>;
  setShuttleOtps: (otps: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  driverLocation?: { coordinates: [number, number] };
  onVerifyPickup: (rideRequestId: string, otp: string) => void;
  onCompleteDrop: (rideRequestId: string) => void;
  onNavigate: () => void;
  onCancel: () => void;
}) {
  const pendingPickups = shuttle.sequence.filter((s: ShuttleSequenceEntry) => s.type === 'PICKUP' && s.status === 'PENDING');
  const completedPickups = shuttle.sequence.filter((s: ShuttleSequenceEntry) => s.type === 'PICKUP' && s.status === 'COMPLETED');
  const pendingDrops = shuttle.sequence.filter((s: ShuttleSequenceEntry) => s.type === 'DROP' && s.status === 'PENDING');
  const completedDrops = shuttle.sequence.filter((s: ShuttleSequenceEntry) => s.type === 'DROP' && s.status === 'COMPLETED');

  const mapStops: ShuttleStopMarker[] = shuttle.sequence.map((s) => ({
    coordinates: s.location.coordinates,
    type: s.type,
    label: s.customerName,
    status: s.status,
    sequenceOrder: s.sequenceOrder,
  }));

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(37,99,235,0.05))',
      borderRadius: '14px', padding: '16px',
      border: '1px solid rgba(37,99,235,0.3)', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Car size={16} color="#2563EB" />
            <span style={{ fontSize: '14px', color: '#2563EB', fontWeight: 700 }}>
              Shuttle Active
            </span>
          </div>
          <p style={{ fontSize: '11px', color: '#94A3B8' }}>
            {completedDrops.length}/{shuttle.totalRides} completed
          </p>
        </div>
        {shuttle.navigationUrl && (
          <a
            href={shuttle.navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '10px 16px', background: '#4285F4', color: '#FFF',
              borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '12px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Navigation size={14} /> Navigate All
          </a>
        )}
      </div>

      {/* Shuttle Map */}
      {mapStops.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <DriverMap
            driverLocation={driverLocation}
            allStops={mapStops}
            height="240px"
            showRouteLine={true}
          />
        </div>
      )}

      {pendingPickups.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', borderRadius: '10px', padding: '12px',
          border: '1px solid rgba(245,158,11,0.25)', marginBottom: '12px',
        }}>
          <p style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 700, marginBottom: '10px' }}>
            PENDING PICKUPS ({pendingPickups.length})
          </p>
          {pendingPickups.map((entry) => {
            const ride = shuttle.rides.find((r) => r.rideRequestId === entry.rideRequestId);
            return (
              <div key={entry.rideRequestId} style={{
                background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#FFF', fontWeight: 600 }}>{entry.customerName}</span>
                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>Pickup</span>
                </div>
                <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>
                  {entry.location.address}
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={shuttleOtps[entry.rideRequestId] || ''}
                    onChange={(e) => setShuttleOtps((prev) => ({
                      ...prev,
                      [entry.rideRequestId]: e.target.value.replace(/\D/g, ''),
                    }))}
                    placeholder="OTP"
                    style={{
                      flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                      color: '#FFF', fontSize: '13px', textAlign: 'center', letterSpacing: '4px',
                      fontWeight: 700, fontFamily: 'monospace',
                    }}
                  />
                  <button
                    onClick={() => {
                      const otp = shuttleOtps[entry.rideRequestId] || '';
                      if (otp.length < 4) return;
                      onVerifyPickup(entry.rideRequestId, otp);
                      setShuttleOtps((prev) => ({ ...prev, [entry.rideRequestId]: '' }));
                    }}
                    style={{
                      padding: '8px 14px', background: '#16C15D', color: '#FFF',
                      border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Picked Up
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {completedPickups.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '11px', color: '#16C15D', fontWeight: 700, marginBottom: '8px' }}>
            PICKED UP ({completedPickups.length})
          </p>
          {completedPickups.map((entry) => (
            <div key={entry.rideRequestId} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '6px',
            }}>
              <CheckCircle2 size={14} color="#16C15D" />
              <span style={{ fontSize: '12px', color: '#FFF', fontWeight: 600 }}>{entry.customerName}</span>
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>— {entry.location.address}</span>
            </div>
          ))}
        </div>
      )}

      {pendingDrops.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', borderRadius: '10px', padding: '12px',
          border: '1px solid rgba(239,68,68,0.2)', marginBottom: '12px',
        }}>
          <p style={{ fontSize: '11px', color: '#EF4444', fontWeight: 700, marginBottom: '10px' }}>
            PENDING DROPS ({pendingDrops.length})
          </p>
          {pendingDrops.map((entry) => (
            <div key={entry.rideRequestId} style={{
              background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: '#FFF', fontWeight: 600 }}>{entry.customerName}</span>
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>Drop</span>
              </div>
              <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>
                {entry.location.address}
              </p>
              <button
                onClick={() => onCompleteDrop(entry.rideRequestId)}
                style={{
                  width: '100%', padding: '8px', background: '#EF4444', color: '#FFF',
                  border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Complete Drop
              </button>
            </div>
          ))}
        </div>
      )}

      {completedDrops.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '11px', color: '#16C15D', fontWeight: 700, marginBottom: '8px' }}>
            DROPPED ({completedDrops.length})
          </p>
          {completedDrops.map((entry) => (
            <div key={entry.rideRequestId} style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
            }}>
              <CheckCircle2 size={14} color="#16C15D" />
              <span style={{ fontSize: '12px', color: '#FFF', fontWeight: 600 }}>{entry.customerName}</span>
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>— {entry.location.address}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={onCancel} style={{
        width: '100%', padding: '10px', background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px',
        color: '#EF4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
      }}>
        Cancel Shuttle
      </button>
    </div>
  );
}
