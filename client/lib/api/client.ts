const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: string[],
  ) {
    super(message);
  }
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const fetchOptions: RequestInit = {
    ...options,
    credentials: 'include',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  let res = await fetch(`${API_BASE_URL}${endpoint}`, { ...fetchOptions, headers });

  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await fetch(`${API_BASE_URL}${endpoint}`, { ...fetchOptions, headers });
    } else {
      const { useCustomerStore } = await import('../../stores/customerStore');
      const { useDriverStore } = await import('../../stores/driverStore');
      if (useCustomerStore.getState().isLoggedIn) useCustomerStore.getState().logout();
      if (useDriverStore.getState().isLoggedIn) useDriverStore.getState().logout();
      throw new ApiError(401, 'Session expired. Please log in again.');
    }
  }

  let data: ApiResponse<T>;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, 'Invalid response from server');
  }

  if (!res.ok || !data.success) {
    throw new ApiError(res.status, data.message || `Request failed (${res.status})`, (data as any).errors);
  }

  return data;
}

export const api = {
  get: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),

  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),

  patch: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
};
