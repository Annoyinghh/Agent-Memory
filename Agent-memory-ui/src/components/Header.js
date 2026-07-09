'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

export default function Header() {
  const { activeNamespace, setActiveNamespace, namespaces, activeTab, isSimplified, setIsSimplified } = useApp();

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
            title="选择要操作的命名空间。每个命名空间是一个独立的数据分区，用于隔离不同项目或应用的数据。"
          >
            <option value="all">全部命名空间 (All Namespaces)</option>
            {namespaces.filter((ns) => ns !== 'all').map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setIsSimplified(!isSimplified)}
          className={`simplify-toggle ${isSimplified ? 'simplified' : 'full'}`}
          title={isSimplified ? '切换到完整模式' : '切换到精简模式'}
        >
          {isSimplified ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>精简</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
              </svg>
              <span>完整</span>
            </>
          )}
        </button>
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

        .action-section {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .simplify-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          border: 1px solid rgba(255, 187, 0, 0.2);
          background: rgba(10, 8, 5, 0.65);
          color: hsl(var(--text-muted));
          font-size: 12px;
          font-family: var(--font-outfit);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .simplify-toggle:hover {
          border-color: hsl(var(--color-cyan));
          color: hsl(var(--text-primary));
        }

        .simplify-toggle.simplified {
          border-color: rgba(74, 222, 128, 0.3);
          color: hsl(142 70% 60%);
        }

        .simplify-toggle.full {
          border-color: rgba(255, 187, 0, 0.3);
          color: hsl(var(--color-cyan));
        }
      `}</style>
    </header>
  );
}
