'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import GlassCard from './GlassCard';

export default function CodebaseIntel() {
  const { activeNamespace, isOnline, refreshData } = useApp();
  const [activeSubTab, setActiveSubTab] = useState('architecture');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Common UI State
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [snippetLoading, setSnippetLoading] = useState(false);
  const [snippetData, setSnippetData] = useState(null);

  // Tab 1: Architecture States
  const [archData, setArchData] = useState(null);
  const [schemaData, setSchemaData] = useState(null);

  // Tab 2: Search States
  const [searchFilters, setSearchFilters] = useState({
    nameRegex: '',
    sourceFileRegex: '',
    nodeType: 'all',
    minDegree: '',
    maxDegree: '',
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searchHasRun, setSearchHasRun] = useState(false);

  // Tab 3: Trace States
  const [traceInput, setTraceInput] = useState('');
  const [traceDirection, setTraceDirection] = useState('outbound');
  const [traceDepth, setTraceDepth] = useState(3);
  const [traceResults, setTraceResults] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);

  // Tab 4: Dead Code States
  const [deadCodeList, setDeadCodeList] = useState([]);
  const [deadCodeFilter, setDeadCodeFilter] = useState('');

  // Tab 5: Change Impact States
  const [changesBase, setChangesBase] = useState('HEAD');
  const [changesResults, setChangesResults] = useState(null);
  const [changesLoading, setChangesLoading] = useState(false);

  // Tab 6: Team Sync States
  const [artifactManifest, setArtifactManifest] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [restoreTaskId, setRestoreTaskId] = useState(null);
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const pollTimerRef = useRef(null);

  // ──────────────────────────────────────────────────────────────
  // Fetch Functions
  // ──────────────────────────────────────────────────────────────

  const fetchArchitecture = useCallback(async () => {
    if (activeNamespace === 'all') {
      setError('请选择一个具体的项目命名空间来进行代码架构分析。');
      setArchData(null);
      setSchemaData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const arch = await api.getArchitecture(activeNamespace);
      const schema = await api.getGraphSchema(activeNamespace);
      
      // Map API fields to frontend assumptions
      const processedArch = {
        ...arch,
        files_count: arch.file_count,
        languages: arch.language_breakdown,
        entrances: arch.entry_point_candidates || [],
        hotspots: (arch.hotspots || []).map(h => ({
          ...h,
          degree: h.total_degree
        }))
      };
      const processedSchema = {
        ...schema,
        nodes_count: schema.nodes,
        edges_count: schema.edges
      };

      setArchData(processedArch);
      setSchemaData(processedSchema);
    } catch (err) {
      setError(err.message || '获取架构总览数据失败');
    } finally {
      setLoading(false);
    }
  }, [activeNamespace]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (activeNamespace === 'all') return;
    setLoading(true);
    setError(null);
    try {
      const filters = {
        nodeType: searchFilters.nodeType === 'all' ? null : searchFilters.nodeType,
        nameRegex: searchFilters.nameRegex.trim() || null,
        sourceFileRegex: searchFilters.sourceFileRegex.trim() || null,
        minDegree: searchFilters.minDegree !== '' ? parseInt(searchFilters.minDegree) : undefined,
        maxDegree: searchFilters.maxDegree !== '' ? parseInt(searchFilters.maxDegree) : undefined,
      };
      const data = await api.searchGraphStructured(activeNamespace, filters);
      
      const results = (data.results || data || []).map(row => ({
        ...row,
        degree: row.total_degree
      }));

      setSearchResults(results);
      setSearchHasRun(true);
    } catch (err) {
      setError(err.message || '结构化搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTrace = async (e) => {
    if (e) e.preventDefault();
    if (!traceInput.trim() || activeNamespace === 'all') return;
    setTraceLoading(true);
    setError(null);
    try {
      const data = await api.traceGraphPath(
        activeNamespace,
        traceInput.trim(),
        traceDirection,
        'calls',
        traceDepth
      );
      setTraceResults(data);
    } catch (err) {
      setError(err.message || '调用链追踪失败');
    } finally {
      setTraceLoading(false);
    }
  };

  const fetchDeadCode = useCallback(async () => {
    if (activeNamespace === 'all') return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDeadCode(activeNamespace);
      const results = (data.dead_code || data.results || data || []).map(row => ({
        ...row,
        node_type: row.node_type || 'function'
      }));
      setDeadCodeList(results);
    } catch (err) {
      setError(err.message || '获取冗余代码扫描数据失败');
    } finally {
      setLoading(false);
    }
  }, [activeNamespace]);

  const handleDetectChanges = async (e) => {
    if (e) e.preventDefault();
    if (activeNamespace === 'all') return;
    setChangesLoading(true);
    setError(null);
    try {
      const data = await api.detectChanges(activeNamespace, changesBase.trim());
      
      let riskLevel = 'LOW';
      if (data.risk_summary) {
        if (data.risk_summary.high > 0) riskLevel = 'HIGH';
        else if (data.risk_summary.medium > 0) riskLevel = 'MEDIUM';
      }
      
      const processed = {
        ...data,
        risk_level: riskLevel,
        modified_nodes_count: data.impacted_nodes ? data.impacted_nodes.length : 0,
        blast_radius_size: data.blast_radius ? data.blast_radius.affected_count : 0,
        blast_radius_nodes: (data.impacted_nodes || []).map(node => ({
          ...node,
          impact_risk: (node.risk || 'low').toUpperCase()
        }))
      };

      setChangesResults(processed);
    } catch (err) {
      setError(err.message || '变更评估失败');
    } finally {
      setChangesLoading(false);
    }
  };

  const fetchArtifactManifest = useCallback(async () => {
    if (activeNamespace === 'all') return;
    try {
      const data = await api.getArtifactManifest(activeNamespace);
      setArtifactManifest(data);
    } catch (err) {
      console.error('获取工件清单失败:', err);
    }
  }, [activeNamespace]);

  // Load Tab Data
  useEffect(() => {
    setSelectedSymbol(null);
    setSnippetData(null);
    setSearchResults([]);
    setSearchHasRun(false);
    setTraceResults(null);
    setDeadCodeList([]);
    setChangesResults(null);

    if (activeSubTab === 'architecture') {
      fetchArchitecture();
    } else if (activeSubTab === 'deadcode') {
      fetchDeadCode();
    } else if (activeSubTab === 'sync') {
      fetchArtifactManifest();
    }
  }, [activeNamespace, activeSubTab, fetchArchitecture, fetchDeadCode, fetchArtifactManifest]);

  // ──────────────────────────────────────────────────────────────
  // Snippet Viewer Drawer
  // ──────────────────────────────────────────────────────────────

  const viewSnippet = async (symbol) => {
    setSelectedSymbol(symbol);
    setSnippetLoading(true);
    setSnippetData(null);
    try {
      const res = await api.getCodeSnippet(
        activeNamespace,
        symbol.id || symbol.node_id,
        symbol.qualified_name || null,
        8
      );
      setSnippetData(res);
    } catch (err) {
      setSnippetData({ error: err.message || '无法获取代码片段' });
    } finally {
      setSnippetLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Artifact upload & restore polling
  // ──────────────────────────────────────────────────────────────

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleRestoreArtifact = async () => {
    if (!selectedFile || activeNamespace === 'all') return;
    setRestoring(true);
    setRestoreProgress({ stage: 'upload', percent: 0, message: '正在上传工件备份文件...' });
    try {
      const res = await api.restoreArtifact(selectedFile, activeNamespace);
      setRestoreTaskId(res.task_id);
    } catch (err) {
      setError(err.message || '上传恢复工件失败');
      setRestoring(false);
    }
  };

  // Poll restore task status
  useEffect(() => {
    if (!restoreTaskId) return;

    const checkStatus = async () => {
      try {
        const task = await api.getTaskStatus(restoreTaskId);
        setRestoreProgress({
          stage: task.stage || 'running',
          percent: task.percent || 0,
          message: task.message || '正在恢复图谱...',
          current: task.current,
          total: task.total
        });

        if (task.status === 'completed') {
          setRestoreTaskId(null);
          setRestoring(false);
          setSelectedFile(null);
          setRestoreProgress(null);
          refreshData();
          fetchArchitecture();
          alert('工件恢复成功！图谱已重新同步。');
        } else if (task.status === 'failed') {
          setRestoreTaskId(null);
          setRestoring(false);
          setError(task.error || '图谱恢复任务失败。');
        }
      } catch (err) {
        console.error('轮询恢复状态失败:', err);
      }
    };

    pollTimerRef.current = setInterval(checkStatus, 1000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [restoreTaskId, refreshData, fetchArchitecture]);

  // ──────────────────────────────────────────────────────────────
  // Helper render components
  // ──────────────────────────────────────────────────────────────

  const buildTreeFromGraph = (data) => {
    if (!data) return null;
    if (data.error) return data;
    
    const startId = data.start_id;
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    
    const nodeMap = new Map();
    nodes.forEach(n => {
      nodeMap.set(n.id, {
        id: n.id,
        name: n.label || n.id,
        node_type: n.node_type || 'function',
        source_file: n.source_file,
        line_number: n.source_location ? n.source_location.replace(/^L/, '') : null,
        children: []
      });
    });
    
    const rootNode = nodeMap.get(startId);
    if (!rootNode) return null;
    
    const nodeDepths = new Map();
    nodeDepths.set(startId, 0);
    
    const sortedEdges = [...edges].sort((a, b) => (a.depth || 0) - (b.depth || 0));
    
    sortedEdges.forEach(edge => {
      const parentId = nodeDepths.has(edge.from) && (!nodeDepths.has(edge.to) || nodeDepths.get(edge.from) < nodeDepths.get(edge.to))
        ? edge.from
        : edge.to;
      const childId = parentId === edge.from ? edge.to : edge.from;
      
      const parentNode = nodeMap.get(parentId);
      const childNode = nodeMap.get(childId);
      
      if (parentNode && childNode && !nodeDepths.has(childId)) {
        nodeDepths.set(childId, nodeDepths.get(parentId) + 1);
        if (!parentNode.children.some(c => c.id === childId)) {
          parentNode.children.push(childNode);
        }
      }
    });
    
    return rootNode;
  };

  const renderTraceNode = (node, depth = 0) => {
    if (!node) return null;
    const isRoot = depth === 0;
    return (
      <div 
        key={node.id || node.name} 
        className="trace-tree-node font-mono" 
        style={{ paddingLeft: isRoot ? 0 : '24px', position: 'relative', marginTop: '6px' }}
      >
        {!isRoot && (
          <div className="trace-tree-branch-line" style={{
            position: 'absolute',
            left: '8px',
            top: '-6px',
            width: '12px',
            height: '20px',
            borderLeft: '1px dashed rgba(255, 187, 0, 0.3)',
            borderBottom: '1px dashed rgba(255, 187, 0, 0.3)',
          }} />
        )}
        <div 
          className="trace-node-badge"
          style={{
            background: isRoot ? 'rgba(255, 187, 0, 0.15)' : 'rgba(0, 242, 254, 0.05)',
            border: isRoot ? '1px solid #ffbb00' : '1px solid rgba(0, 242, 254, 0.2)',
            borderRadius: '4px',
            padding: '6px 12px',
            display: 'inline-flex',
            flexDirection: 'column',
            gap: '2px',
            cursor: 'pointer',
            minWidth: '220px',
            boxShadow: isRoot ? '0 0 10px rgba(255,187,0,0.1)' : 'none',
            verticalAlign: 'middle',
          }}
          onClick={() => {
            setTraceInput(node.name || node.label || node.id);
            viewSnippet({ id: node.id, qualified_name: node.name, content: node.name, source: node.source_file });
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: isRoot ? '#ffbb00' : '#00f2fe', fontWeight: 'bold', fontSize: '12px' }}>
              {node.name || node.label || node.id}
            </span>
            <span style={{ fontSize: '8px', opacity: 0.6, background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '2px' }}>
              {node.node_type || node.label_type || 'Unknown'}
            </span>
          </div>
          <div style={{ fontSize: '9px', opacity: 0.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }} title={node.source_file}>
            📁 {node.source_file ? node.source_file.split('/').pop() : 'external'}
            {node.line_number && ` : L${node.line_number}`}
          </div>
        </div>

        {node.children && node.children.length > 0 && (
          <div className="trace-children-container" style={{ marginTop: '4px' }}>
            {node.children.map(child => renderTraceNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="codebase-vis-layout flex flex-col h-full font-sans text-sm relative" style={{ color: 'hsl(var(--text-primary))' }}>
      
      {/* 1. Header with Telemetry Line */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-dashed border-[rgba(255,187,0,0.1)] bg-[rgba(3,2,1,0.9)] z-10 shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-wider font-mono" style={{ textShadow: '0 0 10px rgba(255, 187, 0, 0.3)' }}>
            🏛️ 架构智能分析舱 // ARCHITECTURE_COCKPIT
          </h1>
          <p className="text-xs text-[hsl(var(--text-muted))] font-mono mt-1">
            PROJECT: <span className="text-cyan font-bold">{activeNamespace === 'all' ? 'GLOBAL_OVERVIEW' : activeNamespace.toUpperCase()}</span> // STATUS: ONLINE_DIAGNOSTICS
          </p>
        </div>

        {/* Namespace warning */}
        {activeNamespace === 'all' && (
          <div className="font-mono text-xs text-amber border border-amber/30 bg-amber/5 px-3 py-1.5 rounded flex items-center gap-2">
            ⚠️ 请在侧边栏或顶部选择具体的 Namespace
          </div>
        )}
      </div>

      {/* 2. Inner Tab Selection Bar */}
      <div className="flex px-6 py-2 bg-[rgba(3,2,1,0.7)] border-b border-[rgba(255,187,0,0.05)] z-10 shrink-0 select-none overflow-x-auto gap-2">
        {[
          { id: 'architecture', label: '🏛️ 架构总览', desc: 'ARCHITECTURE' },
          { id: 'search', label: '🔍 结构化搜索', desc: 'SEARCH' },
          { id: 'trace', label: '🔗 调用链路', desc: 'TRACE' },
          { id: 'deadcode', label: '💀 冗余代码', desc: 'DEAD_CODE' },
          { id: 'changes', label: '⚡ 变更评估', desc: 'RISK_DIFF' },
          { id: 'sync', label: '📦 团队协同', desc: 'SYNC_BACKUP' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            disabled={activeNamespace === 'all'}
            className={`px-4 py-2 font-mono text-xs rounded border transition-all duration-200 cursor-pointer flex flex-col items-center gap-0.5 ${
              activeSubTab === tab.id
                ? 'border-[#ffbb00] bg-[rgba(255,187,0,0.06)] text-[#ffbb00] shadow-[0_0_8px_rgba(255,187,0,0.15)]'
                : 'border-[rgba(255,255,255,0.04)] bg-transparent text-[hsl(var(--text-muted))] hover:border-[rgba(255,187,0,0.2)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed'
            }`}
          >
            <span>{tab.label}</span>
            <span style={{ fontSize: '8px', opacity: 0.5 }}>{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* 3. Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative z-0">
        
        {/* Content Pane */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          
          {loading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 font-mono text-[#00f2fe]">
              <div className="flex flex-col items-center gap-4">
                <svg className="animate-spin h-10 w-10 text-[#00f2fe]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>正在加载核心遥测数据... LOAD_SYSTEM_INFO</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 border border-red/30 bg-red/5 rounded font-mono text-xs text-red shadow-[0_0_15px_rgba(239,68,68,0.1)]">
              ❌ 系统错误: {error}
            </div>
          )}

          {activeNamespace !== 'all' && (
            <>
              {/* TAB 1: ARCHITECTURE OVERVIEW */}
              {activeSubTab === 'architecture' && archData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Column: Diagnostics Stats */}
                  <div className="lg:col-span-2 flex flex-col gap-6">
                    
                    {/* Graph Grid Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: '图谱节点总数', value: schemaData?.nodes_count || 0, unit: 'NODES', color: 'cyan' },
                        { label: '图谱边数关系', value: schemaData?.edges_count || 0, unit: 'EDGES', color: 'amber' },
                        { label: '源码文件总数', value: archData?.files_count || 0, unit: 'FILES', color: 'green' },
                        { label: '语言统计数量', value: archData?.languages ? Object.keys(archData.languages).length : 0, unit: 'LANGS', color: 'purple' },
                      ].map((card, i) => (
                        <GlassCard key={i} glowColor={card.color} className="p-4 font-mono">
                          <div className="text-[9px] text-[hsl(var(--text-muted))] uppercase tracking-wider">{card.label}</div>
                          <div className="text-xl font-bold mt-1.5 flex items-baseline gap-1" style={{ color: card.color === 'cyan' ? '#00f2fe' : card.color === 'amber' ? '#ffbb00' : card.color === 'green' ? '#10b981' : '#a855f7' }}>
                            {card.value.toLocaleString()} <span className="text-[10px] opacity-55">{card.unit}</span>
                          </div>
                        </GlassCard>
                      ))}
                    </div>

                    {/* Hotspot Top Nodes List */}
                    <GlassCard glowColor="amber" className="p-5 flex-1">
                      <h3 className="font-mono text-sm font-bold text-[#ffbb00] mb-4 pb-2 border-b border-dashed border-[#ffbb00]/10 flex justify-between">
                        <span>🔥 拓扑热点符号 // TOPOLOGY_HOTSPOTS</span>
                        <span className="text-xs text-[hsl(var(--text-muted))] font-normal">按连接度 (Degree) 排序</span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-xs">
                          <thead>
                            <tr className="text-[hsl(var(--text-muted))] border-b border-white/5">
                              <th className="pb-2">符号名称 (Symbol)</th>
                              <th className="pb-2">类型</th>
                              <th className="pb-2 text-right">入度 (In)</th>
                              <th className="pb-2 text-right">出度 (Out)</th>
                              <th className="pb-2 text-right">总连接度</th>
                            </tr>
                          </thead>
                          <tbody>
                            {archData?.hotspots?.map((node, i) => (
                              <tr 
                                key={i} 
                                onClick={() => viewSnippet(node)}
                                className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                              >
                                <td className="py-2.5 font-bold group-hover:text-[#ffbb00] transition-colors max-w-[200px] truncate" title={node.id}>
                                  {node.label || node.id}
                                </td>
                                <td className="py-2.5"><span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] opacity-75">{node.node_type || 'code'}</span></td>
                                <td className="py-2.5 text-right text-green">{node.in_degree || 0}</td>
                                <td className="py-2.5 text-right text-[#00f2fe]">{node.out_degree || 0}</td>
                                <td className="py-2.5 text-right font-bold text-[#ffbb00]">{node.degree || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </GlassCard>
                  </div>

                  {/* Right Column: Files Distribution & Entrance Candidates */}
                  <div className="flex flex-col gap-6">
                    
                    {/* Language distribution */}
                    <GlassCard glowColor="purple" className="p-5">
                      <h3 className="font-mono text-sm font-bold text-[#a855f7] mb-4 pb-2 border-b border-dashed border-[#a855f7]/10">
                        📊 代码语言构成 // LANGUAGE_DIAGNOSTICS
                      </h3>
                      <div className="flex flex-col gap-3 font-mono text-xs">
                        {archData?.languages && Object.entries(archData.languages).map(([lang, count], idx) => {
                          const total = Object.values(archData.languages).reduce((a, b) => a + b, 0);
                          const pct = ((count / total) * 100).toFixed(1);
                          return (
                            <div key={idx}>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="font-bold text-white">{lang.toUpperCase()}</span>
                                <span className="text-[hsl(var(--text-muted))]">{count} 文件 ({pct}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                <div className="h-full bg-gradient-to-r from-[#a855f7] to-[#00f2fe]" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>

                    {/* Entrance Nodes */}
                    <GlassCard glowColor="green" className="p-5 flex-1">
                      <h3 className="font-mono text-sm font-bold text-[#10b981] mb-4 pb-2 border-b border-dashed border-[#10b981]/10">
                        🏛️ 入口候选符号 // ENTRANCE_CANDIDATES
                      </h3>
                      <div className="overflow-y-auto max-h-[300px]">
                        <ul className="flex flex-col gap-2 font-mono text-xs">
                          {archData?.entrances?.map((node, i) => (
                            <li 
                              key={i}
                              onClick={() => viewSnippet(node)}
                              className="p-2 border border-white/5 bg-white/2 hover:border-[#10b981]/40 hover:bg-[#10b981]/5 rounded cursor-pointer transition-all flex justify-between items-center"
                            >
                              <div className="truncate max-w-[170px]">
                                <div className="font-bold text-white truncate" title={node.id}>{node.label || node.id}</div>
                                <div className="text-[9px] text-[hsl(var(--text-muted))] truncate" title={node.source_file}>📁 {node.source_file ? node.source_file.split('/').pop() : 'external'}</div>
                              </div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-green shrink-0 font-bold">
                                OUT {node.out_degree || 0}
                              </span>
                            </li>
                          ))}
                          {(!archData?.entrances || archData.entrances.length === 0) && (
                            <div className="text-center text-[hsl(var(--text-muted))] py-6">无入口候选符号（每个节点都有调用者）</div>
                          )}
                        </ul>
                      </div>
                    </GlassCard>
                  </div>
                </div>
              )}

              {/* TAB 2: STRUCTURED SEARCH */}
              {activeSubTab === 'search' && (
                <div className="flex flex-col gap-6">
                  {/* Search Form Panel */}
                  <GlassCard glowColor="cyan" className="p-5">
                    <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[hsl(var(--text-muted))]">符号名称正则 (Name Regex):</label>
                        <input
                          type="text"
                          value={searchFilters.nameRegex}
                          onChange={(e) => setSearchFilters({ ...searchFilters, nameRegex: e.target.value })}
                          placeholder="例如: .*extract.*"
                          className="sci-control-input w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '6px 10px' }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[hsl(var(--text-muted))]">文件路径正则 (Path Regex):</label>
                        <input
                          type="text"
                          value={searchFilters.sourceFileRegex}
                          onChange={(e) => setSearchFilters({ ...searchFilters, sourceFileRegex: e.target.value })}
                          placeholder="例如: .*bridge.*"
                          className="sci-control-input w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '6px 10px' }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[hsl(var(--text-muted))]">节点类型 (Node Type):</label>
                        <select
                          value={searchFilters.nodeType}
                          onChange={(e) => setSearchFilters({ ...searchFilters, nodeType: e.target.value })}
                          className="sci-control-select w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '4px 10px' }}
                        >
                          <option value="all">所有符号类型 (All Types)</option>
                          <option value="function">函数 (Function)</option>
                          <option value="method">方法 (Method)</option>
                          <option value="class">类 (Class)</option>
                          <option value="module">模块 (Module)</option>
                          <option value="variable">变量 (Variable)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[hsl(var(--text-muted))]">最小连接度 (Min Degree):</label>
                        <input
                          type="number"
                          value={searchFilters.minDegree}
                          onChange={(e) => setSearchFilters({ ...searchFilters, minDegree: e.target.value })}
                          placeholder="0"
                          className="sci-control-input w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '6px 10px' }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[hsl(var(--text-muted))]">最大连接度 (Max Degree):</label>
                        <input
                          type="number"
                          value={searchFilters.maxDegree}
                          onChange={(e) => setSearchFilters({ ...searchFilters, maxDegree: e.target.value })}
                          placeholder="不限"
                          className="sci-control-input w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '6px 10px' }}
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          className="sci-submit-btn bg-cyan w-full text-white font-bold cursor-pointer"
                          style={{ height: '32px', fontSize: '12px' }}
                        >
                          🔍 执行结构化搜索 // RUN_SEARCH
                        </button>
                      </div>
                    </form>
                  </GlassCard>

                  {/* Results Panel */}
                  {searchHasRun && (
                    <GlassCard glowColor="cyan" className="p-5">
                      <h3 className="font-mono text-sm font-bold text-[#00f2fe] mb-4 pb-2 border-b border-dashed border-[#00f2fe]/10">
                        📊 搜索结果汇总 // SEARCH_RESULTS ({searchResults.length} 条记录)
                      </h3>
                      {searchResults.length > 0 ? (
                        <div className="overflow-x-auto max-h-[450px]">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="text-[hsl(var(--text-muted))] border-b border-white/5">
                                <th className="pb-2">符号 (Symbol)</th>
                                <th className="pb-2">类型</th>
                                <th className="pb-2">源文件 (Source File)</th>
                                <th className="pb-2 text-right">入度 (In)</th>
                                <th className="pb-2 text-right">出度 (Out)</th>
                                <th className="pb-2 text-right">度数 (Degree)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {searchResults.map((row, i) => (
                                <tr
                                  key={i}
                                  onClick={() => viewSnippet(row)}
                                  className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                >
                                  <td className="py-2.5 font-bold group-hover:text-[#00f2fe] transition-colors max-w-[220px] truncate" title={row.id || row.label}>
                                    {row.label || row.id}
                                  </td>
                                  <td className="py-2.5">
                                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] opacity-75">
                                      {row.node_type || 'code'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-xs text-[hsl(var(--text-muted))] max-w-[250px] truncate" title={row.source_file}>
                                    {row.source_file ? row.source_file.split('/').pop() : 'external'}
                                  </td>
                                  <td className="py-2.5 text-right text-green">{row.in_degree || 0}</td>
                                  <td className="py-2.5 text-right text-cyan">{row.out_degree || 0}</td>
                                  <td className="py-2.5 text-right font-bold text-white">{row.degree || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center text-[hsl(var(--text-muted))] py-10 font-mono">
                          未找到匹配搜索条件的符号。
                        </div>
                      )}
                    </GlassCard>
                  )}
                </div>
              )}

              {/* TAB 3: CALL GRAPH TRACE */}
              {activeSubTab === 'trace' && (
                <div className="flex flex-col gap-6">
                  {/* Trace Form Panel */}
                  <GlassCard glowColor="amber" className="p-5">
                    <form onSubmit={handleTrace} className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono text-xs">
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-[hsl(var(--text-muted))]">起点符号/外部ID (Start Node Name/ID):</label>
                        <input
                          type="text"
                          value={traceInput}
                          onChange={(e) => setTraceInput(e.target.value)}
                          placeholder="输入符号名，例如: extract_to_memory"
                          required
                          className="sci-control-input w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '6px 10px' }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[hsl(var(--text-muted))]">追踪方向 (Direction):</label>
                        <select
                          value={traceDirection}
                          onChange={(e) => setTraceDirection(e.target.value)}
                          className="sci-control-select w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '4px 10px' }}
                        >
                          <option value="outbound">追踪它所调用 (Outbound / Callees)</option>
                          <option value="inbound">追踪谁在调用它 (Inbound / Callers)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[hsl(var(--text-muted))]">最大深度 (Max Depth):</label>
                        <select
                          value={traceDepth}
                          onChange={(e) => setTraceDepth(parseInt(e.target.value))}
                          className="sci-control-select w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '4px 10px' }}
                        >
                          <option value={1}>深度 1 层</option>
                          <option value={2}>深度 2 层</option>
                          <option value={3}>深度 3 层</option>
                          <option value={4}>深度 4 层</option>
                          <option value={5}>深度 5 层</option>
                        </select>
                      </div>
                      <div className="md:col-span-4 flex justify-end">
                        <button
                          type="submit"
                          disabled={traceLoading || !traceInput.trim()}
                          className="sci-submit-btn bg-cyan text-white font-bold cursor-pointer"
                          style={{ height: '32px', fontSize: '12px', padding: '0 24px' }}
                        >
                          {traceLoading ? '追踪分析中...' : '🔗 绘制拓扑依赖链路 // TRACE_DEPENDENCY'}
                        </button>
                      </div>
                    </form>
                  </GlassCard>

                  {/* Trace Tree Panel */}
                  {traceResults && (
                    <GlassCard glowColor="amber" className="p-5 overflow-x-auto min-h-[300px]">
                      <h3 className="font-mono text-sm font-bold text-[#ffbb00] mb-4 pb-2 border-b border-dashed border-[#ffbb00]/10 flex justify-between">
                        <span>🌲 调用链路拓扑结构树 // DEPENDENCY_TREE</span>
                        <span className="text-xs text-[hsl(var(--text-muted))] font-normal">点击节点可在右侧查看带行号源码</span>
                      </h3>
                      {(() => {
                        if (traceResults.error === 'ambiguous') {
                          return (
                            <div className="flex flex-col gap-4 font-mono text-xs">
                              <div className="text-amber font-bold flex items-center gap-2">
                                <span>⚠️ 匹配到多个符合条件的符号，请选择一个进行精准追踪：</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                {traceResults.candidates?.map((cand) => (
                                  <button
                                    key={cand.id}
                                    type="button"
                                    onClick={async () => {
                                      setTraceInput(cand.id);
                                      setTraceLoading(true);
                                      try {
                                        const data = await api.traceGraphPath(
                                          activeNamespace,
                                          cand.id,
                                          traceDirection,
                                          'calls',
                                          traceDepth
                                        );
                                        setTraceResults(data);
                                      } catch (err) {
                                        setError(err.message || '调用链追踪失败');
                                      } finally {
                                        setTraceLoading(false);
                                      }
                                    }}
                                    className="p-3 border border-[rgba(255,187,0,0.15)] bg-[rgba(255,187,0,0.02)] hover:border-amber hover:bg-[rgba(255,187,0,0.06)] rounded text-left transition-all duration-200 group"
                                  >
                                    <div className="font-bold text-[#ffbb00] group-hover:text-white transition-colors">{cand.label || cand.id}</div>
                                    <div className="text-[10px] text-[hsl(var(--text-muted))] mt-1 truncate" title={cand.source_file}>📁 {cand.source_file}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        if (traceResults.error === 'no_match') {
                          return (
                            <div className="text-center text-red/80 py-12 font-mono">
                              ❌ 未找到匹配 '{traceResults.start}' 的符号节点，请检查拼写或重新输入。
                            </div>
                          );
                        }
                        
                        const tree = buildTreeFromGraph(traceResults);
                        if (tree) {
                          return (
                            <div className="pb-6">
                              {renderTraceNode(tree)}
                            </div>
                          );
                        }
                        return (
                          <div className="text-center text-[hsl(var(--text-muted))] py-12 font-mono">
                            未追踪到任何调用依赖关系。
                          </div>
                        );
                      })()}
                    </GlassCard>
                  )}
                </div>
              )}

              {/* TAB 4: DEAD CODE SCANNER */}
              {activeSubTab === 'deadcode' && (
                <div className="flex flex-col gap-6">
                  <GlassCard glowColor="pink" className="p-5">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 pb-2 border-b border-dashed border-red/10 mb-4">
                      <div>
                        <h3 className="font-mono text-sm font-bold text-red">
                          💀 冗余符号诊断 // UNUSED_CODE_DIAGNOSTICS
                        </h3>
                        <p className="text-xs text-[hsl(var(--text-muted))] font-mono mt-1">
                          系统自动搜寻代码中零入度 (In-Degree = 0) 且有实体代码的函数或方法节点。
                        </p>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto font-mono text-xs">
                        <input
                          type="text"
                          value={deadCodeFilter}
                          onChange={(e) => setDeadCodeFilter(e.target.value)}
                          placeholder="过滤符号或文件名..."
                          className="sci-control-input"
                          style={{ height: '30px', fontSize: '11px', padding: '0 10px', minWidth: '200px' }}
                        />
                        <button
                          type="button"
                          onClick={fetchDeadCode}
                          className="sci-submit-btn bg-cyan"
                          style={{ height: '30px', fontSize: '11px', padding: '0 15px' }}
                        >
                          🔄 重新扫描
                        </button>
                      </div>
                    </div>

                    {/* Table list */}
                    {deadCodeList.length > 0 ? (
                      <div className="overflow-y-auto max-h-[500px]">
                        <table className="w-full text-left font-mono text-xs">
                          <thead>
                            <tr className="text-[hsl(var(--text-muted))] border-b border-white/5">
                              <th className="pb-2">冗余符号 (Unused Symbol)</th>
                              <th className="pb-2">类型</th>
                              <th className="pb-2">源文件绝对路径</th>
                              <th className="pb-2 text-right">定义位置</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deadCodeList
                              .filter(
                                (x) =>
                                  !deadCodeFilter ||
                                  (x.label || x.id || '').toLowerCase().includes(deadCodeFilter.toLowerCase()) ||
                                  (x.source_file || '').toLowerCase().includes(deadCodeFilter.toLowerCase())
                              )
                              .map((row, i) => (
                                <tr
                                  key={i}
                                  onClick={() => viewSnippet(row)}
                                  className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                >
                                  <td className="py-2.5 font-bold group-hover:text-red transition-colors max-w-[220px] truncate" title={row.id || row.label}>
                                    {row.label || row.id}
                                  </td>
                                  <td className="py-2.5">
                                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] opacity-75">
                                      {row.node_type || 'function'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-[hsl(var(--text-muted))] font-mono max-w-[350px] truncate" title={row.source_file}>
                                    {row.source_file}
                                  </td>
                                  <td className="py-2.5 text-right font-mono text-cyan">{row.source_location || 'L1'}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center text-[hsl(var(--text-muted))] py-12 font-mono">
                        未检测到任何入度为 0 的冗余函数代码。项目结构非常紧凑！
                      </div>
                    )}
                  </GlassCard>
                </div>
              )}

              {/* TAB 5: CHANGE IMPACT RISK */}
              {activeSubTab === 'changes' && (
                <div className="flex flex-col gap-6">
                  {/* Config changes form */}
                  <GlassCard glowColor="pink" className="p-5">
                    <form onSubmit={handleDetectChanges} className="flex flex-col md:flex-row items-end gap-4 font-mono text-xs">
                      <div className="flex flex-col gap-1.5 flex-1 w-full">
                        <label className="text-[hsl(var(--text-muted))]">Git 比较基准版本 (Git Base Revision):</label>
                        <input
                          type="text"
                          value={changesBase}
                          onChange={(e) => setChangesBase(e.target.value)}
                          placeholder="例如: HEAD, main, 或者 commit_hash"
                          className="sci-control-input w-full"
                          style={{ height: '32px', fontSize: '11px', padding: '6px 10px' }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={changesLoading}
                        className="sci-submit-btn bg-cyan text-white font-bold cursor-pointer w-full md:w-auto"
                        style={{ height: '32px', fontSize: '12px', padding: '0 24px' }}
                      >
                        {changesLoading ? '评估影响中...' : '⚡ 评估变更爆破半径 // RUN_IMPACT_DIFF'}
                      </button>
                    </form>
                  </GlassCard>

                  {/* Changes Impact Results Panel */}
                  {changesResults && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left: summary card */}
                      <div className="flex flex-col gap-6">
                        <GlassCard 
                          glowColor={
                            changesResults.risk_level === 'HIGH' 
                              ? 'pink' 
                              : changesResults.risk_level === 'MEDIUM' 
                                ? 'amber' 
                                : 'green'
                          } 
                          className="p-5 font-mono"
                        >
                          <h3 className="text-xs text-[hsl(var(--text-muted))] uppercase tracking-wider mb-2">
                            🌟 变更风险指数 // RISK_INDEX
                          </h3>
                          <div 
                            className="text-3xl font-bold tracking-widest mt-1 animate-pulse" 
                            style={{ 
                              color: changesResults.risk_level === 'HIGH' 
                                ? '#f43f5e' 
                                : changesResults.risk_level === 'MEDIUM' 
                                  ? '#ffbb00' 
                                  : '#10b981'
                            }}
                          >
                            {changesResults.risk_level}
                          </div>
                          
                          <div className="border-t border-white/5 mt-4 pt-4 flex flex-col gap-3 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[hsl(var(--text-muted))]">直接修改节点:</span>
                              <span className="text-white font-bold">{changesResults.modified_nodes_count || 0} 个</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[hsl(var(--text-muted))]">影响级联深度:</span>
                              <span className="text-white font-bold">2 层级</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[hsl(var(--text-muted))]">最大爆破半径:</span>
                              <span className="text-cyan font-bold">{changesResults.blast_radius_size || 0} 节点</span>
                            </div>
                          </div>
                        </GlassCard>
                      </div>

                      {/* Right: details of affected nodes */}
                      <div className="lg:col-span-2 flex flex-col gap-6">
                        <GlassCard glowColor="cyan" className="p-5 flex-1 min-h-[300px]">
                          <h3 className="font-mono text-sm font-bold text-[#00f2fe] mb-4 pb-2 border-b border-dashed border-[#00f2fe]/10">
                            🔍 爆破影响受波及符号列表 // BLAST_RADIUS_NODES
                          </h3>
                          {changesResults.blast_radius_nodes && changesResults.blast_radius_nodes.length > 0 ? (
                            <div className="overflow-y-auto max-h-[350px]">
                              <table className="w-full text-left font-mono text-xs">
                                <thead>
                                  <tr className="text-[hsl(var(--text-muted))] border-b border-white/5">
                                    <th className="pb-2">受波及符号</th>
                                    <th className="pb-2">类型</th>
                                    <th className="pb-2">源文件</th>
                                    <th className="pb-2 text-right">风险级别</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {changesResults.blast_radius_nodes.map((node, i) => (
                                    <tr
                                      key={i}
                                      onClick={() => viewSnippet(node)}
                                      className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                    >
                                      <td className="py-2.5 font-bold group-hover:text-[#00f2fe] transition-colors max-w-[200px] truncate" title={node.id}>
                                        {node.label || node.id}
                                      </td>
                                      <td className="py-2.5">
                                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] opacity-75">
                                          {node.node_type || 'code'}
                                        </span>
                                      </td>
                                      <td className="py-2.5 text-[hsl(var(--text-muted))] truncate max-w-[250px]" title={node.source_file}>
                                        {node.source_file ? node.source_file.split('/').pop() : 'external'}
                                      </td>
                                      <td className="py-2.5 text-right font-bold">
                                        <span className={node.impact_risk === 'HIGH' ? 'text-red' : node.impact_risk === 'MEDIUM' ? 'text-amber' : 'text-green'}>
                                          {node.impact_risk}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-center text-[hsl(var(--text-muted))] py-12 font-mono">
                              无受波及的级联符号。当前修改的影响范围已被控制！
                            </div>
                          )}
                        </GlassCard>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: TEAM GRAPH SYNC */}
              {activeSubTab === 'sync' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Export Artifact Card */}
                  <GlassCard glowColor="amber" className="p-5 font-mono text-xs flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-[#ffbb00] pb-2 border-b border-dashed border-[#ffbb00]/10">
                      📦 导包打包团队工件 // PACK_TEAM_ARTIF
                    </h3>
                    <p className="text-[hsl(var(--text-muted))]">
                      打包当前命名空间的完整图谱（含所有节点、调用边关系、已经向量化的 ChromaDB 向量）。
                      队友下载该 `.json.gz` 文件并提交入 Git 仓库，别人可直接一键导入免重新跑向量化。
                    </p>

                    {artifactManifest ? (
                      <div className="p-3 bg-black/40 border border-white/5 rounded flex flex-col gap-2">
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--text-muted))]">生成工件校验码 (MD5):</span>
                          <span className="text-white font-bold">{artifactManifest.checksum?.substring(0, 16)}...</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--text-muted))]">节点打包数:</span>
                          <span className="text-cyan font-bold">{artifactManifest.node_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--text-muted))]">依赖边打包数:</span>
                          <span className="text-green font-bold">{artifactManifest.edge_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--text-muted))]">缓存写入位置:</span>
                          <span className="text-white truncate" title={artifactManifest.path} style={{ maxWidth: '200px' }}>
                            {artifactManifest.path?.split('/').pop() || 'artifacts/graph.json.gz'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={fetchArtifactManifest}
                        className="sci-submit-btn bg-cyan"
                        style={{ height: '30px' }}
                      >
                        ⚡ 衍生计算工件清单
                      </button>
                    )}

                    <div className="mt-auto">
                      <a
                        href={api.getArtifactDownloadUrl(activeNamespace)}
                        target="_blank"
                        rel="noreferrer"
                        className="sci-submit-btn bg-cyan w-full text-white font-bold text-center block"
                        style={{ height: '35px', lineHeight: '35px', textDecoration: 'none' }}
                      >
                        💾 立即下载工件存档 (.json.gz)
                      </a>
                    </div>
                  </GlassCard>

                  {/* Import/Restore Artifact Card */}
                  <GlassCard glowColor="cyan" className="p-5 font-mono text-xs flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-[#00f2fe] pb-2 border-b border-dashed border-[#00f2fe]/10">
                      📤 上传工件覆盖同步 // RESTORE_TEAM_ARTIF
                    </h3>
                    <p className="text-[hsl(var(--text-muted))]">
                      选择他人导出的 `[namespace].json.gz` 团队包，覆盖载入当前命名空间。
                      <span className="text-red font-bold"> 注意：该操作会彻底清空当前图谱数据，被工件包替代。</span>
                    </p>

                    <div 
                      className="border-2 border-dashed border-white/10 hover:border-[#00f2fe]/40 transition-colors rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer relative bg-black/20"
                      onClick={() => document.getElementById('artifact-file-input').click()}
                    >
                      <input
                        type="file"
                        id="artifact-file-input"
                        accept=".gz,.json"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={restoring}
                      />
                      <span className="text-2xl">📁</span>
                      <span className="text-center text-white font-bold">
                        {selectedFile ? selectedFile.name : '点击选择或者拖入工件文件 (.json.gz)'}
                      </span>
                      {selectedFile && (
                        <span className="text-[10px] text-[hsl(var(--text-muted))]">
                          大小: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      )}
                    </div>

                    {restoring && restoreProgress && (
                      <div className="p-3 bg-black/40 border border-white/5 rounded">
                        <div className="flex justify-between text-[10px] text-[#00f2fe] mb-1">
                          <span>[{restoreProgress.stage.toUpperCase()}] {restoreProgress.message}</span>
                          <span>{restoreProgress.percent}%</span>
                        </div>
                        <div className="w-full h-1 bg-black/80 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#00f2fe] to-[#ffbb00] transition-all duration-300" style={{ width: `${restoreProgress.percent}%` }} />
                        </div>
                        {restoreProgress.current !== undefined && (
                          <div className="text-right text-[8px] text-[hsl(var(--text-muted))] mt-1">
                            处理进度: {restoreProgress.current} / {restoreProgress.total}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-auto">
                      <button
                        type="button"
                        onClick={handleRestoreArtifact}
                        disabled={!selectedFile || restoring}
                        className="sci-submit-btn bg-cyan w-full text-white font-bold"
                        style={{ height: '35px' }}
                      >
                        {restoring ? '同步恢复中...' : '🚀 覆盖载入上传的工件备份'}
                      </button>
                    </div>
                  </GlassCard>
                </div>
              )}
            </>
          )}
        </div>

        {/* 4. Sliding Code Details/Snippet Drawer */}
        {selectedSymbol && (
          <div className="w-[380px] lg:w-[480px] bg-[rgba(3,2,1,0.95)] border-l border-[rgba(255,187,0,0.15)] flex flex-col font-mono text-xs overflow-hidden shrink-0 z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/40">
              <div className="truncate">
                <div className="text-xs text-[hsl(var(--text-muted))]">SYMBOL_DETAILS // 符号详情</div>
                <div className="font-bold text-[#ffbb00] text-sm truncate mt-0.5" title={selectedSymbol.label || selectedSymbol.id}>
                  {selectedSymbol.label || selectedSymbol.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedSymbol(null); setSnippetData(null); }}
                className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 rounded-full cursor-pointer transition-colors text-base"
              >
                ×
              </button>
            </div>

            {/* Drawer Body Scroll */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              
              {/* Properties */}
              <div className="flex flex-col gap-2 p-3 bg-white/2 border border-white/5 rounded">
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--text-muted))]">节点类型 (Type):</span>
                  <span className="text-white font-bold">{selectedSymbol.node_type || selectedSymbol.label_type || 'code_node'}</span>
                </div>
                {selectedSymbol.source_file && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[hsl(var(--text-muted))]">源文件绝对路径:</span>
                    <span className="text-white break-all bg-black/40 p-1.5 rounded text-[10px] select-all border border-white/5">
                      {selectedSymbol.source_file}
                    </span>
                  </div>
                )}
                {selectedSymbol.source_location && (
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--text-muted))]">位置区间 (Location):</span>
                    <span className="text-cyan font-bold">{selectedSymbol.source_location}</span>
                  </div>
                )}
                {(selectedSymbol.degree !== undefined) && (
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--text-muted))]">度数关系 (Degree):</span>
                    <span className="text-white font-bold">
                      IN {selectedSymbol.in_degree || 0} // OUT {selectedSymbol.out_degree || 0}
                    </span>
                  </div>
                )}
              </div>

              {/* Source code Snippet */}
              <div className="flex-1 flex flex-col min-h-[300px]">
                <div className="text-[hsl(var(--text-muted))] mb-2 flex justify-between items-center">
                  <span>📄 关联源码片段 (Code Snippet):</span>
                  {snippetLoading && <span className="text-cyan animate-pulse">载入源码中...</span>}
                </div>

                <div className="flex-1 bg-black/60 rounded border border-white/5 overflow-hidden flex flex-col relative">
                  {snippetData ? (
                    snippetData.error ? (
                      <div className="p-4 text-red/60 text-center font-mono text-xs">{snippetData.error}</div>
                    ) : (
                      <pre className="flex-1 p-3 overflow-auto text-[10px] text-white/80 leading-relaxed select-text" style={{ whiteSpace: 'pre', fontFamily: 'var(--font-mono)' }}>
                        <code>{snippetData.snippet || '未检索到代码段内容'}</code>
                      </pre>
                    )
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-[hsl(var(--text-dark))]">
                      {snippetLoading ? '正在通信解压取回代码段...' : '未选择关联符号或无法检索'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
