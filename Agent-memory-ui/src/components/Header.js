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
      case 'memory':
        return '分层记忆体总览 (Layered Memory)';
      case 'graph':
        return '星系知识图谱 (Knowledge Galaxy)';
      case 'sessions':
        return '全息会话隔离 (Session Isolation)';
      case 'decay':
        return '记忆衰减与遗忘 (Decay & Forgetting)';
      case 'tutorial':
        return '使用教程与连接指南 (User Guide & Connection)';
      default:
        return '控制台 (Dashboard)';
    }
  };

  return (
    <header className="header-container">
      <div className="title-section">
        <h1>
          <span className="tech-decor">//</span> <span className="title-text-gradient">{getPageTitle()}</span>
        </h1>
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
            {namespaces.filter((ns) => ns !== 'all').map((ns) => (
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
          background: rgba(5, 4, 3, 0.55);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 187, 0, 0.12);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
          z-index: 90;
          pointer-events: auto;
        }

        .title-section h1 {
          font-family: var(--font-mono);
          font-size: 20px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .title-text-gradient {
          background: linear-gradient(90deg, #00f2fe, #ffbb00);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 10px rgba(0, 242, 254, 0.15);
        }

        .title-section .tech-decor {
          color: hsl(var(--color-cyan));
          font-weight: bold;
          text-shadow: 0 0 8px hsl(var(--color-cyan) / 0.5);
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

        @media (max-width: 1024px) {
          .header-container {
            padding: 0 20px;
          }
        }

        @media (max-width: 768px) {
          .header-container {
            left: 0;
            padding: 0 16px;
            height: 60px;
          }
          .title-section h1 {
            font-size: 15px;
          }
          .selector-wrapper label {
            display: none;
          }
          .namespace-select {
            padding: 6px 12px;
            font-size: 12px;
          }
        }
      `}</style>
    </header>
  );
}
