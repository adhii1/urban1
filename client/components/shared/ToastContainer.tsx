'use client';

import { useToastStore } from '@/stores/toastStore';

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '360px',
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background: toast.type === 'success' ? '#16C15D' : toast.type === 'error' ? '#EF4444' : toast.type === 'warning' ? '#F59E0B' : '#3B82F6',
            color: '#FFF',
            padding: '12px 16px',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
