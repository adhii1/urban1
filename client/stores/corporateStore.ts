import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CorporateState {
  companyName: string | null;
  corporatePhone: string | null;
  corporateId: string | null;
  accessToken: string | null;
  isLoggedIn: boolean;

  setAuth: (authData: {
    companyName: string;
    corporatePhone: string;
    corporateId?: string;
    accessToken?: string;
  }) => void;
  setUserInfo: (info: {
    companyName: string;
    corporatePhone: string;
    corporateId?: string;
  }) => void;
  clearAccessToken: () => void;
  logout: () => void;
}

export const useCorporateStore = create<CorporateState>()(
  persist(
    (set) => ({
      companyName: null,
      corporatePhone: null,
      corporateId: null,
      accessToken: null,
      isLoggedIn: false,

      setAuth: (authData) => set({
        companyName: authData.companyName,
        corporatePhone: authData.corporatePhone,
        corporateId: authData.corporateId || null,
        accessToken: authData.accessToken || null,
        isLoggedIn: true,
      }),

      setUserInfo: (info) => set({
        companyName: info.companyName,
        corporatePhone: info.corporatePhone,
        corporateId: info.corporateId || null,
      }),

      clearAccessToken: () => set({ accessToken: null }),

      logout: () => set({
        companyName: null,
        corporatePhone: null,
        corporateId: null,
        accessToken: null,
        isLoggedIn: false,
      }),
    }),
    {
      name: 'corporate-storage',
      version: 1,
      partialize: (state) => ({
        companyName: state.companyName,
        corporatePhone: state.corporatePhone,
        corporateId: state.corporateId,
        accessToken: state.accessToken,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);
