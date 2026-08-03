'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDriverStore } from '@/stores/driverStore';
import { useToastStore } from '@/stores/toastStore';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api/v1', '') ||
  'http://localhost:4000';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export interface IncomingRide {
  rideRequestId: string;
  pickup: { address: string; coordinates: [number, number] };
  drop: { address: string; coordinates: [number, number] };
  stops: any[];
  distanceKm: number;
  etaMinutes: number;
  expiresAt: string;
  fareEstimate?: number;
  tripDistance?: number;
}

export interface ActiveRide {
  rideRequestId: string;
  pickup?: { address: string; coordinates: [number, number] };
  drop?: { address: string; coordinates: [number, number] };
  stops?: any[];
  status: 'PENDING' | 'ACCEPTED' | 'DRIVER_ARRIVING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assignedBy?: string;
  pickupEtaMinutes?: number;
  dropoffEtaMinutes?: number;
  fareEstimate?: number;
  tripDistance?: number;
}

export interface ShuttleRide {
  rideRequestId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  pickup: { address: string; coordinates: [number, number] };
  drop: { address: string; coordinates: [number, number] };
  stops: any[];
  fareEstimate?: number;
  tripDistance?: number;
  expiresAt?: string;
  distanceKm?: number;
}

export interface ShuttleSequenceEntry {
  type: 'PICKUP' | 'DROP';
  rideRequestId: string;
  customerId?: string;
  customerName: string;
  location: { address: string; coordinates: [number, number] };
  status: 'PENDING' | 'COMPLETED';
  otpVerified: boolean;
  sequenceOrder: number;
}

export interface ActiveShuttle {
  shuttleSessionId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  rides: ShuttleRide[];
  sequence: ShuttleSequenceEntry[];
  navigationUrl?: string;
  totalRides: number;
  completedRides: number;
  nextPickup?: ShuttleSequenceEntry | null;
  nextDrop?: ShuttleSequenceEntry | null;
}

