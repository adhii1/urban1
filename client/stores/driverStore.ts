import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  vehicleModel: string;
  vehicleCapacity: number;
  licenseNumber: string;
  route: any;
  status: string;
}

interface DriverState {
  driverName: string | null;
  driverPhone: string | null;
  driverId: string | null;
  accessToken: string | null;
  driverProfile: DriverProfile | null;
  currentTrip: any | null;
  isLoggedIn: boolean;

  setAuth: (authData: {
    driverName: string;
    driverPhone: string;
    driverId?: string;
    accessToken?: string;
  }) => void;
  setUserInfo: (info: {
    driverName: string;
    driverPhone: string;
    driverId?: string;
  }) => void;
  setDriverProfile: (profile: DriverProfile) => void;
  setCurrentTrip: (trip: any | null) => void;
  logout: () => void;
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      driverName: null,
      driverPhone: null,
      driverId: null,
      accessToken: null,
      driverProfile: null,
      currentTrip: null,
      isLoggedIn: false,

      setAuth: (authData) => set({
        driverName: authData.driverName,
        driverPhone: authData.driverPhone,
        driverId: authData.driverId || null,
        accessToken: authData.accessToken || null,
        isLoggedIn: true,
      }),

      setUserInfo: (info) => set({
        driverName: info.driverName,
        driverPhone: info.driverPhone,
        driverId: info.driverId || null,
      }),

      setDriverProfile: (profile) => set({ driverProfile: profile }),
      setCurrentTrip: (trip) => set({ currentTrip: trip }),

      logout: () => set({
        driverName: null,
        driverPhone: null,
        driverId: null,
        accessToken: null,
        driverProfile: null,
        currentTrip: null,
        isLoggedIn: false,
      }),
    }),
    {
      name: 'driver-storage',
      version: 2,
      partialize: (state) => ({
        driverName: state.driverName,
        driverPhone: state.driverPhone,
        driverId: state.driverId,
        accessToken: state.accessToken,
        driverProfile: state.driverProfile,
        currentTrip: state.currentTrip,
        isLoggedIn: state.isLoggedIn,
      }),
      migrate: (persistedState: any, version) => {
        if (version < 2 && persistedState) {
          const state = { ...(persistedState.state || {}) } as Record<string, unknown>;
          delete state.accessToken;
          delete state.refreshToken;
          return { ...persistedState, state };
        }
        return persistedState;
      },
    }
  )
);
