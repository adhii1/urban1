import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/adminApi';
import { useAdminStore } from '../../stores/adminStore';

function useAuthState() {
  return useAdminStore((s) => s.adminUserId);
}

// --- Dashboard ---
export function useDashboardStats(period = 'today') {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => adminApi.getDashboard(period),
    enabled: isAuthed,
    refetchInterval: 30000,
  });
}

// --- Drivers ---
export function useDrivers() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['drivers'],
    queryFn: () => adminApi.getDrivers(),
    enabled: isAuthed,
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createDriver(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateDriver(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteDriver(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

// --- Customers ---
export function useCustomers() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => adminApi.getCustomers(),
    enabled: isAuthed,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createCustomer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateCustomer(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useBanCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.banCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

// --- Trips ---
export function useTrips(params?: string) {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['trips', params],
    queryFn: () => adminApi.getTrips(params),
    enabled: isAuthed,
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createTrip(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateTrip(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}

export function useReassignTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.reassignTrip(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}

// --- Operational exceptions ---
export function useOperationalExceptions(params?: string) {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['operational-exceptions', params],
    queryFn: () => adminApi.getOperationalExceptions(params),
    enabled: isAuthed,
  });
}

export function useResolveOperationalException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.resolveOperationalException(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operational-exceptions'] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

// --- Routes ---
export function useRoutes() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['routes'],
    queryFn: () => adminApi.getRoutes(),
    enabled: isAuthed,
  });
}

export function useCreateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createRoute(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });
}

export function useUpdateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateRoute(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });
}

export function useDeleteRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteRoute(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });
}

// --- Subscriptions ---
export function useSubscriptions(params?: string) {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['subscriptions', params],
    queryFn: () => adminApi.getSubscriptions(params),
    enabled: isAuthed,
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createSubscription(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateSubscription(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function usePauseSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.pauseSubscription(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function useResumeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.resumeSubscription(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

// --- Plans ---
export function usePlans() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['plans'],
    queryFn: () => adminApi.getPlans(),
    enabled: isAuthed,
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createPlan(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updatePlan(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deletePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });
}

// --- Analytics ---
export function useAnalytics(range: string) {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['analytics', range],
    queryFn: () => adminApi.getAnalytics(range),
    enabled: isAuthed,
  });
}

// --- Settings ---
export function useSettings() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => adminApi.getSettings(),
    enabled: isAuthed,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.updateSettings(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

// --- Profile ---
export function useProfile() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => adminApi.getProfile(),
    enabled: isAuthed,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.updateProfile(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}


// --- Pause Requests ---
export function usePauseRequests(status?: string) {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['pause-requests', status],
    queryFn: () => adminApi.getPauseRequests(status),
    enabled: isAuthed,
  });
}

export function useApprovePauseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.approvePauseRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pause-requests'] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

export function useRejectPauseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.rejectPauseRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pause-requests'] }),
  });
}

// --- Areas ---
export function useAreas() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['areas'],
    queryFn: () => adminApi.getAreas(),
    enabled: isAuthed,
  });
}

export function useCreateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createArea(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
}

export function useUpdateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateArea(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
}

export function useDeleteArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteArea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['areas'] });
      qc.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
}

// --- Zones ---
export function useZones() {
  const isAuthed = !!useAuthState();
  return useQuery({
    queryKey: ['zones'],
    queryFn: () => adminApi.getZones(),
    enabled: isAuthed,
  });
}

export function useCreateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.createZone(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateZone(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zones'] }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteZone(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['areas'] });
      qc.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
}

export function useAssignAreasToZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, areaIds }: { id: string; areaIds: string[] }) => adminApi.assignAreasToZone(id, areaIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] });
      qc.invalidateQueries({ queryKey: ['areas'] });
    },
  });
}
