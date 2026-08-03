'use client';

import { useAdminStore } from '@/stores/adminStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function useAuthGuard() {
  const router = useRouter();
  const adminUserId = useAdminStore((s) => s.adminUserId);

  useEffect(() => {
    if (!adminUserId) {
      router.push('/login');
    }
  }, [adminUserId, router]);

  return { isAuthenticated: !!adminUserId };
}
