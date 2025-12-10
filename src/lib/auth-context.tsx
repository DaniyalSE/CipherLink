/**
 * Auth Context
 * 
 * Provides authentication state and methods throughout the app.
 * Handles login, logout, signup, and session management.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCurrentUser, setAccessToken, clearAuth } from './api';

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const existingUser = getCurrentUser();
    if (existingUser) {
      setUser(existingUser);
    }
    setIsLoading(false);
  }, []);

  const logout = () => {
    clearAuth();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      setUser,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
