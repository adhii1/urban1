'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { queryKeys } from '@/lib/api/queryKeys';
import { useCustomerStore } from '@/stores/customerStore';
import { useToast } from '@/stores/toastStore';
import { SOCKET_URL } from '@/lib/apiBase';

type TripUpdate = {
  tripId: string;
  status: string;
  event: string;
  passengerStatus?: string;
};

function messageFor(update: TripUpdate) {
  if (update.event === 'STARTED') return 'Your scheduled commute has started.';
  if (update.event === 'COMPLETED') return 'Your scheduled commute has been completed.';
  if (update.passengerStatus === 'BOARDED') return 'You have been marked as boarded.';
  if (update.passengerStatus === 'DROPPED') return 'You have arrived at your stop.';
  if (update.passengerStatus === 'NO_SHOW') return 'You were marked as a no-show for this trip.';
  return 'Your scheduled commute has been updated.';
}

export function useCustomerTripSync() {
  const queryClient = useQueryClient();
  const userId = useCustomerStore((state) => state.userId);
  const accessToken = useCustomerStore((state) => state.accessToken);
  const { showToast } = useToast();

  useEffect(() => {
    if (!userId) return;

    const socket = io(`${SOCKET_URL}/sockets/customer`, {
      auth: { token: accessToken, userId },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('trip:update', (update: TripUpdate) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.all });
      showToast(messageFor(update), update.passengerStatus === 'NO_SHOW' ? 'warning' : 'info');
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, queryClient, showToast, userId]);
}
