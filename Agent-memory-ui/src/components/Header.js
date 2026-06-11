'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

export default function Header() {
  const { activeNamespace, setActiveNamespace, namespaces, activeTab } = useApp();

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return '数据中心看板 (Database Overview)';
      case 'search':
        return '知识检索控制台 (Hybrid Search)';
      case 'ingest':
        return '知识注入与快照 (Knowledge Ingestion)';
      default:
        return '控制台 (Dashboard)';
    }
  };

  return (
    <header className="header-container">
      <div className="title-section">
        <h1>{getPageTitle()}</h1>
      </div>

      <div className="action-section">
        <div className="selector-wrapper">
          <label htmlFor="ns-selector">当前命名空间 (Active Namespace):</label>
          <select
            id="ns-selector"
            value={activeNamespace}
            onChange={(e) => setActiveNamespace(e.target.value)}
            className="namespace-select"
          >
            <option value="all">全部命名空间 (All Namespaces)</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>
      </div>

      <style jsx>{`
        .header-container {
          position: fixed;
          top: 0;
          left: 68px;
          right: 0;
          height: var(--header-height);
          background: rgba(5, 4, 3, 0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 187, 0, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
          padding-left: 50px;
          z-index: 90;
          pointer-events: auto;
        }

        .title-section h1 {
          font-size: 20px;
          font-weight: 600;
          background: linear-gradient(90deg, hsl(var(--text-primary)), hsl(var(--text-muted)));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .selector-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .selector-wrapper label {
          font-size: 12px;
          color: hsl(var(--text-muted));
          font-weight: 500;
        }

        .namespace-select {
          background: rgba(10, 8, 5, 0.65);
          border: 1px solid rgba(255, 187, 0, 0.2);
          color: hsl(var(--text-primary));
          padding: 8px 16px;
          border-radius: 8px;
          outline: none;
          font-family: var(--font-outfit);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: inset 0 0 5px rgba(255, 187, 0, 0.05);
        }

        .namespace-select:focus,
        .namespace-select:hover {
          border-color: hsl(var(--color-cyan));
          box-shadow: 
            0 0 10px rgba(255, 187, 0, 0.15),
            inset 0 0 5px rgba(255, 187, 0, 0.05);
        }
      `}</style>
    </header>
  );
}
