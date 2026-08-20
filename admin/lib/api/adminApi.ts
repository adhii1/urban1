const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const fetchOptions: RequestInit = {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  };

  let res = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

  if (res.status === 401) {
    const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (refreshRes.ok) {
      res = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    } else {
      // Don't auto-logout — just throw so the calling code can decide
      throw new Error('SESSION_EXPIRED');
    }
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`Request failed with code ${res.status}`);
    }
    return { success: true } as T;
  }

  if (!res.ok) {
    throw new Error(data.message || `Request failed with code ${res.status}`);
  }

  return data;
}

export const adminApi = {
  // Dashboard
  getDashboard: () => apiFetch('/admin/dashboard'),

  // Drivers
  getDrivers: () => apiFetch('/admin/drivers'),
  getDriver: (id: string) => apiFetch(`/admin/drivers/${id}`),
  createDriver: (data: any) =>
    apiFetch('/admin/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id: string, data: any) =>
    apiFetch(`/admin/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDriver: (id: string) =>
    apiFetch(`/admin/drivers/${id}`, { method: 'DELETE' }),

  // Customers
  getCustomers: () => apiFetch('/admin/customers'),
  getCustomer: (id: string) => apiFetch(`/admin/customers/${id}`),
  createCustomer: (data: any) =>
    apiFetch('/admin/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: any) =>
    apiFetch(`/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCustomer: (id: string) =>
    apiFetch(`/admin/customers/${id}`, { method: 'DELETE' }),
  banCustomer: (id: string) =>
    apiFetch(`/admin/customers/${id}/ban`, { method: 'POST' }),

  // Trips
  getTrips: (params?: string) =>
    apiFetch(`/admin/trips${params ? `?${params}` : ''}`),
  getTrip: (id: string) => apiFetch(`/admin/trips/${id}`),
  createTrip: (data: any) =>
    apiFetch('/admin/trips', { method: 'POST', body: JSON.stringify(data) }),
  updateTrip: (id: string, data: any) =>
    apiFetch(`/admin/trips/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTrip: (id: string) =>
    apiFetch(`/admin/trips/${id}`, { method: 'DELETE' }),
  reassignTrip: (id: string, data: any) =>
    apiFetch(`/admin/trips/${id}/reassign`, { method: 'POST', body: JSON.stringify(data) }),

  // Operational exceptions
  getOperationalExceptions: (params?: string) =>
    apiFetch(`/admin/operations/exceptions${params ? `?${params}` : ''}`),
  resolveOperationalException: (id: string, data: any) =>
    apiFetch(`/admin/operations/exceptions/${id}/resolve`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Routes
  getRoutes: () => apiFetch('/admin/routes'),
  getRoute: (id: string) => apiFetch(`/admin/routes/${id}`),
  createRoute: (data: any) =>
    apiFetch('/admin/routes', { method: 'POST', body: JSON.stringify(data) }),
  updateRoute: (id: string, data: any) =>
    apiFetch(`/admin/routes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRoute: (id: string) =>
    apiFetch(`/admin/routes/${id}`, { method: 'DELETE' }),

  // Subscriptions
  getSubscriptions: (params?: string) =>
    apiFetch(`/admin/subscriptions${params ? `?${params}` : ''}`),
  getSubscription: (id: string) =>
    apiFetch(`/admin/subscriptions/${id}`),
  createSubscription: (data: any) =>
    apiFetch('/admin/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  updateSubscription: (id: string, data: any) =>
    apiFetch(`/admin/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  pauseSubscription: (id: string) =>
    apiFetch(`/admin/subscriptions/${id}/pause`, { method: 'POST' }),
  resumeSubscription: (id: string) =>
    apiFetch(`/admin/subscriptions/${id}/resume`, { method: 'POST' }),

  // Plans
  getPlans: () => apiFetch('/admin/plans'),
  createPlan: (data: any) =>
    apiFetch('/admin/plans', { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (id: string, data: any) =>
    apiFetch(`/admin/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePlan: (id: string) =>
    apiFetch(`/admin/plans/${id}`, { method: 'DELETE' }),

  // Analytics
  getAnalytics: (range: string) =>
    apiFetch(`/admin/analytics?range=${range}`),

  // Settings (requires backend /admin/settings endpoint)
  getSettings: () => apiFetch('/admin/settings'),
  updateSettings: (data: any) =>
    apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Admin Profile
  getProfile: () => apiFetch('/admin/profile'),
  updateProfile: (data: any) =>
    apiFetch('/admin/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Pause Requests
  getPauseRequests: (status?: string) =>
    apiFetch(`/admin/pause-requests${status ? `?status=${status}` : ''}`),
  approvePauseRequest: (id: string) =>
    apiFetch(`/admin/pause-requests/${id}/approve`, { method: 'POST' }),
  rejectPauseRequest: (id: string) =>
    apiFetch(`/admin/pause-requests/${id}/reject`, { method: 'POST' }),

  // Areas
  getAreas: () => apiFetch('/admin/areas'),
  createArea: (data: any) =>
    apiFetch('/admin/areas', { method: 'POST', body: JSON.stringify(data) }),
  updateArea: (id: string, data: any) =>
    apiFetch(`/admin/areas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteArea: (id: string) =>
    apiFetch(`/admin/areas/${id}`, { method: 'DELETE' }),

  // Live Rides (REST)
  getRides: (status?: string) =>
    apiFetch(`/admin/rides${status ? `?status=${status}` : ''}`),
};
