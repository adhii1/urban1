'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timeoutRefs.current.delete(id);
    }, 3000);
    timeoutRefs.current.set(id, timeout);
  }, []);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, []);

  return { toasts, showToast };
}
