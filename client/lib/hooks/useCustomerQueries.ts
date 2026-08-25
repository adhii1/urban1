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
  manifest?: unknown[];
  fare?: {
    estimated?: number;
    final?: number;
    details?: {
      distanceKm?: number;
      durationMinutes?: number;
    };
  };
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
  subscriptionType?: string;
  pickupTime?: string;
  scheduleDays?: number[];
  /** How many live subscriptions this customer holds, this one included. */
  subscriptionCount?: number;
  /** The customer's other live subscriptions, if any. */
  otherSubscriptions?: SubscriptionData[];
}

export interface SubscriptionListData {
  subscriptions: SubscriptionData[];
  count: number;
  /** The one Customer.subscriptionId points at — a display hint, not a limit. */
  primarySubscriptionId: string | null;
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

/** The primary subscription only. Use useCustomerSubscriptions() for all of them. */
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

/**
 * Every subscription the customer holds. A customer can run several at once —
 * a weekday commute at 08:00, an evening return at 18:00, a Saturday shuttle —
 * so this, not useCustomerSubscription, is the authoritative view.
 */
export function useCustomerSubscriptions(includeInactive = false) {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: queryKeys.customer.subscriptions(includeInactive),
    queryFn: () =>
      api.get<SubscriptionListData>(
        `/customer/subscriptions${includeInactive ? '?includeInactive=true' : ''}`
      ),
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
    // subscriptionId is required once more than one subscription is live —
    // the API replies 400 with the candidate list if it's omitted.
    mutationFn: ({ date, subscriptionId }: { date: string; subscriptionId?: string }) =>
      api.post('/customer/pause-request', subscriptionId ? { date, subscriptionId } : { date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.subscription() });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.customer.all, 'subscriptions'] });
      showToast('Pause request submitted successfully', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'Failed to submit pause request', 'error');
    },
  });
}

// --- Plan Browse & Subscription Purchase ---

export interface PlanDetail {
  _id: string;
  name: string;
  serviceType: string;
  tier: string;
  description: string;
  durationDays: number;
  price: number;
  pauseDaysAllowed: number;
  features: string[];
  bookingRules?: {
    maxPassengersPerBooking?: number;
    minAdvanceBookingMinutes?: number;
    allowedDaysPerWeek?: number;
    allowedWeekdays?: number[];
    isAlternateDay?: boolean;
    isSharedRide?: boolean;
    useManagedStops?: boolean;
  };
}

export interface RouteDetail {
  _id: string;
  name: string;
  startLocation: string;
  endLocation: string;
  stops: Array<{
    stopName: string;
    sequenceOrder: number;
    location?: { coordinates?: number[] };
  }>;
}

export interface BookingEligibility {
  eligible: boolean;
  reason?: string;
  plan?: {
    name: string;
    tier: string;
    isSharedRide: boolean;
    useManagedStops: boolean;
    maxPassengersPerBooking: number;
    minAdvanceBookingMinutes: number;
  };
  subscription?: {
    pickupStopIndex?: number;
    dropStopIndex?: number;
    bookingsThisWeek?: number;
  };
  selectedWeekdays?: number[];
}

export function useBrowsePlans(serviceType?: string) {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  const params = serviceType ? `?serviceType=${encodeURIComponent(serviceType)}` : '';
  return useQuery({
    queryKey: ['plans', serviceType],
    queryFn: () => api.get<PlanDetail[]>(`/customer/plans${params}`),
    enabled: isLoggedIn,
    staleTime: 5 * 60 * 1000,
    select: (d) => d.data,
  });
}

export function useRoutesForPlan(planId: string) {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: ['plan-routes', planId],
    queryFn: () => api.get<RouteDetail[]>(`/customer/plans/${planId}/routes`),
    enabled: isLoggedIn && !!planId,
    staleTime: 5 * 60 * 1000,
    select: (d) => d.data,
  });
}

export function useBookingEligibility() {
  const isLoggedIn = useCustomerStore((s) => s.isLoggedIn);
  return useQuery({
    queryKey: ['booking-eligibility'],
    queryFn: () => api.get<BookingEligibility>('/customer/subscriptions/booking-eligibility'),
    enabled: isLoggedIn,
    staleTime: 60 * 1000,
    select: (d) => d.data,
  });
}

export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: {
      planId: string;
      routeId: string;
      startDate: string;
      selectedWeekdays?: number[];
      pickupStopIndex?: number;
      dropStopIndex?: number;
    }) => api.post('/customer/subscriptions/purchase', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.subscription() });
    },
    onError: (err: Error) => {
      showToast(err.message || 'Failed to initiate purchase', 'error');
    },
  });
}

export function useVerifySubscriptionPayment() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: {
      subscriptionId: string;
      orderId: string;
      paymentId: string;
      signature: string;
    }) => api.post('/customer/subscriptions/verify-payment', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.subscription() });
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.profile() });
      showToast('Subscription activated successfully!', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'Payment verification failed', 'error');
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    // Pass the subscriptionId to say which commute to cancel. It's required
    // once the customer holds more than one; the API replies 400 with the
    // candidate list if it's omitted.
    mutationFn: (subscriptionId?: string) =>
      api.post('/customer/subscriptions/cancel', subscriptionId ? { subscriptionId } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.subscription() });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.customer.all, 'subscriptions'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.customer.profile() });
      showToast('Subscription cancelled', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'Failed to cancel subscription', 'error');
    },
  });
}
