'use client';

import { useToastStore } from '../stores/toastStore';

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  const bgMap: Record<string, string> = {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
  };

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
      width: 'calc(100% - 48px)',
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-item fade-in"
          style={{
            background: bgMap[toast.type] || bgMap.info,
            color: '#FFFFFF',
            padding: '12px 16px',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
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
