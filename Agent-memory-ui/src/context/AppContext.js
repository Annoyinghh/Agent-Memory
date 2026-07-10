'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  // Defaults used for SSR and first client render (avoids hydration mismatch).
  // localStorage values are restored in a useEffect below after mount.
  const [activeNamespace, setActiveNamespace] = useState('all');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [namespaces, setNamespaces] = useState([]);
  const [stats, setStats] = useState({ total_chunks: 0, namespaces: {} });
  const [isOnline, setIsOnline] = useState(false);
  const [lastEvent, setLastEvent] = useState({ type: 'init_silent', message: 'Holographic system standby.' });
  const [isGraphAvatarExpanded, setIsGraphAvatarExpanded] = useState(false);
  const [avatarMuted, setAvatarMuted] = useState(false); // Default unmuted for startup voice
  const [isSimplified, setIsSimplified] = useState(true); // Simplified mode (no 3D decorations)

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

  // Restore last selection from localStorage (client-only; runs after mount so
  // SSR and first client render share the same defaults — no hydration mismatch).
  useEffect(() => {
    try {
      const savedNs = localStorage.getItem('hermes_active_ns');
      if (savedNs) setActiveNamespace(savedNs);
      const savedTab = localStorage.getItem('hermes_active_tab');
      if (savedTab) setActiveTab(savedTab);
      const savedMode = localStorage.getItem('hermes_simplified');
      if (savedMode !== null) setIsSimplified(savedMode === 'true');
    } catch {}
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

  // Toggle body class for simplified mode CSS overrides
  useEffect(() => {
    if (isSimplified) {
      document.body.classList.add('simplified-mode');
    } else {
      document.body.classList.remove('simplified-mode');
    }
  }, [isSimplified]);

  // 持久化命名空间选择 — 刷新后自动恢复
  useEffect(() => {
    try { localStorage.setItem('hermes_active_ns', activeNamespace); } catch {}
  }, [activeNamespace]);

  // 持久化当前 Tab — 刷新后回到上次看的位置
  useEffect(() => {
    try { localStorage.setItem('hermes_active_tab', activeTab); } catch {}
  }, [activeTab]);

  // 持久化精简/完整模式 — 刷新后保持上次选择
  useEffect(() => {
    try { localStorage.setItem('hermes_simplified', String(isSimplified)); } catch {}
  }, [isSimplified]);

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
        isGraphAvatarExpanded,
        setIsGraphAvatarExpanded,
        isSimplified,
        setIsSimplified,
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
