'use client';

import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { api, type ApiResponse } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queryKeys';
import { useDriverStore } from '@/stores/driverStore';
import { useToast } from '@/stores/toastStore';

// --- Types ---

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  driverCode?: string;
  vehicleNumber: string;
  vehicleModel: string;
  vehicleCapacity: number;
  licenseNumber: string;
  upiId?: string;
  bankDetails?: { accountHolderName?: string; accountNumber?: string; ifsc?: string } | null;
  route: any;
  status: string;
}

export interface DriverTrip {
  _id: string;
  routeId?: { name?: string; stops?: any[]; startLocation?: string; endLocation?: string };
  route?: { name?: string; stops?: any[] };
  driverId?: any;
  tripDate?: string;
  scheduledTime?: string;
  status: string;
  customers?: any[];
  manifest?: any[];
}

// --- Profile ---

export function useDriverProfile() {
  const isLoggedIn = useDriverStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.driver.profile(),
    queryFn: () => api.get<DriverProfile>('/driver/profile'),
    enabled: isLoggedIn,
    staleTime: 5 * 60 * 1000,
    select: (d) => d.data,
  });
}

// --- Trips ---

export function useDriverTrips(page = 1, limit = 20, scope = 'today') {
  const isLoggedIn = useDriverStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.driver.trips({ page, limit, scope }),
    queryFn: () =>
      api.get<DriverTrip[]>(`/driver/trips?page=${page}&limit=${limit}&scope=${scope}`),
    enabled: isLoggedIn,
    staleTime: 30 * 1000,
    select: (d) => ({ data: d.data, meta: d.meta }),
  });
}

export function useDriverTrip(id: string) {
  const isLoggedIn = useDriverStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.driver.trip(id),
    queryFn: () => api.get<DriverTrip>(`/driver/trips/${id}`),
    enabled: isLoggedIn && !!id,
    staleTime: 15 * 1000,
    select: (d) => d.data,
  });
}

// --- Current Trip (trip in SCHEDULED or IN_PROGRESS status) ---

export function useDriverCurrentTrip() {
  const isLoggedIn = useDriverStore((s) => s.isLoggedIn);
  const setCurrentTrip = useDriverStore((s) => s.setCurrentTrip);

  return useQuery({
    queryKey: queryKeys.driver.trips({ page: 1, limit: 50 }),
    queryFn: () =>
      api.get<DriverTrip[]>('/driver/trips?page=1&limit=50'),
    enabled: isLoggedIn,
    staleTime: 15 * 1000,
    select: (d) => {
      const active = (d.data || []).find(
        (t: DriverTrip) => t.status === 'SCHEDULED' || t.status === 'IN_PROGRESS',
      );
      return active || null;
    },
  });
}

// --- Earnings ---

export interface DriverEarnings {
  totalEarnings: number;
  totalTrips: number;
  totalDistance: number;
  totalDuration: number;
  period: string;
}

export function useDriverEarnings(period: string = 'today') {
  const isLoggedIn = useDriverStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.driver.earnings?.(period) || ['driver', 'earnings', period],
    queryFn: () => api.get<DriverEarnings>(`/driver/earnings?period=${period}`),
    enabled: isLoggedIn,
    staleTime: 30 * 1000,
    select: (d) => d.data,
  });
}

// --- Dashboard (concurrent queries) ---

export function useDriverDashboard() {
  const isLoggedIn = useDriverStore((s) => s.isLoggedIn);
  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.driver.trips({ page: 1, limit: 50 }),
        queryFn: () =>
          api.get<DriverTrip[]>('/driver/trips?page=1&limit=50'),
        enabled: isLoggedIn,
        staleTime: 30 * 1000,
        select: (d: ApiResponse<DriverTrip[]>) => d.data,
      },
    ],
  });

  return {
    trips: results[0],
    isLoading: results[0]?.isLoading,
    isError: results[0]?.isError,
    error: results[0]?.error,
  };
}

// --- Mutations ---

export function useStartTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripId: string) =>
      api.patch(`/driver/trips/${tripId}/start`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driver.trips() });
    },
  });
}

export function useCompleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripId: string) =>
      api.patch(`/driver/trips/${tripId}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driver.trips() });
    },
  });
}

export function useUpdateManifest() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({
      tripId,
      customerId,
      action,
    }: {
      tripId: string;
      customerId: string;
      action: 'board' | 'drop' | 'no-show';
    }) =>
      api.patch(
        `/driver/trips/${tripId}/manifest/${customerId}/${action}`,
        {},
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driver.trip(variables.tripId) });
    },
    onError: (err: Error) => {
      showToast(err.message || 'Action failed', 'error');
    },
  });
}
