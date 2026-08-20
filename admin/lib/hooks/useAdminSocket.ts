'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAdminStore } from '@/stores/adminStore';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
  'http://localhost:4000';

export function useAdminSocket() {
  const socketRef = useRef<Socket | null>(null);
  const adminUserIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const { adminUserId, accessToken } = useAdminStore();

  const [onlineDrivers, setOnlineDrivers] = useState(0);
  const [onlineCustomers, setOnlineCustomers] = useState(0);
  const [activeRides, setActiveRides] = useState<any[]>([]);
  const [activeShuttles, setActiveShuttles] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    adminUserIdRef.current = adminUserId;
    tokenRef.current = accessToken;
  }, [adminUserId, accessToken]);

  useEffect(() => {
    if (!adminUserId) return;

    const socket = io(`${SOCKET_URL}/sockets/admin`, {
      auth: { token: tokenRef.current!, userId: adminUserIdRef.current! },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('admin:drivers:online');
      socket.emit('admin:customers:online');
      socket.emit('admin:rides:active');
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('admin:drivers:online:response', (data: { count: number; drivers: any[] }) => {
      setOnlineDrivers(data.count);
    });

    socket.on('admin:customers:online:response', (data: { count: number }) => {
      setOnlineCustomers(data.count);
    });

    socket.on('admin:rides:active:response', (data: { rides: any[] }) => {
      setActiveRides(data.rides || []);
    });

    socket.on('ride:new', (data: any) => {
      setActiveRides((prev) => [data, ...prev]);
    });

    socket.on('ride:update', (data: { rideRequestId: string; status: string; driverId?: string; etaMinutes?: number }) => {
      setActiveRides((prev) =>
        prev.map((r) => {
          const rid = r._id || r.rideRequestId;
          if (rid === data.rideRequestId) {
            return { ...r, status: data.status, etaMinutes: data.etaMinutes };
          }
          return r;
        })
      );
    });

    socket.on('trip:update', (data: { tripId: string; status: string; event: string; updatedAt?: string }) => {
      setActiveRides((prev) => {
        const existing = prev.find((ride) => (ride._id || ride.tripId) === data.tripId);
        if (existing) return prev.map((ride) => (ride._id || ride.tripId) === data.tripId ? { ...ride, ...data } : ride);
        return [{ _id: data.tripId, type: 'SHUTTLE', ...data }, ...prev];
      });
    });

    socket.on('admin:shuttles:active:response', (data: { shuttles: any[] }) => {
      setActiveShuttles(data.shuttles || []);
    });

    socket.on('admin:shuttle:detail:response', (data: { shuttle: any; rides: any[]; driver: any }) => {
      setActiveShuttles((prev) =>
        prev.map((s) => (s._id === data.shuttle._id ? { ...s, ...data.shuttle, rides: data.rides, driver: data.driver } : s))
      );
    });

    socket.on('shuttle:new', (data: { shuttleSessionId: string; driverId: string; rideCount: number }) => {
      setActiveShuttles((prev) => [...prev, { _id: data.shuttleSessionId, driverId: data.driverId, totalRides: data.rideCount, status: 'ACTIVE' }]);
    });

    socket.on('shuttle:cancelled', (data: { shuttleSessionId: string }) => {
      setActiveShuttles((prev) => prev.filter((s) => s._id !== data.shuttleSessionId));
    });

    socketRef.current = socket;

    // Refresh counts every 30s
    const interval = setInterval(() => {
      socket.emit('admin:drivers:online');
      socket.emit('admin:customers:online');
    }, 30000);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [adminUserId]);

  const reassignRide = useCallback((rideRequestId: string, driverId: string) => {
    socketRef.current?.emit('admin:ride:reassign', { rideRequestId, driverId });
  }, []);

  const updateRideLocation = useCallback(
    (rideRequestId: string, type: 'pickup' | 'drop', address: string, coordinates: [number, number]) => {
      socketRef.current?.emit('admin:ride:update-location', {
        rideRequestId,
        type,
        address,
        coordinates,
      });
    },
    []
  );

  const updateDriverLocation = useCallback((driverId: string, latitude: number, longitude: number) => {
    socketRef.current?.emit('admin:driver:update-location', { driverId, latitude, longitude });
  }, []);

  const fetchActiveShuttles = useCallback(() => {
    socketRef.current?.emit('admin:shuttles:active');
  }, []);

  const fetchShuttleDetail = useCallback((shuttleSessionId: string) => {
    socketRef.current?.emit('admin:shuttle:detail', { shuttleSessionId });
  }, []);

  const cancelShuttle = useCallback((shuttleSessionId: string) => {
    socketRef.current?.emit('admin:shuttle:cancel', { shuttleSessionId });
  }, []);

  return {
    isConnected,
    onlineDrivers,
    onlineCustomers,
    activeRides,
    activeShuttles,
    reassignRide,
    updateRideLocation,
    updateDriverLocation,
    fetchActiveShuttles,
    fetchShuttleDetail,
    cancelShuttle,
  };
}
