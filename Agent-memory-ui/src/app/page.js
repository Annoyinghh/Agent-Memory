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

    try {
      await api.insert(finalNs, insertContent, insertSource);
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
        message: `成功录入！已向命名空间 [ ${finalNs} ] 注入新知识。`
      });

      setTimeout(() => setInsertSuccess(false), 5000);
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
      <div className="cockpit-layout-grid">
        
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
                  namespacesList.map((ns, idx) => (
                    <GlassCard
                      key={ns.name}
                      className="ns-card-sci"
                      glowColor={idx % 2 === 0 ? 'cyan' : 'purple'}
                    >
                      <div className="ns-sci-header font-mono">
                        <span className="ns-sci-icon">📁</span>
                        <span className="ns-sci-name">{ns.name}</span>
                      </div>
                      
                      <div className="ns-sci-body font-mono">
                        <div className="ns-stat-row">
                          <span className="lbl">DENSITY:</span>
                          <span className={idx % 2 === 0 ? 'val text-cyan' : 'val text-purple'}>{ns.count} CHUNKS</span>
                        </div>
                        <div className="ns-stat-row">
                          <span className="lbl">RATIO:</span>
                          <span className="val text-white">{ns.percentage}%</span>
                        </div>
                      </div>

                      <div className="ns-sci-footer">
                        <button
                          onClick={() => {
                            setActiveNamespace(ns.name);
                            setActiveTab('search');
                          }}
                          className="ns-sci-action font-mono"
                          style={{ background: 'transparent', border: '1px solid rgba(0, 242, 254, 0.2)', cursor: 'pointer' }}
                        >
                          LOAD_SECTOR →
                        </button>
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH (QUERY ENGINE) */}
          {activeTab === 'search' && (
            <div className="tab-view-content fade-in-view">
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

              {/* Search Results List */}
              <div className="search-results-wrapper font-mono">
                {searchLoading ? (
                  <div className="search-status-banner">[ HYBRID_MATCH // 检索矩阵激活中... ]</div>
                ) : searchError ? (
                  <div className="search-error-banner">❌ 发生错误: {searchError}</div>
                ) : !searchSearched ? (
                  <div className="search-empty-banner">🔎 待命。请输入关键词以搜索。</div>
                ) : searchResults.length === 0 ? (
                  <div className="search-empty-banner">📭 无召回匹配分块。</div>
                ) : (
                  <div className="search-results-list">
                    <div className="results-count-title">召回匹配完成: {searchResults.length} 个区块</div>
                    
                    {searchResults.map((item) => (
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
                        <div className="result-item-body">
                          <pre className="result-code">{item.content}</pre>
                        </div>
                        <div className="result-item-footer">
                          <span className="source-lbl">Src: {item.source}</span>
                          <button 
                            className="result-delete-btn"
                            onClick={() => handleDeleteMemory(item.id, item.namespace)}
                          >
                            遗忘
                          </button>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: INGEST (MANUAL INSERTION) */}
          {activeTab === 'ingest' && (
            <div className="tab-view-content fade-in-view">
              {/* Form 1: Memory Ingestion */}
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

                  <button type="submit" className="sci-submit-btn bg-cyan" disabled={insertLoading}>
                    {insertLoading ? '正在注入...' : '注入记忆碎片'}
                  </button>

                  {insertSuccess && <div className="sci-success-banner">[ SECURE_LOAD // 知识碎片载入完成 ]</div>}
                </form>
              </GlassCard>

              {/* Form 2: State Snapshot */}
              <GlassCard title="全息认知状态快照 (Snapshot)" glowColor="purple" className="op-panel-card" style={{ marginTop: '20px' }}>
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
          display: grid;
          grid-template-columns: 320px 1fr 450px;
          gap: 24px;
          align-items: stretch;
          position: relative;
          z-index: 10;
          height: calc(100vh - var(--header-height) - 60px);
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
          position: relative;
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
          position: sticky;
          top: calc(var(--header-height) + 30px);
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
          max-height: 140px;
          overflow-y: auto;
          margin-bottom: 8px;
        }

        .result-code {
          font-size: 11.5px;
          color: #e2e8f0;
          white-space: pre-wrap;
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

        @media (max-width: 1024px) {
          .cockpit-layout-grid {
            grid-template-columns: 1fr;
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
      `}</style>
    </div>
  );
}
