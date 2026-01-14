// FILE: src/context/StoreContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { StoreType, UserRole, AuthState, STORE_CONFIGS } from '../types/store';

interface StoreContextValue {
  selectedStore: StoreType;
  userRole: UserRole;
  userName: string;
  setStore: (store: StoreType) => void;
  setUserRole: (role: UserRole) => void;
  setUserName: (name: string) => void;
  logout: () => void;
  getStoreConfig: () => typeof STORE_CONFIGS['mjm'] | typeof STORE_CONFIGS['bjw'] | null;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

const STORAGE_KEY = 'stockmaster_auth_state';

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedStore, setSelectedStore] = useState<StoreType>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userName, setUserName] = useState<string>('');

  // Load from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed: AuthState = JSON.parse(savedState);
        setSelectedStore(parsed.selectedStore);
        setUserRole(parsed.userRole);
        setUserName(parsed.userName || '');
      } catch (e) {
        console.error('Failed to parse saved auth state:', e);
      }
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (selectedStore && userRole) {
      const state: AuthState = {
        selectedStore,
        userRole,
        userName,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [selectedStore, userRole, userName]);

  const setStore = (store: StoreType) => {
    setSelectedStore(store);
  };

  const logout = () => {
    setSelectedStore(null);
    setUserRole(null);
    setUserName('');
    localStorage.removeItem(STORAGE_KEY);
  };

  const getStoreConfig = () => {
    if (!selectedStore) return null;
    return STORE_CONFIGS[selectedStore];
  };

  return (
    <StoreContext.Provider
      value={{
        selectedStore,
        userRole,
        userName,
        setStore,
        setUserRole,
        setUserName,
        logout,
        getStoreConfig,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within StoreProvider');
  }
  return context;
};
