import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CustomerState {
  userName: string | null;
  mobileNumber: string | null;
  userRole: string | null;
  userId: string | null;
  accessToken: string | null;
  isLoggedIn: boolean;
  hasCustomPassword: boolean;

  setAuth: (authData: {
    userName: string;
    mobileNumber: string;
    userRole: string;
    userId: string;
    accessToken?: string;
    hasCustomPassword?: boolean;
  }) => void;
  setUserInfo: (info: {
    userName: string;
    mobileNumber: string;
    userRole: string;
    userId: string;
  }) => void;
  logout: () => void;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set) => ({
      userName: null,
      mobileNumber: null,
      userRole: null,
      userId: null,
      accessToken: null,
      isLoggedIn: false,
      hasCustomPassword: false,

      setAuth: (authData) => set({
        userName: authData.userName,
        mobileNumber: authData.mobileNumber,
        userRole: authData.userRole,
        userId: authData.userId,
        accessToken: authData.accessToken || null,
        isLoggedIn: true,
        hasCustomPassword: authData.hasCustomPassword || false,
      }),

      setUserInfo: (info) => set({
        userName: info.userName,
        mobileNumber: info.mobileNumber,
        userRole: info.userRole,
        userId: info.userId,
      }),

      logout: () => set({
        userName: null,
        mobileNumber: null,
        userRole: null,
        userId: null,
        accessToken: null,
        isLoggedIn: false,
        hasCustomPassword: false,
      }),
    }),
    {
      name: 'customer-storage',
      version: 2,
      partialize: (state) => ({
        userName: state.userName,
        mobileNumber: state.mobileNumber,
        userRole: state.userRole,
        userId: state.userId,
        accessToken: state.accessToken,
        isLoggedIn: state.isLoggedIn,
        hasCustomPassword: state.hasCustomPassword,
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