export function useDriverSocket() {
  const socketRef = useRef<Socket | null>(null);
  const driverId = useDriverStore((s) => s.driverId);
  const accessToken = useDriverStore((s) => s.accessToken);
  const driverIdRef = useRef(driverId);
  const accessTokenRef = useRef(accessToken);
  const addToast = useToastStore((s) => s.addToast);

  const [isOnline, setIsOnline] = useState(false);
  const [incomingRides, setIncomingRides] = useState<IncomingRide[]>([]);
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [shuttleMode, setShuttleMode] = useState(false);
  const [shuttleListing, setShuttleListing] = useState<ShuttleRide[]>([]);
  const [activeShuttle, setActiveShuttle] = useState<ActiveShuttle | null>(null);
  const [isLoadingShuttleListing, setIsLoadingShuttleListing] = useState(false);
  const pendingAcceptRef = useRef<IncomingRide | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const wasOnlineRef = useRef(false);
  const activeShuttleRef = useRef<ActiveShuttle | null>(null);

  useEffect(() => {
    activeShuttleRef.current = activeShuttle;
  }, [activeShuttle]);

  useEffect(() => {
    console.log('[FRONTEND_STATE]', {
      'incomingRides.length': incomingRides.length,
      activeRide: activeRide ? { rideRequestId: activeRide.rideRequestId, status: activeRide.status } : null,
      activeShuttle: activeShuttle ? { shuttleSessionId: activeShuttle.shuttleSessionId, status: activeShuttle.status } : null,
      shuttleMode
    });
  }, [incomingRides, activeRide, activeShuttle, shuttleMode]);

  useEffect(() => {
    driverIdRef.current = driverId;
    accessTokenRef.current = accessToken;
  }, [driverId, accessToken]);

  useEffect(() => {
    if (!driverId) return;

    const socket = io(`${SOCKET_URL}/sockets/driver`, {
      auth: { token: accessTokenRef.current, driverId: driverIdRef.current! },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setIsConnected(true);
      // Recover online state after transient disconnect: the server marks
      // drivers offline on disconnect, so re-announce if we were online.
      if (wasOnlineRef.current && lastLocationRef.current) {
        const loc = lastLocationRef.current;
        socket.emit('driver:online', { latitude: loc.lat, longitude: loc.lng });
      }
    });
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('driver:error', (data: { message: string; suspended?: boolean; pendingApproval?: boolean }) => {
      // If going online failed (e.g., suspended, pending approval), revert the optimistic isOnline state
      if (data.message) {
        wasOnlineRef.current = false;
        lastLocationRef.current = null;
        setIsOnline(false);
      }
    });

    socket.on('ride:new-request', (data: IncomingRide) => {
      console.log('[FRONTEND_SOCKET]', 'ride:new-request received', {
        rideRequestId: data.rideRequestId,
        isBundleOffer: !!(data as any).isBundleOffer,
        stopsLength: data.stops?.length
      });
      setIncomingRides((prev) => {
        const next = [...prev, data];
        return next;
      });
      const distStr = data.distanceKm !== undefined && data.distanceKm !== null
        ? `${data.distanceKm.toFixed(1)} km away`
        : 'distance unknown';
      addToast(`New ride request! ${distStr}`, 'info');
    });

    socket.on('ride:unavailable', (data: { rideRequestId: string; message: string }) => {
      console.log('[FRONTEND_STATE]', 'incomingRides cleared / filtered', {
        reason: `ride:unavailable: ${data.message}`,
        rideRequestId: data.rideRequestId
      });
      setIncomingRides((prev) =>
        prev.filter((r) => r.rideRequestId !== data.rideRequestId)
      );
      addToast(data.message, 'warning');
    });

    socket.on('ride:accept:ack', (data: {
      rideRequestId: string;
      fareEstimate?: number;
      tripDistance?: number;
      shuttleSessionId?: string;
      shuttle?: any;
      rides?: ShuttleRide[];
      navigationUrl?: string;
      message?: string;
    }) => {
      console.log('[FRONTEND_STATE]', 'incomingRides cleared', {
        reason: 'ride:accept:ack',
        rideRequestId: data.rideRequestId
      });
      const pending = pendingAcceptRef.current;
      setIncomingRides([]);
      pendingAcceptRef.current = null;

      if (data.shuttleSessionId && data.shuttle && data.rides) {
        setActiveShuttle({
          shuttleSessionId: data.shuttleSessionId,
          status: 'ACTIVE',
          rides: data.rides,
          sequence: data.shuttle.sequence,
          navigationUrl: data.navigationUrl || '',
          totalRides: data.rides.length,
          completedRides: 0,
        });
        addToast(data.message || 'Bundle accepted! Navigate to pickup.', 'success');
      } else {
        if (pending) {
          setActiveRide({
            rideRequestId: data.rideRequestId,
            pickup: pending.pickup,
            drop: pending.drop,
            stops: pending.stops,
            status: 'ACCEPTED',
            fareEstimate: data.fareEstimate || pending.fareEstimate,
            tripDistance: data.tripDistance || pending.tripDistance,
          });
        } else {
          setActiveRide({
            rideRequestId: data.rideRequestId,
            status: 'ACCEPTED',
            fareEstimate: data.fareEstimate,
            tripDistance: data.tripDistance,
          });
        }
        addToast('Ride accepted! Navigate to pickup.', 'success');
      }
    });

    socket.on('ride:accept:error', (data: { message: string }) => {
      pendingAcceptRef.current = null;
      addToast(data.message, 'error');
    });

    socket.on('ride:head-to-pickup:ack', (data: { success: boolean; etaMinutes: number }) => {
      setActiveRide((prev) => prev ? {
        ...prev,
        status: 'DRIVER_ARRIVING',
        pickupEtaMinutes: data.etaMinutes,
      } : null);
      addToast(`Heading to pickup! ETA: ${data.etaMinutes} min`, 'success');
    });

    socket.on('ride:head-to-pickup:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socket.on('ride:assigned', (data: any) => {
      setActiveRide({
        rideRequestId: data.rideRequestId,
        pickup: data.pickup,
        drop: data.drop,
        status: 'ACCEPTED',
        assignedBy: 'admin',
      });
      addToast('Admin assigned a ride to you', 'info');
    });

    socket.on('ride:verify-otp:ack', (data: {
      success?: boolean;
      dropEtaMinutes?: number;
      dropDistanceKm?: number;
      rideRequestId?: string;
    }) => {
      if (activeShuttleRef.current && data.rideRequestId) {
        setActiveShuttle((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            sequence: prev.sequence.map((s) =>
              s.rideRequestId === data.rideRequestId && s.type === 'PICKUP'
                ? { ...s, status: 'COMPLETED' as const, otpVerified: true }
                : s
            ),
          };
        });
        addToast('OTP verified! Customer picked up.', 'success');
      } else {
        setActiveRide((prev) => (prev ? {
          ...prev,
          status: 'IN_PROGRESS',
          dropoffEtaMinutes: data.dropEtaMinutes,
          distanceToDestination: data.dropDistanceKm,
        } : prev));
        addToast('OTP verified! Ride started.', 'success');
      }
    });

    socket.on('ride:verify-otp:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socket.on('ride:complete:ack', (data?: { success?: boolean; rideRequestId?: string; isLastDrop?: boolean }) => {
      if (activeShuttleRef.current && data?.rideRequestId) {
        setActiveShuttle((prev) => {
          if (!prev) return null;
          const nextSequence = prev.sequence.map((s) =>
            s.rideRequestId === data.rideRequestId && s.type === 'DROP'
              ? { ...s, status: 'COMPLETED' as const }
              : s
          );
          const allCompleted = nextSequence.every((s) => s.status === 'COMPLETED');
          if (allCompleted || data.isLastDrop) {
            return null;
          }
          return {
            ...prev,
            sequence: nextSequence,
            completedRides: prev.completedRides + 1,
          };
        });
        addToast('Customer dropped!', 'success');
      } else {
        setActiveRide(null);
        addToast('Ride completed!', 'success');
      }
    });

    socket.on('ride:cancel:ack', () => {
      setActiveRide(null);
      addToast('Ride cancelled', 'info');
    });

    socket.on('ride:cancelled', (data: { message: string }) => {
      setActiveRide(null);
      addToast(data.message, 'warning');
    });

    socket.on('ride:location-updated', (data: { type: string }) => {
      addToast(`Admin updated ${data.type} location`, 'info');
    });

    socket.on('shuttle:listing:result', (data: { rides: ShuttleRide[] }) => {
      setShuttleListing(data.rides);
      setIsLoadingShuttleListing(false);
    });

    socket.on('shuttle:listing:error', (data: { message: string }) => {
      addToast(data.message, 'error');
      setIsLoadingShuttleListing(false);
    });

    socket.on('shuttle:accept:ack', (data: {
      shuttleSessionId: string;
      shuttle: any;
      rides: ShuttleRide[];
      navigationUrl: string;
    }) => {
      setActiveShuttle({
        shuttleSessionId: data.shuttleSessionId,
        status: 'ACTIVE',
        rides: data.rides,
        sequence: data.shuttle.sequence,
        navigationUrl: data.navigationUrl,
        totalRides: data.rides.length,
        completedRides: 0,
      });
      setShuttleListing([]);
      addToast(`Shuttle started with ${data.rides.length} ride(s)!`, 'success');
    });

    socket.on('shuttle:ride-added', (data: {
      shuttleSessionId: string;
      shuttle: any;
      newRides: ShuttleRide[];
      navigationUrl: string;
    }) => {
      setActiveShuttle((prev) => prev ? {
        ...prev,
        rides: [...prev.rides, ...data.newRides],
        sequence: data.shuttle.sequence,
        navigationUrl: data.navigationUrl,
        totalRides: data.shuttle.totalRides,
      } : null);
      setShuttleListing((prev) =>
        prev.filter((r) => !data.newRides.some((nr: ShuttleRide) => nr.rideRequestId === r.rideRequestId))
      );
      addToast(`${data.newRides.length} ride(s) added to shuttle`, 'success');
    });

    socket.on('shuttle:accept:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socket.on('shuttle:pickup-verify:ack', (data: {
      rideRequestId: string;
      dropEtaMinutes?: number;
      nextPickup?: ShuttleSequenceEntry | null;
    }) => {
      setActiveShuttle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          sequence: prev.sequence.map((s) =>
            s.rideRequestId === data.rideRequestId && s.type === 'PICKUP'
              ? { ...s, status: 'COMPLETED' as const, otpVerified: true }
              : s
          ),
          rides: prev.rides.map((r) =>
            r.rideRequestId === data.rideRequestId
              ? { ...r } : r
          ),
          nextPickup: data.nextPickup || null,
        };
      });
      addToast('OTP verified! Customer picked up.', 'success');
    });

    socket.on('shuttle:pickup-verify:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socket.on('shuttle:complete-drop:ack', (data: {
      rideRequestId: string;
      allDropsCompleted: boolean;
      nextPickup?: ShuttleSequenceEntry | null;
      nextDrop?: ShuttleSequenceEntry | null;
      updatedNavUrl?: string;
    }) => {
      setActiveShuttle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          sequence: prev.sequence.map((s) =>
            s.rideRequestId === data.rideRequestId && s.type === 'DROP'
              ? { ...s, status: 'COMPLETED' as const }
              : s
          ),
          completedRides: prev.completedRides + 1,
          nextPickup: data.nextPickup || null,
          nextDrop: data.nextDrop || null,
          navigationUrl: data.updatedNavUrl || prev.navigationUrl,
        };
      });
      addToast('Customer dropped!', 'success');
    });

    socket.on('shuttle:complete-drop:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socket.on('shuttle:navigation-url', (data: { url: string; shuttle: any }) => {
      setActiveShuttle((prev) => prev ? {
        ...prev,
        navigationUrl: data.url,
        sequence: data.shuttle.sequence,
      } : null);
    });

    socket.on('shuttle:navigate:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socket.on('shuttle:complete:ack', (data: { allDropsCompleted: boolean }) => {
      setActiveShuttle(null);
      addToast('Shuttle completed!', 'success');
    });

    socket.on('shuttle:complete:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socket.on('shuttle:cancel:ack', () => {
      setActiveShuttle(null);
      addToast('Shuttle cancelled', 'info');
    });

    socket.on('shuttle:cancel:error', (data: { message: string }) => {
      addToast(data.message, 'error');
    });

    socketRef.current = socket;

    const refreshInterval = setInterval(async () => {
      try {
        await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      } catch { /* ignore */ }
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(refreshInterval);
      socket.disconnect();
    };
  }, [driverId]);

  const goOnline = useCallback((lat: number, lng: number) => {
    if (!socketRef.current) return;
    lastLocationRef.current = { lat, lng };
    wasOnlineRef.current = true;
    socketRef.current.emit('driver:online', { latitude: lat, longitude: lng });
    setIsOnline(true);
  }, []);

  const goOffline = useCallback(() => {
    if (!socketRef.current) return;
    wasOnlineRef.current = false;
    lastLocationRef.current = null;
    socketRef.current.emit('driver:offline');
    setIsOnline(false);
  }, []);

  const updateLocation = useCallback((lat: number, lng: number) => {
    if (!socketRef.current) return;
    lastLocationRef.current = { lat, lng };
    socketRef.current.emit('driver:location', { latitude: lat, longitude: lng });
  }, []);

  const acceptRide = useCallback((rideRequestId: string) => {
    if (!socketRef.current) return;
    // Stash the ride details so the ack handler can build activeRide on success.
    const incoming = incomingRides.find((r) => r.rideRequestId === rideRequestId);
    pendingAcceptRef.current = incoming || null;
    socketRef.current.emit('ride:accept', { rideRequestId });
    // Optimistic: remove from incoming list immediately. Do NOT set activeRide
    // until the server confirms (ride:accept:ack) — otherwise the UI flashes
    // ACCEPTED before reverting on race or rejection.
    console.log('[FRONTEND_STATE]', 'incomingRides cleared / filtered', {
      reason: 'acceptRide (optimistic remove)',
      rideRequestId
    });
    setIncomingRides((prev) => prev.filter((r) => r.rideRequestId !== rideRequestId));
  }, [incomingRides]);

  const rejectRide = useCallback((rideRequestId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('ride:reject', { rideRequestId });
    console.log('[FRONTEND_STATE]', 'incomingRides cleared / filtered', {
      reason: 'rejectRide',
      rideRequestId
    });
    setIncomingRides((prev) => prev.filter((r) => r.rideRequestId !== rideRequestId));
  }, []);

  const headToPickup = useCallback((rideRequestId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('ride:head-to-pickup', { rideRequestId });
  }, []);

  const verifyOtp = useCallback((rideRequestId: string, otp: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('ride:verify-otp', { rideRequestId, otp });
  }, []);

  const completeRide = useCallback((rideRequestId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('ride:complete', { rideRequestId });
  }, []);

  const cancelRide = useCallback((rideRequestId: string, reason?: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('ride:cancel', { rideRequestId, reason });
  }, []);

  const fetchShuttleListing = useCallback((lat: number, lng: number) => {
    if (!socketRef.current) return;
    setIsLoadingShuttleListing(true);
    socketRef.current.emit('shuttle:listing', { latitude: lat, longitude: lng });
  }, []);

  const enterShuttleMode = useCallback(() => {
    setShuttleMode(true);
    if (lastLocationRef.current) {
      fetchShuttleListing(lastLocationRef.current.lat, lastLocationRef.current.lng);
    }
  }, [fetchShuttleListing]);

  const exitShuttleMode = useCallback(() => {
    setShuttleMode(false);
    setShuttleListing([]);
    setIsLoadingShuttleListing(false);
  }, []);

  const acceptShuttleRides = useCallback((rideRequestIds: string[]) => {
    if (!socketRef.current) return;
    socketRef.current.emit('shuttle:accept', { rideRequestIds });
  }, []);

  const verifyShuttlePickup = useCallback((shuttleSessionId: string, rideRequestId: string, otp: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('shuttle:pickup-verify', { shuttleSessionId, rideRequestId, otp });
  }, []);

  const completeShuttleDrop = useCallback((shuttleSessionId: string, rideRequestId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('shuttle:complete-drop', { shuttleSessionId, rideRequestId });
  }, []);

  const getShuttleNavigationUrl = useCallback((shuttleSessionId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('shuttle:navigate', { shuttleSessionId });
  }, []);

  const cancelShuttle = useCallback((shuttleSessionId: string, reason?: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('shuttle:cancel', { shuttleSessionId, reason });
  }, []);

  return {
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
  };
}