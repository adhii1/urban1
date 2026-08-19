import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCustomerStore } from '@/stores/customerStore';
import { useToastStore } from '@/stores/toastStore';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:4000';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 min (before 15-min JWT expiry)

interface SelectedLocation {
  address: string;
  coordinates: [number, number];
}

export interface FareBreakdown {
  baseFare: number;
  distanceCharge: number;
  timeCharge: number;
  nightCharge: number;
  surgeCharge: number;
}

export interface RideRequest {
  _id: string;
  status: string;
  pickupIntent?: 'IMMEDIATE' | 'SCHEDULED';
  scheduledPickupAt?: string;
  pickupLocation: { address: string; coordinates: [number, number] };
  dropLocation: { address: string; coordinates: [number, number] };
  stops?: Array<{ address: string; coordinates: [number, number]; sequenceOrder: number }>;
  acceptedDriverId?: {
    _id: string;
    name: string;
    phone?: string;
    vehicleNumber: string;
    vehicleModel: string;
    currentLocation?: { coordinates: [number, number] };
  };
  otp?: { code: string };
  matchedDrivers?: Array<{ driverId: string; distanceKm: number }>;
  createdAt: string;
  etaMinutes?: number;
  pickupEtaMinutes?: number;
  dropoffEtaMinutes?: number;
  // Fare and trip details
  fareEstimate?: number;
  fareBreakdown?: FareBreakdown;
  tripDuration?: number;
  tripDistance?: number;
  surgeInfo?: { multiplier: number; label: string } | null;
  // Live tracking
  driverEtaType?: 'pickup' | 'drop';
  distanceToDestination?: number;
  // Completion
  completedFare?: number;
  rideDurationMinutes?: number;
  isRated?: boolean;
  fareDetails?: {
    distanceKm: number;
    durationMinutes: number;
    surgeMultiplier: number;
    surgeLabel: string;
    isNightTime: boolean;
  };
}

