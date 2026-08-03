export const queryKeys = {
  customer: {
    all: ['customer'] as const,
    profile: () => [...queryKeys.customer.all, 'profile'] as const,
    trips: (params?: { page?: number; limit?: number }) =>
      [...queryKeys.customer.all, 'trips', params ?? {}] as const,
    trip: (id: string) => [...queryKeys.customer.all, 'trips', id] as const,
    subscription: () => [...queryKeys.customer.all, 'subscription'] as const,
  },
  ride: {
    my: (params?: any) => ['rides', 'my', params] as const,
    active: () => ['rides', 'active'] as const,
    detail: (id: string) => ['rides', id] as const,
  },
  driver: {
    all: ['driver'] as const,
    profile: () => [...queryKeys.driver.all, 'profile'] as const,
    trips: (params?: { page?: number; limit?: number; scope?: string }) =>
      [...queryKeys.driver.all, 'trips', params ?? {}] as const,
    trip: (id: string) => [...queryKeys.driver.all, 'trips', id] as const,
    customers: (tripId: string) =>
      [...queryKeys.driver.all, 'trips', tripId, 'customers'] as const,
  },
};
