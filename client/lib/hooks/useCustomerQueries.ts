'use client';

import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { api, type ApiResponse } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queryKeys';
import { useCustomerStore } from '@/stores/customerStore';
import { useToast } from '@/stores/toastStore';

// --- Types ---

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  homeLocation?: { address?: string; coordinates?: number[] };
  pickupLocation?: { address?: string; coordinates?: number[] };
  dropLocation?: { address?: string; coordinates?: number[] };
  subscription?: any;
}

export interface TripEntry {
  _id: string;
  routeId?: { name?: string; startLocation?: string; endLocation?: string; stops?: any[] };
  driverId?: { _id?: string; name?: string; vehicleNumber?: string };
  tripDate?: string;
  scheduledAt?: string;
  status: string;
  routeName?: string;
  route?: string;
  pickup?: string;
  drop?: string;
  vehicle?: string;
  myEntry?: {
    pickupStop?: { stopName?: string; sequenceOrder?: number };
    dropStop?: { stopName?: string; sequenceOrder?: number };
    status?: string;
  };
  manifest?: any[];
}

export interface PlanInfo {
  _id: string;
  name: string;
  serviceType: string;
  tier: string;
  description: string;
  price: number;
  features: string[];
}

export interface RouteInfo {
  _id: string;
  name: string;
  startLocation: string;
  endLocation: string;
}

export interface SubscriptionData {
  _id: string;
  planId?: PlanInfo;
  planType?: string;
  plan?: string;
  routeId?: RouteInfo;
  status: string;
  startDate?: string;
  endDate?: string;
  remainingPauseDays?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Profile ---

export function useCustomerProfile() {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.customer.profile(),
    queryFn: () => api.get<CustomerProfile>('/customer/profile'),
    enabled: isLoggedIn,
    staleTime: 5 * 60 * 1000,
    select: (d) => d.data,
  });
}

// --- Trips ---

export function useCustomerTrips(page = 1, limit = 20) {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.customer.trips({ page, limit }),
    queryFn: () =>
      api.get<TripEntry[]>(`/customer/trips?page=${page}&limit=${limit}`),
    enabled: isLoggedIn,
    staleTime: 30 * 1000,
    select: (d) => ({ data: d.data, meta: d.meta }),
  });
}

export function useCustomerTrip(id: string) {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.customer.trip(id),
    queryFn: () => api.get<TripEntry>(`/customer/trips/${id}`),
    enabled: isLoggedIn && !!id,
    staleTime: 30 * 1000,
    select: (d) => d.data,
  });
}

// --- Subscription ---

export function useCustomerSubscription() {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.customer.subscription(),
    queryFn: () => api.get<SubscriptionData>('/customer/subscription'),
    enabled: isLoggedIn,
    staleTime: 2 * 60 * 1000,
    select: (d) => d.data,
  });
}

// --- Dashboard (concurrent profile + trips + subscription) ---

export function useCustomerDashboard() {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  const results = useQueries({
    queries: [
      {
        queryKey: queryKeys.customer.profile(),
        queryFn: () => api.get<CustomerProfile>('/customer/profile'),
        enabled: isLoggedIn,
        staleTime: 5 * 60 * 1000,
        select: (d: ApiResponse<CustomerProfile>) => d.data,
      },
      {
        queryKey: queryKeys.customer.trips({ page: 1, limit: 5 }),
        queryFn: () =>
          api.get<TripEntry[]>('/customer/trips?page=1&limit=5'),
        enabled: isLoggedIn,
        staleTime: 30 * 1000,
        select: (d: ApiResponse<TripEntry[]>) => d.data,
      },
      {
        queryKey: queryKeys.customer.subscription(),
        queryFn: () => api.get<SubscriptionData>('/customer/subscription'),
        enabled: isLoggedIn,
        staleTime: 2 * 60 * 1000,
        select: (d: ApiResponse<SubscriptionData>) => d.data,
      },
    ],
  });

  return {
    profile: results[0],
    trips: results[1],
    subscription: results[2],
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    errors: results.filter((r) => r.error).map((r) => r.error),
  };
}

// --- Mutations ---

export function usePauseSubscription() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (date: string) =>
      api.post('/customer/pause-request', { date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.subscription() });
      showToast('Pause request submitted successfully', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'Failed to submit pause request', 'error');
    },
  });
}