export function useRideBooking() {
  const socketRef = useRef<Socket | null>(null);
  const userId = useCustomerStore((s) => s.userId);
  const accessToken = useCustomerStore((s) => s.accessToken);
  const userIdRef = useRef(userId);
  const accessTokenRef = useRef(accessToken);
  const addToast = useToastStore((s) => s.addToast);

  const [activeRide, setActiveRide] = useState<RideRequest | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    userIdRef.current = userId;
    accessTokenRef.current = accessToken;
  }, [userId, accessToken]);

  useEffect(() => {
    if (!userId) return;

    const socket = io(`${SOCKET_URL}/sockets/customer`, {
      auth: { token: accessTokenRef.current, userId: userIdRef.current! },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('ride:request:ack', (data) => {
      const status = data.status || (data.pickupIntent === 'SCHEDULED' ? 'SCHEDULED' : 'PENDING');
      setIsSearching(status === 'PENDING');
      setActiveRide({
        _id: data.rideRequestId,
        status,
        pickupIntent: data.pickupIntent,
        scheduledPickupAt: data.scheduledPickupAt || undefined,
        pickupLocation: { address: '', coordinates: [0, 0] },
        dropLocation: { address: '', coordinates: [0, 0] },
        createdAt: new Date().toISOString(),
        fareEstimate: data.fareEstimate,
        fareBreakdown: data.fareBreakdown,
        tripDuration: data.tripDuration,
        tripDistance: data.tripDistance,
        surgeInfo: data.surgeInfo,
      });
      addToast(data.message, 'info');
    });

    socket.on('ride:request:error', (data) => {
      setIsSearching(false);
      addToast(data.message, 'error');
    });

    socket.on('ride:accepted', (data) => {
      setIsSearching(false);
      setActiveRide((prev) => ({
        ...(prev || {}),
        _id: data.rideRequestId,
        status: 'ACCEPTED',
        acceptedDriverId: data.driver,
        otp: { code: data.otp },
        pickupEtaMinutes: data.etaMinutes,
        pickupLocation: data.pickup || prev?.pickupLocation,
        dropLocation: data.drop || prev?.dropLocation,
        createdAt: prev?.createdAt || new Date().toISOString(),
      }));
      addToast(`${data.driver.name} accepted your ride! OTP: ${data.otp}`, 'success');
    });

    socket.on('ride:driver-arriving', (data: { rideRequestId: string; etaMinutes: number; message: string }) => {
      setActiveRide((prev) => prev ? {
        ...prev,
        status: 'DRIVER_ARRIVING',
        pickupEtaMinutes: data.etaMinutes,
      } : null);
      addToast(data.message, 'success');
    });

    socket.on('ride:started', (data) => {
      setActiveRide((prev) => prev ? { ...prev, status: 'IN_PROGRESS' } : null);
      addToast(data.message, 'success');
    });

    socket.on('ride:completed', (data) => {
      setActiveRide((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'COMPLETED',
          completedFare: data.fare?.final,
          rideDurationMinutes: data.durationMinutes,
          fareBreakdown: data.fare?.breakdown,
          fareDetails: data.fare?.details,
        };
      });
      addToast(data.message, 'success');
      
      // Show rating prompt after 2 seconds
      setTimeout(() => {
        addToast('How was your ride? Rate your driver!', 'info');
      }, 2000);
    });

    socket.on('ride:cancelled', (data) => {
      setActiveRide(null);
      addToast(data.message, 'warning');
    });

    socket.on('ride:rematching', (data) => {
      // Driver cancelled, system is finding a new driver
      setActiveRide((prev) => prev ? {
        ...prev,
        status: 'PENDING',
        acceptedDriverId: undefined,
        otp: undefined,
      } : null);
      addToast(data.message, 'info');
      setIsSearching(true);
    });

    socket.on('ride:cancel:ack', (data: { success?: boolean; cancellationFee?: number; message?: string }) => {
      setIsSearching(false);
      setActiveRide(null);
      addToast(data.message || 'Ride cancelled successfully', data.cancellationFee ? 'warning' : 'success');
    });

    socket.on('ride:expired', (data) => {
      setIsSearching(false);
      setActiveRide(null);
      addToast(data.message, 'warning');
    });

    socket.on('driver:location:update', (data) => {
      setActiveRide((prev) => {
        if (!prev || !prev.acceptedDriverId) return prev;
        const updated: RideRequest = {
          ...prev,
          acceptedDriverId: {
            ...prev.acceptedDriverId,
            currentLocation: { coordinates: data.coordinates },
          },
        };
        // Update ETA based on type (pickup or drop)
        if (data.etaType === 'pickup' && data.etaMinutes) {
          updated.pickupEtaMinutes = data.etaMinutes;
          updated.driverEtaType = 'pickup';
        } else if (data.etaType === 'drop' && data.etaMinutes) {
          updated.dropoffEtaMinutes = data.etaMinutes;
          updated.driverEtaType = 'drop';
          updated.distanceToDestination = data.distanceKm;
        }
        return updated;
      });
    });

    socket.on('ride:location-updated', (data) => {
      addToast(`${data.type} location updated`, 'info');
    });

    socketRef.current = socket;

    // Periodically refresh access token via httpOnly cookie to keep socket
    // auth valid across reconnections (JWT expires in 15 min).
    const refreshInterval = setInterval(async () => {
      try {
        await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      } catch { /* ignore */ }
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(refreshInterval);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ETA countdown timer for DRIVER_ARRIVING state
  useEffect(() => {
    if (!activeRide || activeRide.status !== 'DRIVER_ARRIVING' || !activeRide.pickupEtaMinutes) return;
    const interval = setInterval(() => {
      setActiveRide((prev) => {
        if (!prev || prev.status !== 'DRIVER_ARRIVING' || !prev.pickupEtaMinutes) return prev;
        const next = prev.pickupEtaMinutes - 1;
        return next <= 0 ? prev : { ...prev, pickupEtaMinutes: next };
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [activeRide?.status, activeRide?.pickupEtaMinutes]);

  const requestRide = useCallback((
    pickup: SelectedLocation,
    drop: SelectedLocation,
    stops?: Array<{ address: string; coordinates: [number, number]; sequenceOrder: number }>,
    booking: { pickupIntent: 'IMMEDIATE' | 'SCHEDULED'; scheduledPickupAt?: string } = { pickupIntent: 'IMMEDIATE' },
  ) => {
    if (!socketRef.current) return;
    socketRef.current.emit('ride:request', { pickup, drop, stops, ...booking });
  }, []);

  const cancelRide = useCallback((rideRequestId: string, reason?: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('ride:cancel', { rideRequestId, reason });
  }, []);

  const rateRide = useCallback(async (rideId: string, rating: number): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/customer/rides/${rideId}/rate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  }, []);

  const completedRideId = activeRide?.status === 'COMPLETED' ? activeRide._id : null;

  return { activeRide, isConnected, isSearching, requestRide, cancelRide, rateRide, completedRideId };
}
