import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminState {
  theme: 'light' | 'dark';
  adminName: string | null;
  adminPhone: string | null;
  adminRole: string | null;
  adminUserId: string | null;
  accessToken: string | null;

  // Actions
  setTheme: (theme: 'light' | 'dark') => void;
  setAuth: (authData: {
    name: string;
    phone: string;
    role: string;
    userId: string;
    accessToken?: string;
  }) => void;
  logout: () => void;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      theme: 'dark',
      adminName: null,
      adminPhone: null,
      adminRole: null,
      adminUserId: null,
      accessToken: null,

      setTheme: (theme) => set({ theme }),

      setAuth: (authData) => set({
        adminName: authData.name,
        adminPhone: authData.phone,
        adminRole: authData.role,
        adminUserId: authData.userId,
        accessToken: authData.accessToken || null,
      }),

      logout: () => set({
        adminName: null,
        adminPhone: null,
        adminRole: null,
        adminUserId: null,
        accessToken: null,
      }),
    }),
    {
      name: 'admin-storage',
    }
  )
);
