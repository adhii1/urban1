'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { queryKeys } from '@/lib/api/queryKeys';
import { useDriverStore } from '@/stores/driverStore';
import { useToast } from '@/stores/toastStore';
import { SOCKET_URL } from '@/lib/apiBase';

type DriverOperation = { event?: string; passengerCount?: number; rating?: number; message?: string };

export function useDriverOperationSync() {
  const queryClient = useQueryClient();
  const driverId = useDriverStore((state) => state.driverId);
  const accessToken = useDriverStore((state) => state.accessToken);
  const { showToast } = useToast();

  useEffect(() => {
    if (!driverId) return;
    const socket = io(`${SOCKET_URL}/sockets/driver`, { auth: { token: accessToken, driverId }, withCredentials: true, transports: ['websocket', 'polling'] });
    const refreshTrips = (operation: DriverOperation) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driver.all });
      showToast(operation.event === 'SUBSCRIPTION_CANCELLED' ? 'A passenger subscription changed. Your trip manifest was refreshed.' : 'Your assigned trip manifest was updated.', 'info');
    };
    socket.on('trip:manifest:changed', refreshTrips);
    socket.on('rating:received', (operation: DriverOperation) => showToast(operation.message || `You received a ${operation.rating}-star rating.`, 'success'));
    return () => { socket.disconnect(); };
  }, [accessToken, driverId, queryClient, showToast]);
}
