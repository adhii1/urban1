'use client';

import { useEffect, useState } from 'react';
import { useAdminStore } from '../../stores/adminStore';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/apiBase';

export function useAdminAuth() {
  const router = useRouter();
  const { setAuth, logout } = useAdminStore();
  const [isLoading, setIsLoading] = useState(false);

  const login = async (emailOrPhone: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: emailOrPhone, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Invalid admin credentials');
      }

      if (data.success && data.data?.user) {
        const user = data.data.user;
        setAuth({
          name: user.name,
          phone: user.phone,
          role: user.role,
          userId: user.id || user._id,
          accessToken: data.data.accessToken,
        });
        return { success: true };
      } else {
        throw new Error(data.message || 'Login failed.');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (phone: string, otp: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, purpose: 'LOGIN' }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'OTP verification failed');
      }

      if (data.success && data.data?.user) {
        const user = data.data.user;
        setAuth({
          name: user.name,
          phone: user.phone,
          role: user.role,
          userId: user.id || user._id,
          accessToken: data.data.accessToken,
        });
        return { success: true, user };
      } else {
        throw new Error(data.message || 'Verification failed.');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logoutUser = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
      router.push('/login');
    }
  };

  return { login, verifyOtp, logoutUser, isLoading };
}
