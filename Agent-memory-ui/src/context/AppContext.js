'use client';

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';

const AppContext = createContext(null);
const KEY = 'agent-memory:workspace';
const CHANGE = 'agent-memory:preferences';
const TABS = new Set(['demo', 'code', 'graph', 'projects', 'memory', 'sessions', 'guide']);
let volatilePreferences = '';
let storageDisabled = false;

function subscribe(listener) {
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGE, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(CHANGE, listener); };
}
function readPreferences() {
  if (storageDisabled) return volatilePreferences;
  try { return localStorage.getItem(KEY) || volatilePreferences; } catch { return volatilePreferences; }
}
function parsePreferences(value) {
  try { return JSON.parse(value) || {}; } catch { return {}; }
}

export function AppProvider({ children }) {
  const snapshot = useSyncExternalStore(subscribe, readPreferences, () => '');
  const preferences = parsePreferences(snapshot);
  const activeNamespace = preferences.namespace || 'all';
  const activeTab = TABS.has(preferences.tab) ? preferences.tab : 'demo';
  const [stats, setStats] = useState({ total_chunks: 0, namespaces: {} });
  const namespaces = Object.keys(stats.namespaces || {});
  const [isOnline, setIsOnline] = useState(null);
  const [startingProjectTask, setStartingProjectTask] = useState(false);

  const savePreference = useCallback((key, value) => {
    volatilePreferences = JSON.stringify({ ...parsePreferences(readPreferences()), [key]: value });
    try { localStorage.setItem(KEY, volatilePreferences); } catch { storageDisabled = true; }
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  const setProjectTask = useCallback(task => savePreference('task', task), [savePreference]);

  const refreshData = useCallback(async () => {
    try {
      setStats(await api.getStats());
      setIsOnline(true);
    } catch { setIsOnline(false); }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer;
    const poll = async () => {
      if (!document.hidden) await refreshData();
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 0);
    return () => { stopped = true; clearTimeout(timer); };
  }, [refreshData]);

  return <AppContext.Provider value={{
    activeNamespace, setActiveNamespace: value => savePreference('namespace', value),
    activeTab, setActiveTab: value => savePreference('tab', value),
    projectTask: preferences.task || null, setProjectTask, startingProjectTask, setStartingProjectTask,
    stats, namespaces, isOnline, refreshData,
  }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
