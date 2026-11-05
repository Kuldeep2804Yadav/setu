'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from './api';
import { AuthUser, LoginInput, RegisterInput } from '@/contracts';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const hasInitialized = useRef(false);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: AuthUser }>('/auth/me');
      setUser(res.data.user);
      return res.data.user;
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
      }
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial authentication check on application mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const isPublic = PUBLIC_PATHS.some((path) => pathname?.startsWith(path));

    // If there is no token saved and user is on a public page, do not delay loading with an extra request
    if (!token && isPublic) {
      setIsLoading(false);
      return;
    }

    // Verify session
    fetchCurrentUser().then((currentUser) => {
      if (!currentUser && !isPublic) {
        router.push('/login');
      } else if (currentUser && (pathname === '/login' || pathname === '/register')) {
        router.push('/dashboard');
      }
    });
  }, [fetchCurrentUser, pathname, router]);

  // Route protection on navigation without re-fetching /auth/me every time
  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_PATHS.some((path) => pathname?.startsWith(path));
    if (!user && !isPublic) {
      router.push('/login');
    } else if (user && (pathname === '/login' || pathname === '/register')) {
      router.push('/dashboard');
    }
  }, [pathname, user, isLoading, router]);

  const login = async (credentials: LoginInput) => {
    const res = await api.post<{ user: AuthUser; token?: string }>('/auth/login', credentials);
    if (res.data.token && typeof window !== 'undefined') {
      localStorage.setItem('auth_token', res.data.token);
    }
    setUser(res.data.user);
    router.push('/dashboard');
  };

  const register = async (data: RegisterInput) => {
    const res = await api.post<{ user: AuthUser; token?: string }>('/auth/register', data);
    if (res.data.token && typeof window !== 'undefined') {
      localStorage.setItem('auth_token', res.data.token);
    }
    setUser(res.data.user);
    router.push('/dashboard');
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
      }
      setUser(null);
      router.push('/login');
    }
  };

  const refreshUser = async () => {
    await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
