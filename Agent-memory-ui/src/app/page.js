'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import GlassCard from '@/components/GlassCard';
import DigitalAvatar from '@/components/DigitalAvatar';

export default function SPAHomepage() {
  const { 
    activeNamespace, 
    setActiveNamespace, 
    namespaces, 
    stats, 
    isOnline, 
    lastEvent, 
    setLastEvent, 
    activeTab, 
    setActiveTab, 
    refreshData,
    avatarMuted
  } = useApp();

  // ────────────────────────────────────────────────────────
  // 1. Search Tab State & Logic
  // ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Search Sub-mode: 'search' (hybrid search) or 'pack' (context packer)
  const [searchSubMode, setSearchSubMode] = useState('search');

  // Inline editing states for search results
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Context Packer states
  const [packQuery, setPackQuery] = useState('');
  const [maxTokens, setMaxTokens] = useState(2000);
  const [packedContext, setPackedContext] = useState('');
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Trigger search if namespace changes during search tab active
  useEffect(() => {
    if (activeTab === 'search' && searchQuery.trim() !== '') {
      performSearch();
    }
  }, [activeNamespace, activeTab]);

  const performSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchSearched(true);

    try {
      const res = await api.search(activeNamespace, searchQuery, topK);
      setSearchResults(res.results || []);
      
      setLastEvent({
        type: 'search',
        message: `检索就绪！在 [ ${activeNamespace === 'all' ? '全部' : activeNamespace} ] 中召回了 ${res.results?.length || 0} 个与“${searchQuery}”匹配的记忆块。`
      });
    } catch (err) {
      console.error(err);
      setSearchError('检索失败，请检查 API 服务器连接状态');
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePackSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!packQuery.trim()) return;

    setPackLoading(true);
    setPackError(null);
    setPackedContext('');
    setCopySuccess(false);

    try {
      const res = await api.pack(activeNamespace, packQuery, maxTokens);
      setPackedContext(res.packed_context || '');
      
      setLastEvent({
        type: 'search',
        message: `上下文组装就绪！已在命名空间 [ ${activeNamespace === 'all' ? '全部' : activeNamespace} ] 下为“${packQuery}”匹配最优知识，并在预算 ${maxTokens} token 内组装。`
      });
    } catch (err) {
      console.error(err);
      setPackError('组装失败，请检查 API 服务器连接状态');
    } finally {
      setPackLoading(false);
    }
  };

  const handleDeleteMemory = async (id, ns) => {
    if (!confirm('确定要彻底从底层抹除这条记忆区块吗？此操作不可逆！')) return;

    try {
      await api.deleteById(ns, id);
      setSearchResults((prev) => prev.filter((item) => item.id !== id));
      
      await refreshData({
        type: 'delete',
        namespace: ns,
        message: `记忆节点擦除完毕。受影响的分块 ID: ${id.substring(0, 8)}...`
      });
    } catch (err) {
      console.error(err);
      alert('擦除失败，请重试');
    }
  };

  const handleSaveEdit = async (id, ns) => {
    if (!editContent.trim()) return;
    setEditLoading(true);
    try {
      await api.update(id, ns, editContent, editSource);
      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, content: editContent, source: editSource } : item
        )
      );
      setEditingId(null);
      await refreshData({
        type: 'insert',
        namespace: ns,
        message: `修改成功！记忆节点 [ ID: ${id.substring(0, 8)}... ] 已完成底层索引与向量重建。`
      });
    } catch (err) {
      console.error(err);
      alert('修改失败，请重试');
    } finally {
      setEditLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // 2. Ingest Tab State & Logic
  // ────────────────────────────────────────────────────────
  const [insertNs, setInsertNs] = useState('');
  const [isCustomInsertNs, setIsCustomInsertNs] = useState(false);
  const [customInsertNsText, setCustomInsertNsText] = useState('');
  const [insertContent, setInsertContent] = useState('');
  const [insertSource, setInsertSource] = useState('user_ui');
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const [insertMerged, setInsertMerged] = useState(false);
  const [dedupThreshold, setDedupThreshold] = useState(0.0);

  const [snapshotNs, setSnapshotNs] = useState('');
  const [isCustomSnapshotNs, setIsCustomSnapshotNs] = useState(false);
  const [customSnapshotNsText, setCustomSnapshotNsText] = useState('');
  const [snapshotSummary, setSnapshotSummary] = useState('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);

  // Set default dropdown namespaces when they load
  useEffect(() => {
    if (namespaces.length > 0) {
      if (!insertNs) setInsertNs(namespaces[0]);
      if (!snapshotNs) setSnapshotNs(namespaces[0]);
    } else {
      setIsCustomInsertNs(true);
      setIsCustomSnapshotNs(true);
    }
  }, [namespaces]);

  const handleInsertSubmit = async (e) => {
    e.preventDefault();
    const finalNs = isCustomInsertNs ? customInsertNsText.trim() : insertNs;
    if (!finalNs) {
      alert('请指定命名空间');
      return;
    }
    if (!insertContent.trim()) return;

    setInsertLoading(true);
    setInsertSuccess(false);
    setInsertMerged(false);

    try {
      const res = await api.insert(finalNs, insertContent, insertSource, dedupThreshold);
      const isMerged = res?.message === 'merged';
      setInsertMerged(isMerged);
      setInsertSuccess(true);
      setInsertContent('');
      if (isCustomInsertNs) {
        setCustomInsertNsText('');
        setIsCustomInsertNs(false);
      }
      
      await refreshData({
        type: 'insert',
        namespace: finalNs,
        source: insertSource,
        message: isMerged 
          ? `录入完成（已去重合并）！新知识与 [ ${finalNs} ] 中现有记忆高度相似，已进行语义合并。`
          : `成功录入！已向命名空间 [ ${finalNs} ] 注入新知识并建立索引。`
      });

      setTimeout(() => {
        setInsertSuccess(false);
        setInsertMerged(false);
      }, 5000);
    } catch (err) {
      console.error(err);
      alert('注入失败，请检查网络');
    } finally {
      setInsertLoading(false);
    }
  };

  const handleSnapshotSubmit = async (e) => {
    e.preventDefault();
    const finalNs = isCustomSnapshotNs ? customSnapshotNsText.trim() : snapshotNs;
    if (!finalNs) {
      alert('请指定命名空间');
      return;
    }
    if (!snapshotSummary.trim()) return;

    setSnapshotLoading(true);
    setSnapshotSuccess(false);

    try {
      await api.createSnapshot(finalNs, snapshotSummary);
      setSnapshotSuccess(true);
      setSnapshotSummary('');
      if (isCustomSnapshotNs) {
        setCustomSnapshotNsText('');
        setIsCustomSnapshotNs(false);
      }

      await refreshData({
        type: 'snapshot',
        namespace: finalNs,
        message: `快照冻结成功！已成功捕获命名空间 [ ${finalNs} ] 的认知快照。`
      });

      setTimeout(() => setSnapshotSuccess(false), 5000);
    } catch (err) {
      console.error(err);
      alert('快照创建失败');
    } finally {
      setSnapshotLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // Helper Formatters
  // ────────────────────────────────────────────────────────
  const namespacesList = Object.entries(stats.namespaces || {}).map(([name, count]) => {
    const percentage = stats.total_chunks > 0 ? ((count / stats.total_chunks) * 100).toFixed(1) : 0;
    return { name, count, percentage };
  });

  const formatTime = (timestamp) => {
    if (!timestamp) return '未知时间';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getScoreColor = (score) => {
    if (score >= 1.2) return 'hsl(var(--color-green))';
    if (score >= 0.8) return 'hsl(var(--color-cyan))';
    if (score >= 0.4) return 'hsl(var(--color-purple))';
    return 'hsl(var(--text-muted))';
  };

  return (
    <div className="cockpit-container">
      <div className={`cockpit-layout-grid active-tab-${activeTab}`}>
        
        {/* ============================================================ */}
        {/* LEFT COLUMN: System Diagnostics & Stats                       */}
        {/* ============================================================ */}
        <div className="system-left-panel">
          <GlassCard title="链路状态" glowColor="cyan" className="panel-card-sci">
            <div className="sci-card-value">
              <span className={`sci-dot ${isOnline ? 'online' : 'offline'}`} />
              <span className="sci-large-text font-mono text-cyan">
                {isOnline ? 'STABLE' : 'LINK_LOST'}
              </span>
            </div>
            <div className="sci-footer-details font-mono">
              <div>HOST: 127.0.0.1:8900</div>
            </div>
          </GlassCard>

          <GlassCard title="系统节点总览" glowColor="cyan" className="panel-card-sci">
            <div className="sci-card-value font-mono">
              <span className="sci-large-text text-white">{stats.total_chunks}</span>
              <span className="sci-unit">CHUNKS</span>
            </div>
            <div className="sci-footer-details font-mono">
              <div>ENCRYPTION: LOCAL</div>
            </div>
          </GlassCard>

          <GlassCard title="全息链路遥测" glowColor="purple" className="panel-card-sci">
            <div className="telemetry-grid font-mono">
              <div className="telemetry-item">
                <span className="lbl">SYS_VOL:</span>
                <span className="val text-cyan">ONLINE</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">DB_LOC:</span>
                <span className="val text-white">CHROMA</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">SYS_LOG:</span>
                <span className="val text-white">READY</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">SECTORS:</span>
                <span className="val text-purple">{namespaces.length}</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">MUTED:</span>
                <span className="val text-muted">{avatarMuted ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* ============================================================ */}
        {/* CENTER COLUMN: Large Interactive Holographic Head            */}
        {/* ============================================================ */}
        <div className="avatar-center-panel">
          <div className="radar-background"></div>
          <div className="avatar-container-inner">
            <DigitalAvatar />
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN (40%): Dynamic Operations Panel                 */}
        {/* ============================================================ */}
        <div className="operations-right-panel">
          
          {/* TAB 1: DASHBOARD (STATISTICS) */}
          {activeTab === 'dashboard' && (
            <div className="tab-view-content fade-in-view">
              <GlassCard title="内存容量分布占比 (Storage Distribution)" glowColor="purple" className="op-panel-card">
                {namespacesList.length === 0 ? (
                  <div className="empty-sci-chart font-mono">[ WAITING_FOR_SYNC_DATA ]</div>
                ) : (
                  <div className="hud-chart-wrapper">
                    <div className="hud-radial-viz">
                      <svg width="140" height="140" viewBox="0 0 100 100" className="hud-radial-svg">
                        {/* Background track */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255, 187, 0, 0.03)" strokeWidth="3" />
                        {/* Animated outer dashed ring */}
                        <circle cx="50" cy="50" r="44" fill="transparent" stroke="rgba(0, 242, 254, 0.15)" strokeWidth="1" strokeDasharray="3 6" className="spinning-dashed-ring" />
                        
                        {/* Dynamic segments */}
                        {(() => {
                          let acc = 0;
                          return namespacesList.map((ns, i) => {
                            const p = parseFloat(ns.percentage);
                            const strokeColor = i % 2 === 0 ? 'hsl(var(--color-cyan))' : 'hsl(var(--color-purple))';
                            // Circle length is 2 * Math.PI * 40 = 251.327
                            const strokeLength = (p / 100) * 251.327;
                            const strokeOffset = 251.327 - (acc / 100) * 251.327 + 62.831; // start from top (-90deg offset is 62.831)
                            acc += p;
                            return (
                              <circle
                                key={ns.name}
                                cx="50"
                                cy="50"
                                r="40"
                                fill="transparent"
                                stroke={strokeColor}
                                strokeWidth="4.5"
                                strokeDasharray={p >= 99.9 ? undefined : `${strokeLength} ${251.327 - strokeLength}`}
                                strokeDashoffset={p >= 99.9 ? undefined : strokeOffset}
                                strokeLinecap="round"
                                style={{ 
                                  filter: `drop-shadow(0 0 4px ${strokeColor})`,
                                  transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease'
                                }}
                              />
                            );
                          });
                        })()}

                        {/* Center core info */}
                        <circle cx="50" cy="50" r="32" fill="rgba(8, 7, 5, 0.85)" stroke="rgba(255, 187, 0, 0.08)" strokeWidth="1" />
                      </svg>
                      
                      <div className="hud-center-text font-mono">
                        <div className="hud-center-lbl">TOTAL</div>
                        <div className="hud-center-val text-cyan">{stats.total_chunks}</div>
                        <div className="hud-center-unit">SECTORS</div>
                      </div>
                    </div>

                    <div className="hud-data-list">
                      {namespacesList.map((ns, idx) => {
                        const colors = idx % 2 === 0 
                          ? ['hsl(var(--color-cyan))', 'rgba(0, 242, 254, 0.1)'] 
                          : ['hsl(var(--color-purple))', 'rgba(255, 102, 0, 0.1)'];
                        
                        return (
                          <div key={ns.name} className="hud-data-row font-mono">
                            <div className="hud-row-top">
                              <span className="hud-sector-addr" style={{ color: colors[0] }}>[SEC_0x0{idx + 1}]</span>
                              <span className="hud-sector-name text-white" title={ns.name}>{ns.name}</span>
                              <span className="hud-sector-percentage" style={{ color: colors[0] }}>{ns.percentage}%</span>
                            </div>
                            
                            <div className="hud-row-mid">
                              <div className="hud-bar-container">
                                <div 
                                  className="hud-bar-fill"
                                  style={{
                                    width: `${ns.percentage}%`,
                                    background: `linear-gradient(90deg, ${colors[0]}, transparent)`,
                                    boxShadow: `0 0 8px ${colors[0]}`
                                  }}
                                />
                              </div>
                            </div>

                            <div className="hud-row-bottom">
                              <span className="hud-row-metric">ALLOCATED: {ns.count} CHUNKS</span>
                              <span className="hud-row-status" style={{ color: colors[0] }}>● ACTIVE</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </GlassCard>

              <div className="section-header-cockpit font-mono">
                <h3>&gt;&gt; NAMESPACE_PARTITIONS // 命名空间分区</h3>
              </div>

              <div className="namespaces-vertical-list">
                {namespacesList.length === 0 ? (
                  <GlassCard className="empty-ns-card font-mono" glowColor="purple">
                    [ SECURE_SPACE // 暂无可用命名空间。 ]
                  </GlassCard>
                ) : (
                  namespacesList.map((ns, idx) => {
                    const isCurrent = activeNamespace === ns.name;
                    return (
                      <div
                        key={ns.name}
                        className={`cyber-hud-card ${isCurrent ? 'selected' : ''}`}
                      >
                        {/* Corner Brackets */}
                        <div className="hud-corner-bracket tl"></div>
                        <div className="hud-corner-bracket tr"></div>
                        <div className="hud-corner-bracket bl"></div>
                        <div className="hud-corner-bracket br"></div>

                        {/* Telemetry Header */}
                        <div className="hud-card-header">
                          <div className="hud-card-title-row">
                            <span className="hud-tech-addr">0x0{idx + 1} //</span>
                            <span className="hud-tech-title font-mono">{ns.name}</span>
                          </div>
                          <span className="hud-status-badge active-neon">SECURE</span>
                        </div>

                        {/* Card Body */}
                        <div className="hud-card-body">
                          {/* Left: Dot Density visualizer */}
                          <div className="hud-visual-column">
                            <div className="hud-matrix-dots">
                              {Array.from({ length: 9 }).map((_, i) => (
                                <span 
                                  key={i} 
                                  className={`hud-dot ${i < Math.max(1, Math.min(9, Math.ceil(ns.count / 180))) ? 'glow-cyan' : 'dark-dot'}`}
                                />
                              ))}
                            </div>
                            <div className="hud-matrix-percentage font-mono">{parseFloat(ns.percentage).toFixed(1)}%</div>
                          </div>

                          {/* Right: Specs specifications */}
                          <div className="hud-specs-column font-mono">
                            <div className="hud-spec-item">
                              <span className="spec-lbl">CAPACITY DENSITY:</span>
                              <span className="spec-val text-cyan">{ns.count} CHUNKS</span>
                            </div>
                            <div className="hud-spec-item">
                              <span className="spec-lbl">INDEX_ALIGNMENT:</span>
                              <span className="spec-val text-white">OPTIMIZED</span>
                            </div>
                            <div className="hud-spec-item">
                              <span className="spec-lbl">SECTOR_PORT:</span>
                              <span className="spec-val text-muted">8900</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer Scanning readout */}
                        <div className="hud-card-footer">
                          <span className="hud-metric-readout font-mono">NODE_STATUS: ONLINE</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveNamespace(ns.name);
                              setActiveTab('search');
                            }}
                            className="hud-action-btn font-mono"
                          >
                            MOUNT_SECTOR_LOAD →
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH (QUERY ENGINE) */}
          {activeTab === 'search' && (
            <div className="tab-view-content fade-in-view">
              
              {/* Sub-mode Toggles */}
              <div className="sub-mode-toggle-bar font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setSearchSubMode('search');
                    setSearchError(null);
                  }}
                  className={`sub-mode-tab-btn ${searchSubMode === 'search' ? 'active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" />
                    <circle cx="12" cy="12" r="4" stroke="currentColor" />
                    <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1" />
                    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1" />
                  </svg>
                  HYBRID_SEARCH // 混合检索
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchSubMode('pack');
                    setSearchError(null);
                  }}
                  className={`sub-mode-tab-btn ${searchSubMode === 'pack' ? 'active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12,2 22,8.5 22,17.5 12,22 2,17.5 2,8.5" stroke="currentColor" />
                    <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" />
                    <line x1="12" y1="12" x2="22" y2="8.5" stroke="currentColor" />
                    <line x1="12" y1="12" x2="2" y2="8.5" stroke="currentColor" />
                  </svg>
                  CONTEXT_PACKER // 上下文打包
                </button>
              </div>

              {searchSubMode === 'search' ? (
                <div className="search-tab-layout">
                  <div className="search-left-form">
                    <GlassCard title="检索控制台 (Query Console)" glowColor="cyan" className="op-panel-card">
                    <form onSubmit={performSearch} className="sci-form">
                      <div className="form-group-sci">
                        <label htmlFor="search-q-input">检索内容 (Query Keywords)</label>
                        <input
                          id="search-q-input"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="输入查询语句或关键词..."
                          className="sci-control-input"
                          required
                        />
                      </div>

                      <div className="form-group-sci">
                        <label htmlFor="search-ns-select">命名空间筛选 (Namespace)</label>
                        <select
                          id="search-ns-select"
                          value={activeNamespace}
                          onChange={(e) => setActiveNamespace(e.target.value)}
                          className="sci-control-select"
                        >
                          <option value="all">全部命名空间 (All)</option>
                          {namespaces.map((ns) => (
                            <option key={ns} value={ns}>{ns}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group-sci">
                        <div className="slider-label-row">
                          <label htmlFor="topk-slider">返回条数上限 (Top K)</label>
                          <span className="slider-val text-cyan font-mono">{topK}</span>
                        </div>
                        <input
                          id="topk-slider"
                          type="range"
                          min="1"
                          max="15"
                          value={topK}
                          onChange={(e) => setTopK(parseInt(e.target.value))}
                          className="sci-slider"
                        />
                      </div>

                      <button type="submit" className="sci-submit-btn bg-cyan" disabled={searchLoading}>
                        {searchLoading ? '召回中...' : '开始混合检索'}
                      </button>
                    </form>
                  </GlassCard>
                </div>
                <div className="search-right-results">
                  <div className="search-results-wrapper font-mono">
                    {searchLoading ? (
                      <div className="search-status-banner">[ HYBRID_MATCH // 检索矩阵激活中... ]</div>
                    ) : searchError ? (
                      <div className="search-error-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-red))' }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                        </svg>
                        <span>发生错误: {searchError}</span>
                      </div>
                    ) : !searchSearched ? (
                      <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-svg-glow" style={{ animation: 'pulse 2s infinite' }}>
                          <circle cx="11" cy="11" r="6" stroke="hsl(var(--color-cyan))" />
                          <line x1="16" y1="16" x2="22" y2="22" stroke="hsl(var(--color-purple))" strokeWidth="3" />
                          <path d="M8 11h6M11 8v6" stroke="hsl(var(--color-cyan))" strokeWidth="1" />
                        </svg>
                        <span>READY // 待命。请输入关键词以搜索。</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-purple))' }}>
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                          <circle cx="12" cy="12" r="3" strokeDasharray="3 3" />
                        </svg>
                        <span>EMPTY_RECORD // 无匹配数据分块。</span>
                      </div>
                    ) : (
                      <div className="search-results-list">
                        <div className="results-count-title">召回匹配完成: {searchResults.length} 个区块</div>
                        
                        {searchResults.map((item) => {
                          const isEditing = editingId === item.id;
                          return (
                            <GlassCard 
                              key={item.id} 
                              className="result-item-card" 
                              glowColor={item.source === 'snapshot' ? 'purple' : 'cyan'}
                            >
                              <div className="result-item-top">
                                <span className="badge-ns">{item.namespace}</span>
                                <span className="badge-score" style={{ color: getScoreColor(item.score) }}>
                                  S: {item.score.toFixed(3)}
                                </span>
                              </div>
                              
                              {isEditing ? (
                                <div className="sci-form" style={{ gap: '10px', margin: '8px 0' }}>
                                  <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className="sci-control-textarea"
                                    rows="4"
                                    style={{ width: '100%', fontSize: '11.5px' }}
                                    required
                                  />
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '10px', color: 'hsl(var(--text-muted))' }}>来源:</span>
                                    <input
                                      type="text"
                                      value={editSource}
                                      onChange={(e) => setEditSource(e.target.value)}
                                      className="sci-control-input"
                                      style={{ padding: '4px 8px', fontSize: '11px', flex: 1 }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="result-item-body">
                                  <pre className="result-code">{item.content}</pre>
                                </div>
                              )}

                              <div className="result-item-footer">
                                {isEditing ? (
                                  <span className="source-lbl" style={{ color: 'hsl(var(--color-cyan))' }}>[ 编辑模式 ]</span>
                                ) : (
                                  <span className="source-lbl">Src: {item.source}</span>
                                )}
                                
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  {isEditing ? (
                                    <>
                                      <button 
                                        type="button"
                                        className="result-edit-btn"
                                        onClick={() => handleSaveEdit(item.id, item.namespace)}
                                        disabled={editLoading}
                                        style={{ borderColor: 'hsl(var(--color-green))', color: 'hsl(var(--color-green))' }}
                                      >
                                        {editLoading ? '保存中' : '保存'}
                                      </button>
                                      <button 
                                        type="button"
                                        className="result-delete-btn"
                                        onClick={() => setEditingId(null)}
                                        disabled={editLoading}
                                      >
                                        取消
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        type="button"
                                        className="result-edit-btn"
                                        onClick={() => {
                                          setEditingId(item.id);
                                          setEditContent(item.content);
                                          setEditSource(item.source);
                                        }}
                                      >
                                        编辑
                                      </button>
                                      <button 
                                        type="button"
                                        className="result-delete-btn"
                                        onClick={() => handleDeleteMemory(item.id, item.namespace)}
                                      >
                                        遗忘
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </GlassCard>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              ) : (
                <div className="search-tab-layout">
                  <div className="search-left-form">
                    <GlassCard title="上下文打包器 (Context Packer)" glowColor="purple" className="op-panel-card">
                    <form onSubmit={handlePackSubmit} className="sci-form">
                      <div className="form-group-sci">
                        <label htmlFor="pack-q-input">组装检索背景 (Query Details)</label>
                        <input
                          id="pack-q-input"
                          type="text"
                          value={packQuery}
                          onChange={(e) => setPackQuery(e.target.value)}
                          placeholder="例如：系统是如何进行混合检索和去重的..."
                          className="sci-control-input"
                          required
                        />
                      </div>

                      <div className="form-group-sci">
                        <label htmlFor="pack-ns-select">命名空间范围 (Namespace)</label>
                        <select
                          id="pack-ns-select"
                          value={activeNamespace}
                          onChange={(e) => setActiveNamespace(e.target.value)}
                          className="sci-control-select"
                        >
                          <option value="all">全部命名空间 (All)</option>
                          {namespaces.map((ns) => (
                            <option key={ns} value={ns}>{ns}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group-sci">
                        <div className="slider-label-row">
                          <label htmlFor="maxtokens-slider">Token 预算上限 (Max Tokens)</label>
                          <span className="slider-val text-cyan font-mono">{maxTokens}</span>
                        </div>
                        <input
                          id="maxtokens-slider"
                          type="range"
                          min="500"
                          max="8000"
                          step="100"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                          className="sci-slider"
                        />
                      </div>

                      <button type="submit" className="sci-submit-btn bg-purple" disabled={packLoading}>
                        {packLoading ? '打包中...' : '生成上下文 Prompt'}
                      </button>
                    </form>
                  </GlassCard>
                </div>
                <div className="search-right-results">
                  <div className="search-results-wrapper font-mono">
                    {packLoading ? (
                      <div className="search-status-banner">[ PACKING_MATRIX // 正在计算召回相关度并填充 Token 预算... ]</div>
                    ) : packError ? (
                      <div className="search-error-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-red))' }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                        </svg>
                        <span>发生错误: {packError}</span>
                      </div>
                    ) : !packedContext ? (
                      <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-svg-glow" style={{ animation: 'spin 12s linear infinite' }}>
                          <polygon points="12,2 22,8.5 22,17.5 12,22 2,17.5 2,8.5" stroke="hsl(var(--color-purple))" />
                          <line x1="12" y1="2" x2="12" y2="22" stroke="hsl(var(--color-cyan))" />
                          <line x1="12" y1="12" x2="22" y2="8.5" stroke="hsl(var(--color-cyan))" />
                          <line x1="12" y1="12" x2="2" y2="8.5" stroke="hsl(var(--color-cyan))" />
                        </svg>
                        <span>READY // 待命。输入检索背景生成拼接的 Prompt。</span>
                      </div>
                    ) : (
                      <GlassCard title="生成结果 (Packed Prompt Snippet)" glowColor="purple" className="result-item-card">
                        <div className="result-item-body" style={{ maxHeight: '400px' }}>
                          <pre className="result-code" style={{ whiteSpace: 'pre-wrap' }}>{packedContext}</pre>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                          <button
                            type="button"
                            className="copy-prompt-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(packedContext);
                              setCopySuccess(true);
                              setTimeout(() => setCopySuccess(false), 3000);
                            }}
                          >
                            {copySuccess ? '已复制到剪贴板！' : '复制 Prompt'}
                          </button>
                        </div>
                      </GlassCard>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          )}

          {activeTab === 'ingest' && (
            <div className="tab-view-content fade-in-view ingest-tab-layout">
              {/* Form 1: Memory Ingestion */}
              <div className="ingest-column">
                <GlassCard title="手动知识注入 (Insert)" glowColor="cyan" className="op-panel-card">
                  <form onSubmit={handleInsertSubmit} className="sci-form">
                  <div className="form-group-sci">
                    <label>命名空间分区 (Namespace)</label>
                    {!isCustomInsertNs ? (
                      <select
                        value={insertNs}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setIsCustomInsertNs(true);
                            setInsertNs('');
                          } else {
                            setInsertNs(e.target.value);
                          }
                        }}
                        className="sci-control-select"
                      >
                        {namespaces.map((ns) => (
                          <option key={ns} value={ns}>{ns}</option>
                        ))}
                        <option value="__new__">[+] 新建命名空间</option>
                      </select>
                    ) : (
                      <div className="custom-input-group">
                        <input
                          type="text"
                          value={customInsertNsText}
                          onChange={(e) => setCustomInsertNsText(e.target.value)}
                          placeholder="输入新命名空间..."
                          className="sci-control-input"
                          required
                        />
                        {namespaces.length > 0 && (
                          <button type="button" onClick={() => setIsCustomInsertNs(false)} className="sci-cancel-btn">
                            返回
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-group-sci">
                    <label htmlFor="ingest-src">数据来源 (Source)</label>
                    <input
                      id="ingest-src"
                      type="text"
                      value={insertSource}
                      onChange={(e) => setInsertSource(e.target.value)}
                      className="sci-control-input"
                      required
                    />
                  </div>

                  <div className="form-group-sci">
                    <label htmlFor="ingest-content">知识内容 (Content)</label>
                    <textarea
                      id="ingest-content"
                      value={insertContent}
                      onChange={(e) => setInsertContent(e.target.value)}
                      className="sci-control-textarea"
                      rows="4"
                      required
                    />
                  </div>

                  <div className="form-group-sci">
                    <div className="slider-label-row">
                      <label htmlFor="dedup-slider">语义去重阈值 (Deduplication Threshold)</label>
                      <span className="slider-val text-cyan font-mono">{dedupThreshold.toFixed(2)}</span>
                    </div>
                    <input
                      id="dedup-slider"
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={dedupThreshold}
                      onChange={(e) => setDedupThreshold(parseFloat(e.target.value))}
                      className="sci-slider"
                    />
                    <div className="input-helper-text font-mono" style={{ fontSize: '10px', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                      {dedupThreshold === 0 ? '0.00 (禁用自动语义去重)' : `${dedupThreshold.toFixed(2)} (相似度超过该阈值时自动合并)`}
                    </div>
                  </div>

                  <button type="submit" className="sci-submit-btn bg-cyan" disabled={insertLoading}>
                    {insertLoading ? '正在注入...' : '注入记忆碎片'}
                  </button>

                  {insertSuccess && (
                    <div className={`sci-success-banner ${insertMerged ? 'purple-color' : ''}`}>
                      {insertMerged 
                        ? '[ DEDUPLICATED // 检测到相似记忆，已执行合并去重 ]' 
                        : '[ SECURE_LOAD // 知识碎片载入与索引构建完成 ]'}
                    </div>
                  )}
                </form>
              </GlassCard>
            </div>

            {/* Form 2: State Snapshot */}
            <div className="ingest-column">
              <GlassCard title="全息认知状态快照 (Snapshot)" glowColor="purple" className="op-panel-card">
                <form onSubmit={handleSnapshotSubmit} className="sci-form">
                  <div className="form-group-sci">
                    <label>命名空间分区 (Namespace)</label>
                    {!isCustomSnapshotNs ? (
                      <select
                        value={snapshotNs}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setIsCustomSnapshotNs(true);
                            setSnapshotNs('');
                          } else {
                            setSnapshotNs(e.target.value);
                          }
                        }}
                        className="sci-control-select"
                      >
                        {namespaces.map((ns) => (
                          <option key={ns} value={ns}>{ns}</option>
                        ))}
                        <option value="__new__">[+] 新建命名空间</option>
                      </select>
                    ) : (
                      <div className="custom-input-group">
                        <input
                          type="text"
                          value={customSnapshotNsText}
                          onChange={(e) => setCustomSnapshotNsText(e.target.value)}
                          placeholder="输入新命名空间..."
                          className="sci-control-input"
                          required
                        />
                        {namespaces.length > 0 && (
                          <button type="button" onClick={() => setIsCustomSnapshotNs(false)} className="sci-cancel-btn">
                            返回
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-group-sci">
                    <label htmlFor="snap-desc">核心阶段认知边界摘要 (Summary / Context)</label>
                    <textarea
                      id="snap-desc"
                      value={snapshotSummary}
                      onChange={(e) => setSnapshotSummary(e.target.value)}
                      className="sci-control-textarea"
                      rows="5"
                      required
                    />
                  </div>

                  <button type="submit" className="sci-submit-btn bg-purple" disabled={snapshotLoading}>
                    {snapshotLoading ? '正在冻结...' : '冷冻当前的认知快照'}
                  </button>

                  {snapshotSuccess && <div className="sci-success-banner purple-color">[ SECURE_FREEZE // 认知快照冻结完成 ]</div>}
                </form>
              </GlassCard>
            </div>
          </div>
        )}

        </div>
      </div>

      <style jsx>{`
        .cockpit-container {
          max-width: 1400px;
          margin: 0 auto;
          position: relative;
        }

        .cockpit-layout-grid {
          position: relative;
          z-index: 10;
          height: calc(100vh - var(--header-height) - 60px);
          width: 100%;
        }

        .system-left-panel, .avatar-center-panel, .operations-right-panel {
          position: absolute;
          top: 0;
          bottom: 0;
          transition: all 0.5s cubic-bezier(0.25, 1, 0.3, 1);
        }

        /* Default (Dashboard Tab) */
        .system-left-panel {
          left: 0;
          width: 320px;
          opacity: 1;
          visibility: visible;
        }

        .avatar-center-panel {
          left: 344px;
          width: calc(100% - 320px - 450px - 48px);
          opacity: 1;
          visibility: visible;
        }

        .operations-right-panel {
          right: 0;
          width: 450px;
          opacity: 1;
          visibility: visible;
        }

        /* Search / Ingest Tabs Layout Swap */
        .cockpit-layout-grid.active-tab-search .system-left-panel,
        .cockpit-layout-grid.active-tab-ingest .system-left-panel {
          left: -340px;
          opacity: 0;
          visibility: hidden;
        }

        .cockpit-layout-grid.active-tab-search .avatar-center-panel,
        .cockpit-layout-grid.active-tab-ingest .avatar-center-panel {
          left: 0;
          width: 320px;
        }

        .cockpit-layout-grid.active-tab-search .operations-right-panel,
        .cockpit-layout-grid.active-tab-ingest .operations-right-panel {
          left: 344px;
          width: calc(100% - 320px - 24px);
        }

        /* Left column panel */
        .system-left-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
          overflow-y: auto;
          padding-right: 4px;
          pointer-events: auto;
        }

        /* Center Column styles */
        .avatar-center-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          pointer-events: auto;
          overflow: hidden;
        }

        .avatar-container-inner {
          width: 100%;
          height: 100%;
          z-index: 2;
          position: relative;
        }

        /* Telemetry Grid inside left panel */
        .telemetry-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 4px 0;
        }

        .telemetry-item {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          border-bottom: 1px dashed rgba(255, 187, 0, 0.05);
          padding-bottom: 6px;
        }

        .telemetry-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .telemetry-item .lbl {
          color: hsl(var(--text-muted));
        }

        .telemetry-item .val {
          font-weight: bold;
        }

        .panel-card-sci {
          background: rgba(8, 7, 5, 0.6);
        }

        .sci-card-value {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 10px 0;
        }

        .sci-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .sci-dot.online { background-color: hsl(var(--color-green)); box-shadow: 0 0 10px hsl(var(--color-green)); }
        .sci-dot.offline { background-color: hsl(var(--color-red)); box-shadow: 0 0 10px hsl(var(--color-red)); }

        .sci-large-text {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .sci-unit {
          font-size: 11px;
          color: hsl(var(--text-muted));
          margin-left: 6px;
          font-weight: 600;
        }

        .sci-footer-details {
          font-size: 10px;
          color: hsl(var(--text-muted));
          border-top: 1px solid rgba(255, 255, 255, 0.03);
          padding-top: 6px;
          margin-top: 6px;
        }

        /* Operations Right panel styles */
        .operations-right-panel {
          height: calc(100vh - var(--header-height) - 60px);
          overflow-y: auto;
          padding-right: 8px;
          pointer-events: auto;
        }

        .op-panel-card {
          background: rgba(6, 4, 3, 0.82);
          border-color: rgba(255, 187, 0, 0.12);
        }

        .fade-in-view {
          animation: view-fade 0.35s cubic-bezier(0.1, 0.8, 0.2, 1);
        }

        @keyframes view-fade {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* Redesigned Storage HUD Visualizer */
        .hud-chart-wrapper {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 30px;
          align-items: center;
        }

        .hud-radial-viz {
          width: 140px;
          height: 140px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hud-radial-svg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .spinning-dashed-ring {
          transform-origin: center;
          animation: spin-dashed 40s linear infinite;
        }

        @keyframes spin-dashed {
          100% { transform: rotate(360deg); }
        }

        .hud-center-text {
          text-align: center;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .hud-center-lbl {
          font-size: 8px;
          color: hsl(var(--text-muted));
          letter-spacing: 1.5px;
          line-height: 1;
        }

        .hud-center-val {
          font-size: 20px;
          font-weight: 800;
          line-height: 1.2;
          text-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
          letter-spacing: -0.5px;
        }

        .hud-center-unit {
          font-size: 8px;
          color: hsl(var(--text-muted));
          letter-spacing: 1px;
          line-height: 1;
        }

        .hud-data-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .hud-data-row {
          background: rgba(8, 7, 5, 0.45);
          border: 1px solid rgba(255, 187, 0, 0.04);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .hud-data-row:hover {
          background: rgba(8, 7, 5, 0.75);
          border-color: rgba(255, 187, 0, 0.15);
          transform: translateX(4px);
        }

        .hud-row-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .hud-sector-addr {
          font-size: 10px;
          font-weight: bold;
          opacity: 0.85;
        }

        .hud-sector-name {
          font-weight: bold;
          letter-spacing: 0.5px;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hud-sector-percentage {
          font-weight: 800;
        }

        .hud-row-mid {
          width: 100%;
        }

        .hud-bar-container {
          height: 6px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }

        .hud-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.8s cubic-bezier(0.1, 0.8, 0.2, 1);
        }

        .hud-row-bottom {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: hsl(var(--text-muted));
        }

        .hud-row-metric {
          letter-spacing: 0.5px;
        }

        .hud-row-status {
          font-weight: bold;
          letter-spacing: 1px;
        }

        .empty-sci-chart {
          padding: 20px 0;
          text-align: center;
          font-size: 11px;
          color: hsl(var(--text-dark));
        }

        .section-header-cockpit {
          margin-top: 20px;
          border-bottom: 1px solid rgba(0, 242, 254, 0.12);
          padding-bottom: 6px;
        }

        .section-header-cockpit h3 {
          font-size: 11px;
          letter-spacing: 1px;
          color: hsl(var(--color-cyan));
        }

        .namespaces-vertical-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 14px;
        }

        .ns-card-sci {
          background: rgba(6, 9, 18, 0.5);
          border-color: rgba(0, 242, 254, 0.08);
          padding: 16px;
        }

        .ns-sci-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .ns-sci-icon { font-size: 13px; }
        .ns-sci-name { font-size: 12px; font-weight: 700; color: hsl(var(--text-primary)); }

        .ns-sci-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }

        .ns-stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }
        .ns-stat-row .lbl { color: hsl(var(--text-muted)); }
        .ns-stat-row .val { font-weight: 700; }

        .ns-sci-footer {
          display: flex;
          justify-content: flex-end;
        }

        .ns-sci-action {
          font-size: 10px;
          color: hsl(var(--color-cyan));
          text-decoration: none;
          padding: 4px 10px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .ns-sci-action:hover {
          background: rgba(0, 242, 254, 0.06);
          box-shadow: 0 0 8px rgba(0, 242, 254, 0.15);
        }

        /* Sci Forms styling */
        .sci-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group-sci {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group-sci label {
          font-size: 11px;
          color: hsl(var(--text-muted));
          font-weight: 500;
        }

        .sci-control-input, .sci-control-select, .sci-control-textarea {
          background: rgba(3, 5, 10, 0.7);
          border: 1px solid rgba(0, 242, 254, 0.15);
          border-radius: 6px;
          padding: 8px 12px;
          color: hsl(var(--text-primary));
          font-family: var(--font-outfit);
          font-size: 12px;
          outline: none;
          transition: all 0.2s ease;
        }

        .sci-control-textarea {
          font-family: var(--font-mono);
          resize: vertical;
        }

        .sci-control-input:focus, .sci-control-select:focus, .sci-control-textarea:focus {
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.1);
        }

        .custom-input-group {
          display: flex;
          gap: 8px;
        }

        .sci-cancel-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: hsl(var(--text-muted));
          border-radius: 6px;
          padding: 0 12px;
          font-size: 11px;
          cursor: pointer;
        }

        .sci-slider {
          width: 100%;
          accent-color: hsl(var(--color-cyan));
          cursor: pointer;
        }

        .sci-submit-btn {
          border: none;
          border-radius: 6px;
          padding: 10px;
          font-family: var(--font-outfit);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          color: hsl(var(--bg-primary));
        }

        .sci-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .bg-cyan {
          background: hsl(var(--color-cyan));
          box-shadow: 0 3px 10px rgba(0, 242, 254, 0.15);
        }
        .bg-cyan:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 5px 15px rgba(0, 242, 254, 0.3);
        }

        .bg-purple {
          background: hsl(var(--color-purple));
          color: white;
          box-shadow: 0 3px 10px rgba(138, 43, 226, 0.15);
        }
        .bg-purple:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 5px 15px rgba(138, 43, 226, 0.3);
        }

        .sci-success-banner {
          font-size: 11px;
          color: hsl(var(--color-cyan));
          text-align: center;
          padding: 6px;
          background: rgba(0, 242, 254, 0.02);
          border-radius: 4px;
          margin-top: 8px;
        }
        .sci-success-banner.purple-color {
          color: #d1a4ff;
          background: rgba(138, 43, 226, 0.02);
        }

        /* Search Results inside Right Panel */
        .search-results-wrapper {
          margin-top: 20px;
        }

        .search-status-banner, .search-error-banner, .search-empty-banner {
          font-size: 12px;
          text-align: center;
          padding: 24px;
          color: hsl(var(--text-muted));
          border: 1px dashed rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
        
        .search-error-banner {
          color: #ff5f56;
          border-color: rgba(255, 95, 86, 0.2);
        }

        .search-results-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .results-count-title {
          font-size: 11px;
          color: hsl(var(--text-muted));
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          padding-bottom: 6px;
        }

        .result-item-card {
          background: rgba(3, 5, 10, 0.7);
          border-color: rgba(255, 255, 255, 0.04);
          padding: 12px;
        }

        .result-item-top {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 10px;
        }

        .badge-ns {
          background: rgba(0, 242, 254, 0.08);
          border: 1px solid rgba(0, 242, 254, 0.2);
          color: hsl(var(--color-cyan));
          padding: 1px 6px;
          border-radius: 3px;
        }

        .badge-score {
          font-weight: 700;
        }

        .result-item-body {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.02);
          border-radius: 4px;
          padding: 10px;
          max-height: 380px;
          overflow: auto;
          margin-bottom: 8px;
        }

        .result-code {
          font-size: 11.5px;
          color: #e2e8f0;
          white-space: pre-wrap;
          word-break: break-all;
          overflow-wrap: break-word;
          line-height: 1.4;
        }

        .result-item-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.02);
          padding-top: 6px;
        }

        .source-lbl {
          color: hsl(var(--text-muted));
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .result-delete-btn {
          background: transparent;
          border: 1px solid rgba(255, 95, 86, 0.2);
          color: rgba(255, 95, 86, 0.7);
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-outfit);
          font-size: 10px;
          transition: all 0.2s ease;
        }
        .result-delete-btn:hover {
          background: rgba(255, 95, 86, 0.06);
          border-color: rgba(255, 95, 86, 0.4);
          color: #ff5f56;
        }

        /* Neon Glow animations & hover focus laser sweeps */
        @keyframes neon-border-cycle {
          0% {
            border-color: rgba(0, 242, 254, 0.12);
            box-shadow: 0 0 10px rgba(0, 242, 254, 0.03);
          }
          50% {
            border-color: rgba(138, 43, 226, 0.22);
            box-shadow: 0 0 16px rgba(138, 43, 226, 0.1);
          }
          100% {
            border-color: rgba(0, 242, 254, 0.12);
            box-shadow: 0 0 10px rgba(0, 242, 254, 0.03);
          }
        }

        @keyframes neon-text-cycle {
          0% {
            color: hsl(var(--color-cyan));
            text-shadow: 0 0 6px rgba(0, 242, 254, 0.5), 0 0 12px rgba(0, 242, 254, 0.2);
          }
          50% {
            color: hsl(var(--color-purple));
            text-shadow: 0 0 6px rgba(138, 43, 226, 0.6), 0 0 12px rgba(138, 43, 226, 0.3);
          }
          100% {
            color: hsl(var(--color-cyan));
            text-shadow: 0 0 6px rgba(0, 242, 254, 0.5), 0 0 12px rgba(0, 242, 254, 0.2);
          }
        }

        .section-header-cockpit h3 {
          font-size: 11.5px;
          letter-spacing: 1.2px;
          animation: neon-text-cycle 6s ease-in-out infinite;
          margin-top: 24px;
        }

        .ns-card-sci, .result-item-card {
          animation: neon-border-cycle 8s ease-in-out infinite;
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .ns-card-sci:hover, .result-item-card:hover {
          transform: translateY(-2px);
          border-color: hsl(var(--color-cyan)) !important;
          box-shadow: 0 5px 22px rgba(0, 242, 254, 0.16) !important;
        }

        /* Sci-Fi button layout (laser sweep + corner brackets) */
        .sci-submit-btn, .ns-sci-action, .sub-mode-tab-btn, .copy-prompt-btn, .result-edit-btn, .result-delete-btn {
          position: relative;
          overflow: hidden;
        }

        /* Glowing focus brackets that contract slightly on hover */
        .sci-submit-btn::before, .ns-sci-action::before, .sub-mode-tab-btn::before, .copy-prompt-btn::before, .result-edit-btn::before {
          content: '';
          position: absolute;
          top: -2px; left: -2px; right: -2px; bottom: -2px;
          border: 1px solid transparent;
          border-radius: 6px;
          pointer-events: none;
          transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
          opacity: 0;
          transform: scale(1.06);
        }

        .sci-submit-btn:hover::before, .ns-sci-action:hover::before, .sub-mode-tab-btn:hover::before, .copy-prompt-btn:hover::before, .result-edit-btn:hover::before {
          opacity: 0.9;
          transform: scale(1.0);
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 6px rgba(0, 242, 254, 0.4);
        }

        /* Scanning laser line sweep on hover */
        .sci-submit-btn::after, .ns-sci-action::after, .sub-mode-tab-btn::after, .copy-prompt-btn::after, .result-edit-btn::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -60%;
          width: 25%;
          height: 200%;
          background: linear-gradient(to right, transparent, rgba(0, 242, 254, 0.25), transparent);
          transform: rotate(25deg);
          pointer-events: none;
          opacity: 0;
          transition: none;
        }

        .sci-submit-btn:hover::after, .ns-sci-action:hover::after, .sub-mode-tab-btn:hover::after, .copy-prompt-btn:hover::after, .result-edit-btn:hover::after {
          opacity: 1;
          left: 140%;
          transition: left 0.55s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sub-mode-toggle-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(255, 187, 0, 0.08);
          padding-bottom: 8px;
        }
        .sub-mode-tab-btn {
          background: transparent;
          border: 1px solid rgba(255, 187, 0, 0.15);
          color: hsl(var(--text-muted));
          border-radius: 6px;
          padding: 6px 16px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .sub-mode-tab-btn:hover {
          color: hsl(var(--text-primary));
          border-color: rgba(0, 242, 254, 0.3);
        }
        .sub-mode-tab-btn.active {
          background: rgba(0, 242, 254, 0.05);
          border-color: hsl(var(--color-cyan)) !important;
          color: hsl(var(--color-cyan));
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.1);
        }
        .copy-prompt-btn {
          background: rgba(0, 242, 254, 0.1);
          border: 1px solid rgba(0, 242, 254, 0.3);
          color: hsl(var(--color-cyan));
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 10px;
        }
        .copy-prompt-btn:hover {
          background: rgba(0, 242, 254, 0.2);
          box-shadow: 0 0 12px rgba(0, 242, 254, 0.3);
        }
        .result-edit-btn {
          background: transparent;
          border: 1px solid rgba(0, 242, 254, 0.2);
          color: rgba(0, 242, 254, 0.7);
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-outfit);
          font-size: 10px;
          transition: all 0.2s ease;
          margin-right: 6px;
        }
        .result-edit-btn:hover {
          background: rgba(0, 242, 254, 0.06);
          border-color: rgba(0, 242, 254, 0.4);
          color: hsl(var(--color-cyan));
        }

        /* Cyber HUD Cards styles (transparent when unselected) */
        .cyber-hud-card {
          position: relative;
          background: rgba(6, 4, 3, 0.03); /* Transparent background */
          border: 1px solid rgba(255, 187, 0, 0.05);
          border-radius: 4px;
          padding: 16px;
          opacity: 0.42; /* Dimmed and transparent by default */
          transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1);
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: inset 0 0 10px rgba(255, 187, 0, 0.01);
          overflow: hidden;
        }

        .cyber-hud-card:hover, .cyber-hud-card.selected {
          opacity: 1.0; /* Full opacity on hover or selection */
          background: rgba(8, 7, 5, 0.85); /* Backing panel becomes visible */
          border-color: hsl(var(--color-cyan));
          box-shadow: 
            0 8px 30px rgba(0, 242, 254, 0.14), 
            inset 0 0 12px rgba(0, 242, 254, 0.05);
          transform: translateY(-2px);
        }

        .cyber-hud-card.selected {
          border-color: hsl(var(--color-purple));
          box-shadow: 
            0 8px 30px rgba(255, 102, 0, 0.14), 
            inset 0 0 12px rgba(255, 102, 0, 0.05);
        }

        /* L-brackets on cyber hud cards (only glowing on hover/selected) */
        .hud-corner-bracket {
          position: absolute;
          width: 7px;
          height: 7px;
          border: 1.5px solid hsl(var(--color-cyan));
          pointer-events: none;
          opacity: 0;
          transform: scale(1.15);
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .cyber-hud-card:hover .hud-corner-bracket, .cyber-hud-card.selected .hud-corner-bracket {
          opacity: 0.85;
          transform: scale(1.0);
        }

        .cyber-hud-card.selected .hud-corner-bracket {
          border-color: hsl(var(--color-purple));
        }

        .hud-corner-bracket.tl { top: 4px; left: 4px; border-right: none; border-bottom: none; }
        .hud-corner-bracket.tr { top: 4px; right: 4px; border-left: none; border-bottom: none; }
        .hud-corner-bracket.bl { bottom: 4px; left: 4px; border-right: none; border-top: none; }
        .hud-corner-bracket.br { bottom: 4px; right: 4px; border-left: none; border-top: none; }

        /* Telemetry card components */
        .hud-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed rgba(255, 187, 0, 0.08);
          padding-bottom: 6px;
        }

        .hud-card-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .hud-tech-addr {
          font-size: 9px;
          color: hsl(var(--color-cyan));
          font-weight: bold;
          letter-spacing: 0.5px;
        }

        .hud-tech-title {
          font-size: 13px;
          font-weight: bold;
          color: #fff;
          letter-spacing: 0.5px;
        }

        .hud-status-badge {
          font-size: 8px;
          padding: 1px 5px;
          border-radius: 2px;
          font-weight: bold;
          letter-spacing: 0.5px;
        }

        .hud-status-badge.active-neon {
          background: rgba(0, 242, 254, 0.06);
          border: 1px solid rgba(0, 242, 254, 0.2);
          color: hsl(var(--color-cyan));
          text-shadow: 0 0 5px rgba(0, 242, 254, 0.4);
        }

        .cyber-hud-card.selected .hud-status-badge.active-neon {
          background: rgba(255, 102, 0, 0.06);
          border-color: rgba(255, 102, 0, 0.2);
          color: hsl(var(--color-purple));
          text-shadow: 0 0 5px rgba(255, 102, 0, 0.4);
        }

        .hud-card-body {
          display: grid;
          grid-template-columns: 75px 1fr;
          gap: 14px;
          align-items: center;
        }

        .hud-visual-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-right: 1px solid rgba(255, 187, 0, 0.08);
          padding-right: 12px;
          gap: 4px;
        }

        .hud-matrix-dots {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3px;
        }

        .hud-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.03);
          transition: all 0.3s ease;
        }

        .hud-dot.glow-cyan {
          background: hsl(var(--color-cyan));
          box-shadow: 0 0 5px hsl(var(--color-cyan));
        }

        .cyber-hud-card.selected .hud-dot.glow-cyan {
          background: hsl(var(--color-purple));
          box-shadow: 0 0 5px hsl(var(--color-purple));
        }

        .hud-dot.dark-dot {
          background: rgba(255, 255, 255, 0.01);
        }

        .hud-matrix-percentage {
          font-size: 11px;
          font-weight: bold;
          color: #e2e8f0;
        }

        .hud-specs-column {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .hud-spec-item {
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
        }

        .hud-spec-item .spec-lbl {
          color: hsl(var(--text-muted));
        }

        .hud-spec-item .spec-val {
          font-weight: bold;
        }

        .hud-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid rgba(255, 255, 255, 0.02);
          padding-top: 8px;
        }

        .hud-metric-readout {
          font-size: 8px;
          color: hsl(var(--text-muted));
        }

        .hud-action-btn {
          background: transparent;
          border: 1px solid rgba(0, 242, 254, 0.15);
          color: hsl(var(--color-cyan));
          font-size: 9px;
          padding: 3px 8px;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .hud-action-btn:hover {
          background: rgba(0, 242, 254, 0.08);
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 8px rgba(0, 242, 254, 0.25);
        }

        .cyber-hud-card.selected .hud-action-btn {
          border-color: rgba(255, 102, 0, 0.2);
          color: hsl(var(--color-purple));
        }

        .cyber-hud-card.selected .hud-action-btn:hover {
          background: rgba(255, 102, 0, 0.08);
          border-color: hsl(var(--color-purple));
          box-shadow: 0 0 8px rgba(255, 102, 0, 0.25);
        }

        @media (max-width: 1024px) {
          .cockpit-layout-grid {
            position: relative;
            display: flex;
            flex-direction: column;
            height: auto;
          }
          .system-left-panel, .avatar-center-panel, .operations-right-panel {
            position: relative;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
          }
          .operations-right-panel {
            position: relative;
            top: 0;
            height: auto;
          }
          .hologram-overlay-wing {
            display: none;
          }
        }

        /* Dynamic Tab Layout Sub-Grids */
        .search-tab-layout {
          display: grid;
          grid-template-columns: 400px minmax(0, 1fr);
          gap: 24px;
          align-items: start;
          height: 100%;
        }

        .search-left-form {
          position: sticky;
          top: 0;
        }

        .search-right-results {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ingest-tab-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }
      `}</style>
    </div>
  );
}
