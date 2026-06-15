'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { isOnline, avatarMuted, setAvatarMuted, stats, activeTab, setActiveTab } = useApp();
  const [pulseScale, setPulseScale] = useState(1);

  // Small telemetry fluctuations for sci-fi look
  const [latency, setLatency] = useState(12);
  const [frequency, setFrequency] = useState(1.42);

  useEffect(() => {
    const timer = setInterval(() => {
      setLatency(prev => Math.max(8, Math.min(24, Math.floor(prev + (Math.random() * 6 - 3)))));
      setFrequency(prev => Math.max(1.35, Math.min(1.49, parseFloat((prev + (Math.random() * 0.04 - 0.02)).toFixed(2)))));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { 
      label: '数据中心 // DASHBOARD', 
      value: 'dashboard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      )
    },
    { 
      label: '知识检索 // SEARCH', 
      value: 'search',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    },
    { 
      label: '数据注入 // INGEST', 
      value: 'ingest',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )
    },
    { 
      label: '分层记忆 // MEM_LAYERS', 
      value: 'memory',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      )
    },
    { 
      label: '星系图谱 // KNOWLEDGE_GALAXY', 
      value: 'graph',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )
    },
    { 
      label: '会话管理 // SESSIONS', 
      value: 'sessions',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    { 
      label: '遗忘衰减 // DECAY_FORGET', 
      value: 'decay',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
        </svg>
      )
    },
    { 
      label: '使用教程 // USER_MANUAL', 
      value: 'tutorial',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    }
  ];

  return (
    <aside className="cyber-sidebar">
      {/* Decorative vertical cyan scanner bar */}
      <div className="sidebar-decor-line"></div>

      {/* Title logo block */}
      <div className="sidebar-header">
        <div className="cyber-logo-hex">
          <svg viewBox="0 0 100 100" className="hex-svg">
            <polygon points="50,5 95,25 95,75 50,95 5,75 5,25" fill="none" stroke="hsl(var(--color-cyan))" strokeWidth="4" />
            <polygon points="50,15 85,32 85,68 50,85 15,68 15,32" fill="none" stroke="hsl(var(--color-purple))" strokeWidth="2" strokeDasharray="5,3" />
            <circle cx="50" cy="50" r="10" fill="hsl(var(--color-cyan))" className="pulse-core" />
          </svg>
        </div>
        <div className="logo-meta">
          <div className="main-logo-text">MEM_AGENT</div>
          <div className="sub-logo-text font-mono">SYS_CORE // V2.6</div>
        </div>
      </div>

      {/* Cyber bracket-style Navigation links */}
      <nav className="cyber-nav">
        {navItems.map((item) => {
          const isActive = activeTab === item.value;
          return (
            <button
              key={item.value}
              onClick={() => setActiveTab(item.value)}
              className={`cyber-nav-link ${isActive ? 'active' : ''}`}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                outline: 'none',
                textDecoration: 'none'
              }}
            >
              <span className="nav-icon-wrapper">{item.icon}</span>
              <span className="nav-label-wrapper">
                <span className="bracket-left">[</span>
                <span className="link-text">{item.label}</span>
                <span className="bracket-right">]</span>
              </span>
              {isActive && <span className="active-dot"></span>}
            </button>
          );
        })}
      </nav>

      {/* Diagnostic telemetry stats panel */}
      <div className="sidebar-diagnostic">
        <div className="diag-panel glass-card">
          <div className="diag-header font-mono">
            <span>DIAGNOSTICS // 核心遥测</span>
            <span className="diag-scanline"></span>
          </div>

          <div className="diag-row font-mono">
            <span className="diag-lbl">核心链路:</span>
            <span className={`diag-val ${isOnline ? 'text-green' : 'text-red'}`}>
              {isOnline ? 'CONNECTED_UP' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="diag-row font-mono">
            <span className="diag-lbl">数据密度:</span>
            <span className="diag-val text-cyan">{stats.total_chunks} CHUNKS</span>
          </div>

          <div className="diag-row font-mono">
            <span className="diag-lbl">诊断频段:</span>
            <span className="diag-val text-muted">{frequency} GHz</span>
          </div>

          <div className="diag-row font-mono">
            <span className="diag-lbl">传输延迟:</span>
            <span className="diag-val text-muted">{latency} ms</span>
          </div>

          {/* Glowing system loader animation */}
          <div className="mini-radar-container">
            <svg width="40" height="40" viewBox="0 0 40 40" className="mini-radar">
              <circle cx="20" cy="20" r="16" fill="transparent" stroke="rgba(0, 242, 254, 0.1)" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="16" fill="transparent" stroke="hsl(var(--color-cyan))" strokeWidth="2" strokeDasharray="30,80" className="spinning-ring" />
              <circle cx="20" cy="20" r="10" fill="transparent" stroke="hsl(var(--color-purple))" strokeWidth="1" strokeDasharray="15,40" className="counter-spinning-ring" />
            </svg>
            <span className="radar-status font-mono">SYNCHRONIZED</span>
          </div>

          {/* Voice Speech synthesizing switcher */}
          <button
            className={`cyber-speaker-btn ${avatarMuted ? 'muted' : 'active'}`}
            onClick={() => setAvatarMuted(!avatarMuted)}
          >
            {avatarMuted ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                </svg>
                <span className="font-mono">AUDIO_OFF</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                <span className="font-mono text-cyan">AUDIO_ON</span>
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx>{`
        .cyber-sidebar {
          position: fixed;
          left: 0;
          top: 0;
          height: 100vh;
          width: 68px;
          background: rgba(3, 2, 1, 0.97);
          border-right: 1px solid rgba(255, 187, 0, 0.12);
          box-shadow: 10px 0 30px rgba(0, 0, 0, 0.95);
          display: flex;
          flex-direction: column;
          z-index: 200;
          overflow: hidden;
          opacity: 0.75;
          transition: width 0.35s cubic-bezier(0.25, 1, 0.5, 1), 
                      opacity 0.3s ease;
        }

        .cyber-sidebar:hover {
          width: 280px;
          opacity: 1.0;
        }

        .sidebar-decor-line {
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 100%;
          background: linear-gradient(to bottom, 
            hsl(var(--color-cyan)), 
            hsl(var(--color-purple)), 
            hsl(var(--color-cyan))
          );
          box-shadow: 0 0 10px rgba(255, 187, 0, 0.5);
        }

        .sidebar-header {
          height: var(--header-height);
          padding: 0;
          display: flex;
          align-items: center;
          border-bottom: 1px solid rgba(255, 187, 0, 0.08);
          position: relative;
          width: 100%;
        }

        .cyber-logo-hex {
          width: 32px;
          height: 32px;
          margin-left: 18px;
          flex-shrink: 0;
        }

        .hex-svg {
          width: 100%;
          height: 100%;
        }

        .pulse-core {
          transform-origin: center;
          animation: core-pulsate 2.5s infinite alternate;
        }

        @keyframes core-pulsate {
          0% { r: 6; opacity: 0.6; }
          100% { r: 11; opacity: 1; filter: drop-shadow(0 0 5px hsl(var(--color-cyan))); }
        }

        .logo-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.25s ease, visibility 0.25s ease;
          white-space: nowrap;
          margin-left: 14px;
        }

        .cyber-sidebar:hover .logo-meta {
          opacity: 1;
          visibility: visible;
        }

        .main-logo-text {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: hsl(var(--text-primary));
          background: linear-gradient(90deg, hsl(var(--color-cyan)), hsl(var(--color-purple)));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .sub-logo-text {
          font-size: 10px;
          color: hsl(var(--text-muted));
          letter-spacing: 0.5px;
        }

        .cyber-nav {
          padding: 30px 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
          width: 100%;
        }

        .cyber-nav-link {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          width: 100%;
          text-decoration: none;
          color: hsl(var(--text-muted));
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
          font-size: 13px;
          font-family: var(--font-mono);
          position: relative;
          height: 48px;
          padding: 0;
        }

        .nav-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 68px;
          height: 48px;
          flex-shrink: 0;
          color: hsl(var(--text-muted));
          transition: color 0.25s ease;
        }

        .cyber-nav-link:hover .nav-icon-wrapper,
        .cyber-nav-link.active .nav-icon-wrapper {
          color: hsl(var(--color-cyan));
          filter: drop-shadow(0 0 5px hsl(var(--color-cyan)));
        }

        .nav-label-wrapper {
          display: flex;
          align-items: center;
          gap: 6px;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.25s ease, visibility 0.25s ease;
          white-space: nowrap;
        }

        .cyber-sidebar:hover .nav-label-wrapper {
          opacity: 1;
          visibility: visible;
        }

        .bracket-left, .bracket-right {
          opacity: 0;
          color: hsl(var(--color-cyan));
          font-weight: 700;
          transition: all 0.25s ease;
        }

        .bracket-left {
          transform: translateX(8px);
        }

        .bracket-right {
          transform: translateX(-8px);
        }

        .link-text {
          transition: transform 0.25s ease, color 0.25s ease;
        }

        .cyber-nav-link:hover {
          color: hsl(var(--text-primary));
        }

        .cyber-nav-link:hover .bracket-left,
        .cyber-nav-link:hover .bracket-right {
          opacity: 0.5;
          transform: translateX(0);
        }

        .cyber-nav-link.active {
          color: hsl(var(--color-cyan));
          text-shadow: 0 0 8px rgba(0, 242, 254, 0.4);
          background: linear-gradient(90deg, rgba(0, 242, 254, 0.05) 0%, transparent 100%);
        }

        .cyber-nav-link.active .bracket-left,
        .cyber-nav-link.active .bracket-right {
          opacity: 1;
          transform: translateX(0);
          font-size: 14px;
        }

        .cyber-nav-link.active .link-text {
          transform: translateX(2px);
          font-weight: bold;
        }

        .active-dot {
          position: absolute;
          right: 12px;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: hsl(var(--color-cyan));
          box-shadow: 0 0 8px hsl(var(--color-cyan));
        }

        .sidebar-diagnostic {
          padding: 20px;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.25s ease, visibility 0.25s ease;
          width: 280px;
          flex-shrink: 0;
        }

        .cyber-sidebar:hover .sidebar-diagnostic {
          opacity: 1;
          visibility: visible;
        }

        .diag-panel {
          padding: 16px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(0, 242, 254, 0.08);
          border-radius: 8px;
          overflow: hidden;
        }

        .diag-header {
          font-size: 10px;
          color: hsl(var(--color-cyan));
          letter-spacing: 0.8px;
          margin-bottom: 12px;
          border-bottom: 1px dashed rgba(0, 242, 254, 0.15);
          padding-bottom: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: relative;
        }

        .diag-scanline {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 1px;
          background: hsl(var(--color-cyan));
          opacity: 0.4;
        }

        .diag-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-bottom: 8px;
        }

        .diag-lbl {
          color: hsl(var(--text-muted));
        }

        .diag-val {
          font-weight: bold;
        }

        .text-green {
          color: hsl(var(--color-green));
          text-shadow: 0 0 4px rgba(74, 222, 128, 0.4);
        }

        .text-red {
          color: hsl(var(--color-red));
          text-shadow: 0 0 4px rgba(244, 63, 94, 0.4);
        }

        .mini-radar-container {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.03);
          padding-top: 12px;
        }

        .mini-radar {
          transform-origin: center;
        }

        .spinning-ring {
          transform-origin: center;
          animation: spin 3s linear infinite;
        }

        .counter-spinning-ring {
          transform-origin: center;
          animation: spin-back 2s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        @keyframes spin-back {
          100% { transform: rotate(-360deg); }
        }

        .radar-status {
          font-size: 9px;
          letter-spacing: 0.5px;
          color: hsl(var(--text-muted));
        }

        .cyber-speaker-btn {
          width: 100%;
          margin-top: 16px;
          padding: 8px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
          color: hsl(var(--text-muted));
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cyber-speaker-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: hsl(var(--text-primary));
        }

        .cyber-speaker-btn.active {
          border-color: rgba(0, 242, 254, 0.25);
          background: rgba(0, 242, 254, 0.04);
          color: hsl(var(--color-cyan));
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.1);
        }

        .cyber-speaker-btn.active:hover {
          background: rgba(0, 242, 254, 0.08);
          box-shadow: 0 0 15px rgba(0, 242, 254, 0.15);
        }
      `}</style>
    </aside>
  );
}
