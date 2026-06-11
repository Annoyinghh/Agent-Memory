'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [activeNamespace, setActiveNamespace] = useState('all');
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'search', 'ingest'
  const [namespaces, setNamespaces] = useState([]);
  const [stats, setStats] = useState({ total_chunks: 0, namespaces: {} });
  const [isOnline, setIsOnline] = useState(false);
  const [lastEvent, setLastEvent] = useState({ type: 'init_silent', message: 'Holographic system standby.' });
  const [avatarMuted, setAvatarMuted] = useState(false); // Default unmuted for startup voice

  const refreshData = useCallback(async (eventTrigger = null) => {
    try {
      const statsRes = await api.getStats();
      const nsRes = await api.getNamespaces();
      
      setStats(statsRes);
      setNamespaces(nsRes.namespaces);
      setIsOnline(true);
      
      if (eventTrigger) {
        setLastEvent(eventTrigger);
      }
    } catch (error) {
      console.error('Failed to sync with local memory engine:', error);
      setIsOnline(false);
    }
  }, []);

  // Poll connection and stats every 5 seconds
  useEffect(() => {
    refreshData({ type: 'online', message: 'Synchronizing with Agent Memory database...' });
    
    const interval = setInterval(() => {
      refreshData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [refreshData]);

  // Set default active namespace when list loads
  useEffect(() => {
    if (activeNamespace === 'all' && namespaces.length > 0) {
      // Keep "all" or set to first, "all" is a great default for searching everything
    }
  }, [namespaces, activeNamespace]);

  return (
    <AppContext.Provider
      value={{
        activeNamespace,
        setActiveNamespace,
        activeTab,
        setActiveTab,
        namespaces,
        stats,
        isOnline,
        lastEvent,
        setLastEvent,
        avatarMuted,
        setAvatarMuted,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
