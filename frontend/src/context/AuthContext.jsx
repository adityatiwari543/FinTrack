import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/auth';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        // Security: Attempt to restore session on reload using httpOnly cookie (never localStorage)
        await api.refreshTokens();
        const response = await authApi.getMe();
        setUser(response.user);
      } catch (_) {
        // No active session or cookie expired
        api.clearTokens();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();

    const handleExpired = () => {
      setUser(null);
    };

    window.addEventListener('fintrack_auth_expired', handleExpired);
    return () => window.removeEventListener('fintrack_auth_expired', handleExpired);
  }, []);

  const login = async (email, password) => {
    const data = await authApi.login({ email, password });
    // In-memory access token storage only
    api.setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const data = await authApi.register({ name, email, password });
    // In-memory access token storage only
    api.setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
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
