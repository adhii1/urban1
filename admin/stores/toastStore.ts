import { create } from 'zustand';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message, type = 'info') => {
    const id = Date.now();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
