'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

/* ── Icons ── */
const ICONS = {
  dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  search:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  ingest:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  memory:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  sessions:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  decay:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"/></svg>,
  tutorial:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
};

const NAV_ITEMS = [
  { key: 'dashboard', label: '仪表盘', icon: ICONS.dashboard },
  { key: 'search',    label: '搜索',   icon: ICONS.search },
  { key: 'ingest',    label: '注入',   icon: ICONS.ingest },
  { key: 'memory',    label: '记忆',   icon: ICONS.memory },
  { key: 'sessions',  label: '会话',   icon: ICONS.sessions },
  { key: 'decay',     label: '衰减',   icon: ICONS.decay },
  { key: 'tutorial',  label: '教程',   icon: ICONS.tutorial },
];

export default function SimplifiedLayout() {
  const {
    activeNamespace, setActiveNamespace, namespaces,
    stats, isOnline,
    activeTab, setActiveTab,
    isSimplified, setIsSimplified,
  } = useApp();

  return (
    <div className="sd-root">
      <aside className="sd-sidebar">
        <div className="sd-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span className="sd-logo-text">Agent Memory</span>
        </div>
        <nav className="sd-nav">
          {NAV_ITEMS.map(item => (
            <button key={item.key} onClick={() => setActiveTab(item.key)}
              className={`sd-nav-item ${activeTab === item.key ? 'active' : ''}`}>
              <span className="sd-nav-icon">{item.icon}</span>
              <span className="sd-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sd-sidebar-footer">
          <div className="sd-status">
            <span className={`sd-dot ${isOnline ? 'online' : 'offline'}`} />
            <span>{isOnline ? '已连接' : '未连接'}</span>
          </div>
          <div className="sd-chunks">{stats.total_chunks || 0} 条记忆</div>
        </div>
      </aside>

      <div className="sd-main">
        <header className="sd-header">
          <h1 className="sd-title">{NAV_ITEMS.find(i => i.key === activeTab)?.label || ''}</h1>
          <div className="sd-header-actions">
            <select value={activeNamespace} onChange={e => setActiveNamespace(e.target.value)} className="sd-select">
              <option value="all">全部命名空间</option>
              {namespaces.map(ns => (<option key={ns} value={ns}>{ns}</option>))}
            </select>
            <button onClick={() => setIsSimplified(!isSimplified)} className="sd-toggle-mode">
              {isSimplified ? '✨ 完整模式' : '🎯 精简模式'}
            </button>
          </div>
        </header>
        <div className="sd-content">
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'search' && <SearchTab />}
          {activeTab === 'ingest' && <IngestTab />}
          {activeTab === 'memory' && <MemoryTab />}
          {activeTab === 'sessions' && <SessionsTab />}
          {activeTab === 'decay' && <DecayTab />}
          {activeTab === 'tutorial' && <TutorialTab />}
        </div>
      </div>

      <style jsx>{`
        .sd-root { display:flex; height:100vh; background:#1a1b1e; color:#e8e8ed; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
        .sd-sidebar { width:220px; min-width:220px; background:#151618; border-right:1px solid #2c2d32; display:flex; flex-direction:column; }
        .sd-logo { display:flex; align-items:center; gap:10px; padding:20px; border-bottom:1px solid #2c2d32; color:#6b9bff; }
        .sd-logo-text { font-size:16px; font-weight:700; color:#e8e8ed; }
        .sd-nav { flex:1; padding:8px 0; display:flex; flex-direction:column; gap:2px; }
        .sd-nav-item { display:flex; align-items:center; gap:12px; padding:10px 20px; border:none; background:transparent; color:#a0a0b0; font-size:14px; cursor:pointer; width:100%; border-left:3px solid transparent; text-align:left; }
        .sd-nav-item:hover { background:rgba(255,255,255,0.04); color:#e8e8ed; }
        .sd-nav-item.active { background:rgba(107,155,255,0.1); color:#6b9bff; border-left-color:#6b9bff; }
        .sd-nav-icon { display:flex; align-items:center; width:20px; justify-content:center; }
        .sd-sidebar-footer { padding:16px 20px; border-top:1px solid #2c2d32; font-size:12px; color:#a0a0b0; }
        .sd-status { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
        .sd-dot { width:8px; height:8px; border-radius:50%; }
        .sd-dot.online { background:#66bb6a; }
        .sd-dot.offline { background:#ef5350; }
        .sd-chunks { color:#6b9bff; font-weight:600; }
        .sd-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .sd-header { height:56px; min-height:56px; display:flex; align-items:center; justify-content:space-between; padding:0 24px; background:#151618; border-bottom:1px solid #2c2d32; }
        .sd-title { font-size:18px; font-weight:600; margin:0; }
        .sd-header-actions { display:flex; align-items:center; gap:12px; }
        .sd-select { font-size:13px; padding:6px 12px; background:#25262b; border:1px solid #383940; color:#e8e8ed; border-radius:6px; outline:none; cursor:pointer; }
        .sd-select:focus { border-color:#6b9bff; }
        .sd-toggle-mode { font-size:13px; padding:6px 14px; background:#25262b; border:1px solid #383940; color:#a0a0b0; border-radius:6px; cursor:pointer; }
        .sd-toggle-mode:hover { border-color:#6b9bff; color:#e8e8ed; }
        .sd-content { flex:1; padding:24px; overflow-y:auto; display:flex; flex-wrap:wrap; gap:20px; align-content:flex-start; }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Dashboard Tab
   ════════════════════════════════════════════════════════════ */
function DashboardTab() {
  const { stats, isOnline, namespaces } = useApp();
  return (<>
    {/* ════ 快速上手引导 ════ */}
    <div className="sd-card" style={{flex:'1 1 100%'}}>
      <div className="sd-card-title">👋 欢迎使用 Agent Memory</div>
      <div className="sd-card-body">
        <p style={{lineHeight:1.8,color:'#d0d0d8',marginBottom:16}}>
          这是 AI 的<strong style={{color:'#e8e8ed'}}>外置记忆系统</strong>。把笔记、文档、代码知识存进来，
          需要时系统自动找出最相关内容交给 AI。<strong style={{color:'#6b9bff'}}>跟着三步走：</strong>
        </p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <div style={{flex:'1 1 180px',minWidth:160,background:'rgba(107,155,255,0.08)',border:'1px solid rgba(107,155,255,0.2)',borderRadius:8,padding:16}}>
            <div style={{fontSize:20,fontWeight:700,color:'#6b9bff',marginBottom:2}}>1. 写入</div>
            <div style={{fontSize:12,color:'#a0a0b0',lineHeight:1.6}}>切换到左侧<strong style={{color:'#d0d0d8'}}>「注入」</strong> → 贴入你想保存的内容 → 提交</div>
          </div>
          <div style={{flex:'1 1 180px',minWidth:160,background:'rgba(107,155,255,0.08)',border:'1px solid rgba(107,155,255,0.2)',borderRadius:8,padding:16}}>
            <div style={{fontSize:20,fontWeight:700,color:'#6b9bff',marginBottom:2}}>2. 搜索</div>
            <div style={{fontSize:12,color:'#a0a0b0',lineHeight:1.6}}>切换到左侧<strong style={{color:'#d0d0d8'}}>「搜索」</strong> → 输入关键词 → 找到刚才存的记忆</div>
          </div>
          <div style={{flex:'1 1 180px',minWidth:160,background:'rgba(107,155,255,0.08)',border:'1px solid rgba(107,155,255,0.2)',borderRadius:8,padding:16}}>
            <div style={{fontSize:20,fontWeight:700,color:'#6b9bff',marginBottom:2}}>3. 关联</div>
            <div style={{fontSize:12,color:'#a0a0b0',lineHeight:1.6}}>切换到左侧<strong style={{color:'#d0d0d8'}}>「会话」</strong> → 把相关记忆关联到一次对话中</div>
          </div>
        </div>
        <div className="sd-stat-row" style={{marginTop:12,borderBottom:'none',fontSize:12,color:'#a0a0b0'}}>
          💡 还不熟悉？点击左侧<strong style={{color:'#d0d0d8'}}>「教程」</strong>查看完整使用手册
        </div>
      </div>
    </div>
    <div className="sd-card" style={{flex:'1 1 300px',minWidth:280}}>
      <div className="sd-card-title">系统状态</div>
      <div className="sd-card-body">
        <div className="sd-stat-row"><span>连接状态</span><span className={isOnline?'sd-tag-green':'sd-tag-red'}>{isOnline?'已连接':'未连接'}</span></div>
        <div className="sd-stat-row"><span>API 地址</span><span className="sd-mono">127.0.0.1:8900</span></div>
        <div className="sd-stat-row"><span>存储引擎</span><span>ChromaDB + SQLite</span></div>
      </div>
    </div>
    <div className="sd-card" style={{flex:'1 1 300px',minWidth:280}}>
      <div className="sd-card-title">记忆统计</div>
      <div className="sd-card-body">
        <div className="sd-big-num">{stats.total_chunks||0}</div>
        <div className="sd-big-label">总记忆块</div>
        <div className="sd-stat-row" style={{marginTop:16}}><span>命名空间</span><span>{(namespaces||[]).length} 个</span></div>
      </div>
    </div>
    <div className="sd-card" style={{flex:'1 1 300px',minWidth:280}}>
      <div className="sd-card-title">命名空间</div>
      <div className="sd-card-body">
        {namespaces.length===0?<div className="sd-empty">暂无命名空间</div>
        : namespaces.map(ns=><div key={ns} className="sd-ns-item">{ns}</div>)}
      </div>
    </div>
    <style jsx>{CARD_CSS}</style>
  </>);
}

/* ════════════════════════════════════════════════════════════
   Search Tab — hybrid search + context packer
   ════════════════════════════════════════════════════════════ */
function SearchTab() {
  const { activeNamespace } = useApp();
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [packQuery, setPackQuery] = useState('');
  const [maxTokens, setMaxTokens] = useState(2000);
  const [packed, setPacked] = useState('');
  const [packLoading, setPackLoading] = useState(false);
  // Source search
  const [srcQuery, setSrcQuery] = useState('');
  const [srcResults, setSrcResults] = useState([]);
  const [srcLoading, setSrcLoading] = useState(false);
  const [srcError, setSrcError] = useState(null);
  const [srcMaxRes, setSrcMaxRes] = useState(8);
  // Compress
  const [cmprText, setCmprText] = useState('');
  const [cmprResult, setCmprResult] = useState(null);
  const [cmprLoading, setCmprLoading] = useState(false);
  const [retrKey, setRetrKey] = useState('');
  const [retrResult, setRetrResult] = useState(null);

  useEffect(() => { if (query.trim()) handleSearch(); }, [activeNamespace]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault(); if (!query.trim()) return;
    setLoading(true); setError(null);
    try { const res = await api.search(activeNamespace, query, topK); setResults(res.results||[]); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handlePack = async (e) => {
    if (e) e.preventDefault(); if (!packQuery.trim()) return;
    setPackLoading(true);
    try { const res = await api.pack(activeNamespace, packQuery, maxTokens); setPacked(res.packed_context||''); }
    catch (err) { setPacked('错误: '+err.message); }
    finally { setPackLoading(false); }
  };

  const handleSrcSearch = async (e) => {
    if (e) e.preventDefault(); if (!srcQuery.trim()) return;
    setSrcLoading(true); setSrcError(null);
    try { const res = await api.preciseSourceSearch(activeNamespace, srcQuery, srcMaxRes, 4); setSrcResults(res.results||[]); }
    catch (err) { setSrcError(err.message); }
    finally { setSrcLoading(false); }
  };

  const handleCompress = async () => {
    if (!cmprText.trim()) return; setCmprLoading(true);
    try { const res = await api.compress(cmprText, 'auto'); setCmprResult(res); }
    catch (err) { setCmprResult({error:err.message}); }
    finally { setCmprLoading(false); }
  };

  const handleRetrieve = async () => {
    if (!retrKey.trim()) return;
    try { const res = await api.retrieveCompressed(retrKey); setRetrResult(JSON.stringify(res,null,2)); }
    catch (err) { setRetrResult('错误: '+err.message); }
  };

  return (<>
    {/* Col 1: Hybrid search + source search */}
    <div style={{flex:'1 1 48%',minWidth:400,display:'flex',flexDirection:'column',gap:20}}>
      <div className="sd-card">
        <div className="sd-card-title">混合搜索</div>
        <div className="sd-card-body">
          <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 输入关键词，系统用<strong style={{color:'#aaa'}}>语义理解 + 关键词匹配</strong>两种方式同时搜索。右侧百分比 = 匹配度分数。</div>
          <form onSubmit={handleSearch} style={{display:'flex',gap:8,marginBottom:12}}>
            <input className="sd-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入搜索关键词..." style={{flex:1}} />
            <select className="sd-input" style={{width:70}} value={topK} onChange={e=>setTopK(Number(e.target.value))}>
              {[3,5,10,20].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <button className="sd-btn" type="submit" disabled={loading}>{loading?'...':'搜索'}</button>
          </form>
          {error && <div className="sd-error">{error}</div>}
          {results.map((r,i)=>(<div key={r.id||i} className="sd-result-item"><div style={{fontSize:20,fontWeight:700,minWidth:48,textAlign:'center',color:r.score>0.5?'#66bb6a':r.score>0.3?'#6b9bff':'#a0a0b0'}}>{(r.score*100).toFixed(0)}%</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:'#a0a0b0',marginBottom:4}}>{r.source||'unknown'} · {new Date(r.timestamp*1000).toLocaleString()}</div><div style={{fontSize:13,lineHeight:1.5,color:'#d0d0d8',wordBreak:'break-all'}}>{(r.content||'').substring(0,300)}</div></div></div>))}
          {results.length===0&&!loading&&query&&<div className="sd-empty">无结果</div>}
        </div>
      </div>

      <div className="sd-card">
        <div className="sd-card-title">源码精确搜索</div>
        <div className="sd-card-body">
          <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 在已导入知识图谱的<strong style={{color:'#aaa'}}>源码文件</strong>中搜精确关键字（函数名、API 路径、变量名等）。需先通过「星系图谱」导入代码。</div>
          <form onSubmit={handleSrcSearch} style={{display:'flex',gap:8,marginBottom:12}}>
            <input className="sd-input" value={srcQuery} onChange={e=>setSrcQuery(e.target.value)} placeholder="搜索源码中的精确词..." style={{flex:1}} />
            <select className="sd-input" style={{width:70}} value={srcMaxRes} onChange={e=>setSrcMaxRes(Number(e.target.value))}>
              {[4,8,16,32].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <button className="sd-btn" type="submit" disabled={srcLoading}>{srcLoading?'...':'搜索'}</button>
          </form>
          {srcError && <div className="sd-error">{srcError}</div>}
          {srcResults.map((r,i)=>(<div key={i} className="sd-result-item"><div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:'#6b9bff',marginBottom:2}}>{r.file||r.source_file||''}:{r.line||r.line_number||''}</div><pre style={{fontSize:12,color:'#d0d0d8',margin:0,whiteSpace:'pre-wrap'}}>{(r.content||'').substring(0,400)}</pre></div></div>))}
        </div>
      </div>
    </div>

    {/* Col 2: Packer + compression */}
    <div style={{flex:'1 1 48%',minWidth:400,display:'flex',flexDirection:'column',gap:20}}>
      <div className="sd-card">
        <div className="sd-card-title">上下文打包</div>
        <div className="sd-card-body">
          <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 把搜索到的相关记忆<strong style={{color:'#aaa'}}>打包成 AI 可直接使用的上下文</strong>。右侧数字 = token 预算上限（越大包含内容越多）。</div>
          <form onSubmit={handlePack} style={{display:'flex',gap:8,marginBottom:12}}>
            <input className="sd-input" value={packQuery} onChange={e=>setPackQuery(e.target.value)} placeholder="输入主题..." style={{flex:1}} />
            <input className="sd-input" style={{width:80}} type="number" value={maxTokens} onChange={e=>setMaxTokens(Number(e.target.value))} />
            <button className="sd-btn" type="submit" disabled={packLoading}>{packLoading?'...':'打包'}</button>
          </form>
          {packed && <pre style={{fontSize:12,background:'#151618',border:'1px solid #2c2d32',borderRadius:6,padding:16,maxHeight:300,overflow:'auto',whiteSpace:'pre-wrap',color:'#c0c0c8'}}>{packed}</pre>}
        </div>
      </div>

      <div className="sd-card">
        <div className="sd-card-title">压缩工具</div>
        <div className="sd-card-body">
          <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 压缩长文本以<strong style={{color:'#aaa'}}>节省 token</strong>。系统返回一个 retrieve key，凭它可以随时无损还原原文（可逆压缩）。</div>
          <textarea className="sd-input" style={{width:'100%',minHeight:80,marginBottom:8}} value={cmprText} onChange={e=>setCmprText(e.target.value)} placeholder="输入要压缩的文本..." />
          <button className="sd-btn" onClick={handleCompress} disabled={cmprLoading} style={{marginBottom:8}}>{cmprLoading?'压缩中...':'压缩'}</button>
          {cmprResult && <pre className="sd-packed">{JSON.stringify(cmprResult,null,2)}</pre>}
          <div style={{marginTop:8,display:'flex',gap:8}}>
            <input className="sd-input" style={{flex:1}} value={retrKey} onChange={e=>setRetrKey(e.target.value)} placeholder="输入压缩 key 取回原文..." />
            <button className="sd-btn" onClick={handleRetrieve}>取回</button>
          </div>
          {retrResult && <pre className="sd-packed" style={{marginTop:8}}>{retrResult}</pre>}
        </div>
      </div>
    </div>
    <style jsx>{CARD_CSS}</style>
    <style jsx>{COMMON_INPUT_CSS}</style>
    <style jsx>{`
      .sd-packed { font-size:12px; background:#151618; border:1px solid #2c2d32; border-radius:6px; padding:12px; max-height:200px; overflow:auto; white-space:pre-wrap; color:#c0c0c8; }
    `}</style>
  </>);
}

/* ════════════════════════════════════════════════════════════
   Ingest Tab — insert memory + freeze snapshot
   ════════════════════════════════════════════════════════════ */
function IngestTab() {
  const { activeNamespace, namespaces, setLastEvent, refreshData } = useApp();
  const [content, setContent] = useState('');
  const [source, setSource] = useState('manual');
  const [dedup, setDedup] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [ns, setNs] = useState(activeNamespace !== 'all' ? activeNamespace : '');
  const [isCustomNs, setIsCustomNs] = useState(false);

  // Snapshot
  const [snapSummary, setSnapSummary] = useState('');
  const [snapNs, setSnapNs] = useState(activeNamespace !== 'all' ? activeNamespace : '');
  const [snapLoading, setSnapLoading] = useState(false);

  useEffect(() => {
    if (activeNamespace !== 'all' && !isCustomNs) setNs(activeNamespace);
  }, [activeNamespace]);

  const handleInsert = async (e) => {
    e.preventDefault();
    const targetNs = isCustomNs ? ns : (ns || activeNamespace === 'all' ? activeNamespace : '');
    if (!targetNs || !content.trim()) return;
    setLoading(true); setResult(null);
    try {
      const res = await api.insert(targetNs, content, source, dedup);
      setResult(res);
      setContent('');
      refreshData();
    } catch (err) { setResult({error: err.message}); }
    finally { setLoading(false); }
  };

  const handleSnapshot = async (e) => {
    e.preventDefault();
    const targetNs = snapNs || (activeNamespace !== 'all' ? activeNamespace : '');
    if (!targetNs || !snapSummary.trim()) return;
    setSnapLoading(true); setResult(null);
    try {
      const res = await api.freezeSnapshot(targetNs, snapSummary);
      setResult(res);
      setSnapSummary('');
      refreshData();
    } catch (err) { setResult({error: err.message}); }
    finally { setSnapLoading(false); }
  };

  return (<>
    <div className="sd-card" style={{flex:'1 1 45%',minWidth:380}}>
      <div className="sd-card-title">插入记忆</div>
      <div className="sd-card-body">
        <div style={{fontSize:12,color:'#888',marginBottom:16,lineHeight:1.6}}>💡 把你想让 AI 记住的内容保存到记忆库。填写下方信息后点击提交：</div>
        <form onSubmit={handleInsert}>
          <div style={{marginBottom:12}}>
            <label style={LABEL_STYLE}>命名空间</label>
            {!isCustomNs ? (
              <select className="sd-input" style={{width:'100%'}} value={ns}
                onChange={(e)=>{if(e.target.value==='__new__'){setIsCustomNs(true);setNs('')}else setNs(e.target.value)}}>
                <option value="">使用当前</option>
                {namespaces.filter(n=>n!=='all').map(n=><option key={n} value={n}>{n}</option>)}
                <option value="__new__">[+] 新建</option>
              </select>
            ) : (
              <div style={{display:'flex',gap:8}}>
                <input className="sd-input" style={{flex:1}} value={ns} onChange={e=>setNs(e.target.value)} placeholder="输入命名空间..." />
                <button type="button" className="sd-btn-sm" onClick={()=>setIsCustomNs(false)}>返回</button>
              </div>
            )}
          </div>
          <div style={{marginBottom:12}}>
            <label style={LABEL_STYLE}>来源 (Source) <span style={{fontWeight:400,fontSize:11,color:'#888'}}>— 这条信息来自哪里？如 conversation / file / code</span></label>
            <input className="sd-input" style={{width:'100%'}} value={source} onChange={e=>setSource(e.target.value)} />
          </div>
          <div style={{marginBottom:12}}>
            <label style={LABEL_STYLE}>内容 (Content) <span style={{fontWeight:400,fontSize:11,color:'#888'}}>— 要记住的信息，越详细越好</span></label>
            <textarea className="sd-input" style={{width:'100%',minHeight:100}} value={content} onChange={e=>setContent(e.target.value)} placeholder="例如：Jikan API 的 /v4/anime 端点返回动画基本信息，包含 title、synopsis、score 等字段..." />
          </div>
          <div style={{marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <label style={LABEL_STYLE}>去重阈值 <span style={{fontWeight:400,fontSize:11,color:'#888'}}>— 0=不判断重复，0.7=内容相似70%则合并更新</span></label>
            <input className="sd-input" style={{width:80}} type="number" min="0" max="1" step="0.1" value={dedup} onChange={e=>setDedup(Number(e.target.value))} />
          </div>
          <button className="sd-btn" style={{width:'100%'}} type="submit" disabled={loading}>{loading?'提交中...':'提交'}</button>
        </form>
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 45%',minWidth:380}}>
      <div className="sd-card-title">冻结快照</div>
      <div className="sd-card-body">
        <div style={{fontSize:12,color:'#888',marginBottom:16,lineHeight:1.6}}>💡 保存一条<strong style={{color:'#aaa'}}>高优先级</strong>的快照记忆（如当前架构决策、Bug 状态），它在搜索结果中会排在最前面，不会被自动遗忘。</div>
        <form onSubmit={handleSnapshot}>
          <div style={{marginBottom:12}}>
            <label style={LABEL_STYLE}>命名空间</label>
            <input className="sd-input" style={{width:'100%'}} value={snapNs} onChange={e=>setSnapNs(e.target.value)}
              placeholder={activeNamespace!=='all'?activeNamespace:'输入命名空间'} />
          </div>
          <div style={{marginBottom:12}}>
            <label style={LABEL_STYLE}>快照摘要</label>
            <textarea className="sd-input" style={{width:'100%',minHeight:100}} value={snapSummary} onChange={e=>setSnapSummary(e.target.value)}
              placeholder="描述当前状态，如：正在修复某某 bug，当前架构..." />
          </div>
          <button className="sd-btn" style={{width:'100%'}} type="submit" disabled={snapLoading}>{snapLoading?'创建中...':'创建快照'}</button>
        </form>
      </div>
    </div>

    {result && <div className="sd-card" style={{flex:'1 1 100%'}}>
      <div className="sd-card-title">操作结果</div>
      <div className="sd-card-body">
        <pre style={RESULT_PRE_STYLE}>{result.error||JSON.stringify(result,null,2)}</pre>
      </div>
    </div>}

    <style jsx>{CARD_CSS}</style>
    <style jsx>{COMMON_INPUT_CSS}</style>
  </>);
}

/* ════════════════════════════════════════════════════════════
   Memory Tab — short-term + working memory
   ════════════════════════════════════════════════════════════ */
function MemoryTab() {
  const { activeNamespace, setLastEvent } = useApp();
  const [stm, setStm] = useState([]);
  const [wm, setWm] = useState({});
  const [loading, setLoading] = useState(false);

  // Working memory form
  const [wmKey, setWmKey] = useState('');
  const [wmValue, setWmValue] = useState('');
  const [wmSubmitting, setWmSubmitting] = useState(false);

  // Consolidate
  const [consolidating, setConsolidating] = useState(false);

  // Dialog injection
  const [addDialogRole, setAddDialogRole] = useState('user');
  const [addDialogContent, setAddDialogContent] = useState('');
  const [addDialogLoading, setAddDialogLoading] = useState(false);

  const fetchMemory = async () => {
    setLoading(true);
    try {
      const [stmRes, wmRes] = await Promise.all([
        api.getShortTermMemory(activeNamespace),
        api.listWorkingMemory(activeNamespace),
      ]);
      setStm(stmRes.history||stmRes||[]);
      setWm(wmRes.state||wmRes||{});
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMemory(); }, [activeNamespace]);

  const handleWriteWm = async (e) => {
    e.preventDefault();
    if (!wmKey.trim()||!wmValue.trim()) return;
    setWmSubmitting(true);
    try {
      await api.writeWorkingMemory(activeNamespace, wmKey, wmValue);
      setWmKey(''); setWmValue('');
      fetchMemory();
    } catch (err) { alert('写入失败: '+err.message); }
    finally { setWmSubmitting(false); }
  };

  const handleClearStm = async () => {
    try { await api.deleteShortTermMemory(activeNamespace); fetchMemory(); }
    catch (err) { alert('清除失败: '+err.message); }
  };

  const handleConsolidate = async () => {
    setConsolidating(true);
    try {
      const res = await api.consolidateMemory(activeNamespace);
      setLastEvent({type:'consolidate',message:'短期记忆已固化为长期记忆'});
      fetchMemory();
    } catch (err) { alert('固化失败: '+err.message); }
    finally { setConsolidating(false); }
  };

  const handleAddDialog = async (e) => {
    e.preventDefault();
    if (!addDialogContent.trim() || activeNamespace === 'all') return;
    setAddDialogLoading(true);
    try {
      await api.addShortTermMemory(activeNamespace, addDialogRole, addDialogContent);
      setAddDialogContent('');
      fetchMemory();
      setLastEvent({ type: 'insert', message: `短期对话已注入（角色: ${addDialogRole}）` });
    } catch (err) { alert('注入失败: ' + err.message); }
    finally { setAddDialogLoading(false); }
  };

  return (<>
    <div className="sd-card" style={{flex:'1 1 45%',minWidth:380}}>
      <div className="sd-card-title">短期记忆 (滑动窗口)</div>
      <div className="sd-card-body">
        <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 最近的对话记录（默认保留最近 10 条）。点击「固化」可以把短期记忆<strong style={{color:'#aaa'}}>总结后存为长期记忆</strong>。</div>
        {/* 对话注入表单 */}
        <form onSubmit={handleAddDialog} style={{display:'flex',gap:8,marginBottom:16,padding:'10px 12px',background:'rgba(255,255,255,0.02)',border:'1px dashed #383940',borderRadius:6}}>
          <select className="sd-input" style={{width:100}} value={addDialogRole} onChange={e=>setAddDialogRole(e.target.value)}>
            <option value="user">👤 user</option>
            <option value="assistant">🤖 assistant</option>
          </select>
          <input className="sd-input" style={{flex:1}} value={addDialogContent} onChange={e=>setAddDialogContent(e.target.value)} placeholder="输入模拟对话内容，注入到短期记忆..." />
          <button className="sd-btn" type="submit" disabled={addDialogLoading}>{addDialogLoading?'注入中...':'注入对话'}</button>
        </form>
        <div style={{marginBottom:12,display:'flex',gap:8}}>
          <button className="sd-btn" onClick={fetchMemory} disabled={loading}>刷新</button>
          <button className="sd-btn" style={{background:'#383940'}} onClick={handleClearStm}>清空</button>
          <button className="sd-btn" style={{background:'#383940'}} onClick={handleConsolidate} disabled={consolidating}>
            {consolidating?'固化中...':'固化'}
          </button>
        </div>
        {loading?<div className="sd-empty">加载中...</div>
        : stm.length===0?<div className="sd-empty">暂无短期记忆</div>
        : stm.map((t,i)=>
          <div key={i} className="sd-memory-row">
            <span className="sd-role-tag" style={{background:t.role==='user'?'#25262b':t.role==='assistant'?'rgba(107,155,255,0.15)':'#25262b',color:t.role==='assistant'?'#6b9bff':'#a0a0b0'}}>
              {t.role||'unknown'}
            </span>
            <span className="sd-memory-content">{(t.content||'').substring(0,200)}</span>
          </div>
        )}
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 45%',minWidth:380}}>
      <div className="sd-card-title">工作记忆 (Scratchpad)</div>
      <div className="sd-card-body">
        <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 像便利贴一样的<strong style={{color:'#aaa'}}>键值存储</strong>。暂存当前任务状态、变量或临时笔记，写入后不随对话消失。</div>
        <form onSubmit={handleWriteWm} style={{marginBottom:16}}>
          <div style={{display:'flex',gap:8}}>
            <input className="sd-input" style={{flex:1}} placeholder="Key" value={wmKey} onChange={e=>setWmKey(e.target.value)} />
            <input className="sd-input" style={{flex:2}} placeholder="Value" value={wmValue} onChange={e=>setWmValue(e.target.value)} />
            <button className="sd-btn" type="submit" disabled={wmSubmitting}>写入</button>
          </div>
        </form>
        {Object.keys(wm).length===0
          ? <div className="sd-empty">暂无工作记忆</div>
          : Object.entries(wm).map(([k,v])=>
              <div key={k} className="sd-wm-row">
                <span className="sd-wm-key">{k}</span>
                <span className="sd-wm-val">{(v||'').substring(0,120)}</span>
              </div>
            )
        }
      </div>
    </div>

    <style jsx>{CARD_CSS}</style>
    <style jsx>{`
      ${COMMON_INPUT_CSS}
      .sd-memory-row { display:flex; gap:8px; padding:8px; border-bottom:1px solid #2c2d32; font-size:13px; }
      .sd-memory-row:last-child { border-bottom:none; }
      .sd-role-tag { padding:1px 8px; border-radius:4px; font-size:11px; white-space:nowrap; font-weight:600; }
      .sd-memory-content { color:#d0d0d8; line-height:1.5; }
      .sd-wm-row { display:flex; gap:12px; padding:8px; border-bottom:1px solid #2c2d32; font-size:13px; }
      .sd-wm-row:last-child { border-bottom:none; }
      .sd-wm-key { color:#6b9bff; font-weight:600; min-width:80px; font-family:'SF Mono','Fira Code',monospace; font-size:12px; }
      .sd-wm-val { color:#d0d0d8; }
    `}</style>
  </>);
}

/* ════════════════════════════════════════════════════════════
   Tutorial Tab — simplified inline content
   ════════════════════════════════════════════════════════════ */
function TutorialTab() {
  return (<>
    <div className="sd-card" style={{flex:'1 1 100%'}}>
      <div className="sd-card-title">系统简介</div>
      <div className="sd-card-body">
        <p style={{lineHeight:1.8,color:'#d0d0d8',marginBottom:16}}>
          给 AI 的<strong style={{color:'#e8e8ed'}}>外置记忆系统</strong>。把笔记、文档、代码结构存进来；需要时自动挑出最相关的内容，压缩后塞进 AI 上下文——让 AI 记得住、看得全，还省 token。
        </p>
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
          {[{step:'①',title:'写入',desc:'把要记的内容贴进来，加来源标签'},{step:'②',title:'检索',desc:'输入问题，返回最相关的记忆'},{step:'③',title:'会话',desc:'关联进会话，跨对话延续上下文'}].map((s,i)=>(
            <div key={i} style={{flex:'1 1 200px',minWidth:180,background:'rgba(255,255,255,0.03)',border:'1px solid #2c2d32',borderRadius:8,padding:14}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.step}</div>
              <div style={{fontSize:14,fontWeight:600,color:'#e8e8ed',marginBottom:4}}>{s.title}</div>
              <div style={{fontSize:12,color:'#a0a0b0'}}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 100%'}}>
      <div className="sd-card-title">核心概念</div>
      <div className="sd-card-body">
        {[{icon:'🗂️',title:'命名空间 (Namespace)',desc:'记忆的"抽屉"，互相隔离。在顶栏选择器切换。'},
          {icon:'🧠',title:'记忆 (Memory)',desc:'带来源标签的文本块，写入后被向量化，可按语义搜索。'},
          {icon:'💬',title:'会话 (Session)',desc:'把记忆关联到一次对话，跨会话延续上下文。'},
          {icon:'🗜️',title:'压缩 (Compress)',desc:'注入前压缩记忆内容省 token；带 key，可随时取回原文。'}].map((c,i)=>(
          <div key={i} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:'1px solid #2c2d32'}}>
            <span style={{fontSize:18}}>{c.icon}</span>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:'#e8e8ed',marginBottom:2}}>{c.title}</div>
              <div style={{fontSize:12,color:'#a0a0b0',lineHeight:1.6}}>{c.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 100%'}}>
      <div className="sd-card-title">MCP 接入</div>
      <div className="sd-card-body">
        <p style={{fontSize:13,color:'#a0a0b0',marginBottom:16,lineHeight:1.6}}>
          将 Agent Memory 注册到 AI 终端（Claude Code / Codex / Reasonix 等），AI 即可直接使用记忆工具。
        </p>
        <div style={{background:'#151618',border:'1px solid #2c2d32',borderRadius:6,padding:16,marginBottom:16}}>
          <div style={{fontSize:11,color:'#6b9bff',marginBottom:8}}># Docker 模式（推荐）</div>
          <pre style={{fontSize:12,color:'#c0c0c8',margin:0,whiteSpace:'pre-wrap'}}>{
`# 1. 启动服务
docker compose up -d --build

# 2. 一键注册到所有 CLI（含 Reasonix）
python install_skills.py

# 3. 或者手动注册 HTTP MCP 到 reasonix.toml:
# [[plugins]]
# name = "agent-memory"
# type = "http"
# url  = "http://localhost:8901/mcp"`}</pre>
        </div>
        <div style={{fontSize:12,color:'#a0a0b0',lineHeight:1.6}}>
          📍 REST API 文档: <a href="http://127.0.0.1:8900/docs" target="_blank" style={{color:'#6b9bff'}}>http://127.0.0.1:8900/docs</a><br/>
          📍 MCP 源码: <code style={{background:'#2c2d32',color:'#6b9bff',padding:'1px 6px',borderRadius:3}}>Agent-Memory-Server/server.py</code>
        </div>
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 100%'}}>
      <div className="sd-card-title">压缩示例</div>
      <div className="sd-card-body">
        <p style={{fontSize:13,color:'#a0a0b0',marginBottom:12,lineHeight:1.6}}>
          1500 token 的记录压缩到 480 token（省 68%），带 retrieve key 可随时取回原文，零信息损失。
        </p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={{background:'#151618',padding:12,borderRadius:6}}>
            <div style={{fontSize:11,color:'#a0a0b0',marginBottom:4}}>压缩前</div>
            <div style={{fontSize:20,fontWeight:700,color:'#e8e8ed'}}>1,500 <span style={{fontSize:12,color:'#a0a0b0'}}>token</span></div>
          </div>
          <div style={{background:'rgba(107,155,255,0.08)',padding:12,borderRadius:6}}>
            <div style={{fontSize:11,color:'#a0a0b0',marginBottom:4}}>压缩后</div>
            <div style={{fontSize:20,fontWeight:700,color:'#6b9bff'}}>480 <span style={{fontSize:12,color:'#6b9bff'}}>token</span></div>
          </div>
        </div>
      </div>
    </div>

    <style jsx>{CARD_CSS}</style>
  </>);
}

/* ════════════════════════════════════════════════════════════
   Sessions Tab — create, list, detail with context
   ════════════════════════════════════════════════════════════ */
function SessionsTab() {
  const { activeNamespace } = useApp();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newSessionId, setNewSessionId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Link/unlink memory
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionMemories, setSessionMemories] = useState([]);
  const [linkMemoryId, setLinkMemoryId] = useState('');

  const fetchSessions = async () => {
    setLoading(true);
    try { const res = await api.listSessions(activeNamespace); setSessions(res.sessions||[]); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); }, [activeNamespace]);

  const handleCreate = async () => {
    try { await api.createSession(activeNamespace, newSessionId||undefined); setNewSessionId(''); fetchSessions(); }
    catch (err) { alert('创建失败: '+err.message); }
  };

  const handleClose = async (sid) => {
    try {
      await fetch('/api/sessions/close', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session_id:sid}) });
      fetchSessions();
    } catch (err) { alert('关闭失败: '+err.message); }
  };

  const handleViewDetail = async (sid) => {
    setDetailLoading(true);
    // Clear any previous link memory state
    setLinkMemoryId('');
    try {
      const res = await api.getSessionContext(sid, 4000);
      setDetail(res);
      setSelectedSession(sid);
      // Also fetch linked memories
      const memRes = await api.getSessionMemories?.(sid) || { memories: [] };
      setSessionMemories(memRes.memories || []);
    }
    catch (err) { setDetail({error:err.message}); }
    finally { setDetailLoading(false); }
  };

  const handleLinkMemory = async (e) => {
    e.preventDefault();
    if (!selectedSession || !linkMemoryId.trim()) return;
    try {
      await api.linkMemoryToSession(selectedSession, linkMemoryId.trim());
      setLinkMemoryId('');
      const memRes = await api.getSessionMemories?.(selectedSession) || { memories: [] };
      setSessionMemories(memRes.memories || []);
    } catch (err) { alert('关联失败: '+err.message); }
  };

  const handleUnlinkMemory = async (memoryId) => {
    if (!selectedSession) return;
    try {
      await api.unlinkMemoryFromSession(selectedSession, memoryId);
      const memRes = await api.getSessionMemories?.(selectedSession) || { memories: [] };
      setSessionMemories(memRes.memories || []);
    } catch (err) { alert('解除关联失败: '+err.message); }
  };

  return (<>
    <div className="sd-card" style={{flex:'1 1 100%'}}>
      <div className="sd-card-title">创建会话</div>
      <div className="sd-card-body">
        <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 会话可以把多条相关的记忆<strong style={{color:'#aaa'}}>打包在一起</strong>，方便跨对话延续上下文。适合按功能特性或调试场景组织。</div>
        <div style={{display:'flex',gap:8}}>
          <input className="sd-input" style={{flex:1}} placeholder="会话 ID（留空自动生成）" value={newSessionId} onChange={e=>setNewSessionId(e.target.value)} />
          <button className="sd-btn" onClick={handleCreate}>创建</button>
          <button className="sd-btn" style={{background:'#383940'}} onClick={fetchSessions}>刷新</button>
        </div>
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 45%',minWidth:400}}>
      <div className="sd-card-title">会话列表</div>
      <div className="sd-card-body">
        <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 点击会话可查看其关联的所有记忆。点击「关闭」标记该会话已结束。</div>
        {loading?<div className="sd-empty">加载中...</div>
        : sessions.length===0?<div className="sd-empty">暂无会话</div>
        : sessions.map(s=>(<div key={s.session_id||s.id} className="sd-session-row">
          <div style={{flex:1,cursor:'pointer'}} onClick={()=>handleViewDetail(s.session_id||s.id)}>
            <div className="sd-session-id">{(s.session_id||s.id||'').substring(0,16)}</div>
            <div className="sd-session-meta">{s.status||'active'} · {new Date((s.created_at||s.created||0)*1000).toLocaleString()}</div>
          </div>
          {(s.status||'active')!=='closed' && <button className="sd-btn-sm" onClick={()=>handleClose(s.session_id||s.id)}>关闭</button>}
        </div>))}
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 45%',minWidth:400}}>
      <div className="sd-card-title">会话详情</div>
      <div className="sd-card-body">
        {detailLoading?<div className="sd-empty">加载中...</div>
        : selectedSession ? (<>
          {detail && <pre style={{fontSize:12,color:'#c0c0c8',whiteSpace:'pre-wrap',maxHeight:200,overflow:'auto',marginBottom:16,background:'#151618',padding:12,borderRadius:6}}>{detail.error||detail.packed_context||JSON.stringify(detail,null,2)}</pre>}
          {/* 关联记忆表单 */}
          <form onSubmit={handleLinkMemory} style={{display:'flex',gap:8,marginBottom:12}}>
            <input className="sd-input" style={{flex:1}} value={linkMemoryId} onChange={e=>setLinkMemoryId(e.target.value)} placeholder="输入记忆 ID（如 3f8a1b2c...）关联到当前会话" />
            <button className="sd-btn" type="submit">关联</button>
          </form>
          {/* 已关联记忆列表 */}
          <div style={{fontSize:12,color:'#888',marginBottom:8}}>已关联记忆 ({sessionMemories.length})</div>
          {sessionMemories.length===0
            ? <div className="sd-empty">暂无关联记忆</div>
            : sessionMemories.map(m=>(
              <div key={m.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'#151618',border:'1px solid #2c2d32',borderRadius:4,marginBottom:4}}>
                <div style={{flex:1,overflow:'hidden'}}>
                  <div style={{fontSize:11,color:'#6b9bff',marginBottom:2}}>{m.id?.substring(0,12)}...</div>
                  <div style={{fontSize:11,color:'#a0a0b0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(m.content||'').substring(0,60)}</div>
                </div>
                <button className="sd-btn-sm" onClick={()=>handleUnlinkMemory(m.id)} style={{background:'transparent',border:'1px solid rgba(239,83,80,0.3)',color:'#ef5350',padding:'2px 8px',fontSize:'10px',borderRadius:3,cursor:'pointer'}}>解除</button>
              </div>
            ))}
        </>) : <div className="sd-empty">点击左侧会话查看详情</div>}
      </div>
    </div>

    <style jsx>{CARD_CSS}</style>
    <style jsx>{COMMON_INPUT_CSS}</style>
    <style jsx>{`
      .sd-session-row { display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid #2c2d32; }
      .sd-session-row:last-child { border-bottom:none; }
      .sd-session-id { font-size:14px; font-weight:600; color:#e8e8ed; font-family:'SF Mono','Fira Code',monospace; }
      .sd-session-meta { font-size:11px; color:#a0a0b0; margin-top:2px; }
      .sd-btn-sm { font-size:11px; padding:4px 12px; background:#383940; color:#a0a0b0; border:none; border-radius:4px; cursor:pointer; }
      .sd-btn-sm:hover { background:#ef5350; color:#fff; }
    `}</style>
  </>);
}

/* ════════════════════════════════════════════════════════════
   Decay Tab — forgetting, protection, backup/restore, status
   ════════════════════════════════════════════════════════════ */
function DecayTab() {
  const { activeNamespace, stats, refreshData, namespaces } = useApp();
  const [maxCap, setMaxCap] = useState(10000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  // Protection
  const [protectedNs, setProtectedNs] = useState([]);
  const [protectLoading, setProtectLoading] = useState(false);
  // Backup / Restore
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreTaskId, setRestoreTaskId] = useState(null);
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  useEffect(() => {
    api.getProtectedNamespaces().then(r => setProtectedNs(r.protected_namespaces||[])).catch(()=>{});
  }, [activeNamespace]);

  const isProtected = protectedNs.includes(activeNamespace);

  const handleForget = async () => {
    setRunning(true); setResult(null);
    try { setResult(await api.activeForgetting(activeNamespace, maxCap)); refreshData(); }
    catch (err) { setResult({error:err.message}); }
    finally { setRunning(false); }
  };

  const toggleProtect = async () => {
    setProtectLoading(true);
    try {
      if (isProtected) {
        await api.unprotectNamespace(activeNamespace);
        setProtectedNs(prev => prev.filter(n => n !== activeNamespace));
      } else {
        await api.protectNamespace(activeNamespace);
        setProtectedNs(prev => [...prev, activeNamespace]);
      }
    } catch (err) { alert(err.message); }
    finally { setProtectLoading(false); }
  };

  const handleBackup = () => {
    if (!activeNamespace||activeNamespace==='all') { alert('请选择一个具体命名空间'); return; }
    window.location.href = `/api/backup?namespace=${encodeURIComponent(activeNamespace)}`;
  };

  const handleRestore = async (e) => {
    if (e) e.preventDefault();
    if (!activeNamespace||activeNamespace==='all') { alert('请选择命名空间'); return; }
    if (!restoreFile) { alert('请先选择 .json.gz 备份文件'); return; }
    if (!confirm(`⚠️ 恢复将彻底覆盖命名空间「${activeNamespace}」的全部数据，继续？`)) return;
    setRestoreLoading(true);
    setRestoreError(null);
    setRestoreSuccess(false);
    setRestoreProgress(null);
    try {
      const res = await api.restoreNamespace(restoreFile, activeNamespace);
      if (res && res.task_id) {
        setRestoreTaskId(res.task_id);
        startPollingRestoreTask(res.task_id);
      } else {
        throw new Error('未返回 task_id');
      }
    } catch (err) {
      setRestoreError(err.message || '恢复任务启动失败');
      setRestoreLoading(false);
    }
  };

  const startPollingRestoreTask = (taskId) => {
    if (window.activeRestoreInterval) clearInterval(window.activeRestoreInterval);
    const intervalId = setInterval(async () => {
      try {
        const task = await api.getTaskStatus(taskId);
        setRestoreProgress({
          status: task.status,
          stage: task.stage,
          current: task.current,
          total: task.total,
          message: task.message,
          percent: task.percent
        });
        if (task.status === 'completed' || task.status === 'complete') {
          clearInterval(intervalId);
          setRestoreLoading(false);
          setRestoreTaskId(null);
          setRestoreSuccess(true);
          setRestoreFile(null);
          const fileInput = document.getElementById('restore-file-input-sd');
          if (fileInput) fileInput.value = '';
          refreshData();
        } else if (task.status === 'failed' || task.status === 'error') {
          clearInterval(intervalId);
          setRestoreLoading(false);
          setRestoreTaskId(null);
          setRestoreError(task.error || '恢复任务执行失败');
        }
      } catch (err) { console.error('[Restore Polling]', err); }
    }, 1500);
    window.activeRestoreInterval = intervalId;
  };

  return (<>
    {/* Row 1: Forgetting + Status */}
    <div className="sd-card" style={{flex:'1 1 48%',minWidth:380}}>
      <div className="sd-card-title">主动遗忘</div>
      <div className="sd-card-body">
        <p style={{fontSize:13,color:'#a0a0b0',marginBottom:12,lineHeight:1.6}}>按容量上限淘汰低分、未置顶的记忆。</p>
        <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 系统会自动清理低频、低分的旧记忆（置顶和快照不会被清除）。你也可以手动设置容量上限并触发清理。</div>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          <label style={{fontSize:13,color:'#a0a0b0'}}>容量上限:</label>
          <input className="sd-input" style={{width:100}} type="number" value={maxCap} onChange={e=>setMaxCap(Number(e.target.value))} />
          <button className="sd-btn" onClick={handleForget} disabled={running}>{running?'执行中...':'执行遗忘'}</button>
        </div>
        {result && <pre className="sd-packed">{result.error||JSON.stringify(result,null,2)}</pre>}
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 48%',minWidth:380}}>
      <div className="sd-card-title">命名空间状态</div>
      <div className="sd-card-body">
        <div className="sd-stat-row"><span>当前</span><span>{activeNamespace}</span></div>
        <div className="sd-stat-row"><span>总记忆块</span><span>{stats.total_chunks||0}</span></div>
        <div className="sd-stat-row"><span>命名空间数</span><span>{namespaces.length}</span></div>
        <div className="sd-stat-row">
          <span>保护状态</span>
          <span style={{color:isProtected?'#66bb6a':'#a0a0b0'}}>{isProtected?'已保护':'未保护'}</span>
        </div>
        <button className="sd-btn" style={{width:'100%',marginTop:12}} onClick={toggleProtect} disabled={protectLoading}>
          {protectLoading?'...':(isProtected?'解除保护':'设为保护')}
        </button>
      </div>
    </div>

    {/* Row 2: Backup + Restore */}
    <div className="sd-card" style={{flex:'1 1 48%',minWidth:380}}>
      <div className="sd-card-title">备份</div>
      <div className="sd-card-body">
        <p style={{fontSize:13,color:'#a0a0b0',marginBottom:12}}>导出命名空间的完整快照（记忆+图谱+向量），下载为 .json.gz 文件。</p>
        <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>💡 定期备份可防止数据丢失。备份文件包含原始向量数据，恢复时无需重新嵌入。</div>
        <button className="sd-btn" onClick={handleBackup} style={{width:'100%'}}>下载备份</button>
      </div>
    </div>

    <div className="sd-card" style={{flex:'1 1 48%',minWidth:380}}>
      <div className="sd-card-title">恢复</div>
      <div className="sd-card-body">
        <p style={{fontSize:13,color:'#a0a0b0',marginBottom:12}}>从 .json.gz 备份文件恢复命名空间。将清空并覆盖现有数据。</p>
        <div style={{fontSize:12,color:'#888',marginBottom:12,lineHeight:1.6}}>⚠️ 恢复会<strong style={{color:'#ef5350'}}>清空并覆盖</strong>当前命名空间的所有数据，强烈建议先备份再恢复。</div>
        <form onSubmit={handleRestore}>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <input id="restore-file-input-sd" className="sd-input" style={{flex:1}} type="file" accept=".gz,.json.gz" onChange={e=>setRestoreFile(e.target.files[0])} />
            <button className="sd-btn" type="submit" disabled={restoreLoading||!restoreFile}>{restoreLoading?'恢复中...':'恢复'}</button>
          </div>
          {/* 恢复进度条 */}
          {restoreLoading && restoreProgress && (
            <div style={{marginTop:12,padding:'10px 12px',background:'#151618',border:'1px dashed rgba(107,155,255,0.3)',borderRadius:6}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#6b9bff',marginBottom:6}}>
                <span>[ 恢复进度: {(restoreProgress.stage||'INITIAL').toUpperCase()} ]</span>
                <span>{restoreProgress.percent||0}%</span>
              </div>
              <div style={{width:'100%',height:4,background:'rgba(255,255,255,0.05)',borderRadius:2,overflow:'hidden',marginBottom:6}}>
                <div style={{width:`${restoreProgress.percent||0}%`,height:'100%',background:'linear-gradient(90deg,#6b9bff,#00f2fe)',transition:'width 0.3s ease'}} />
              </div>
              <div style={{fontSize:10,color:'#fff'}}>{restoreProgress.message||'启动恢复任务...'}</div>
            </div>
          )}
          {restoreSuccess && (
            <div style={{marginTop:12,padding:10,background:'rgba(102,187,106,0.08)',color:'#66bb6a',fontSize:10,borderRadius:4}}>[ RESTORE_COMPLETE // 命名空间「{activeNamespace}」恢复成功 ]</div>
          )}
          {restoreError && (
            <div style={{marginTop:12,padding:10,background:'rgba(239,83,80,0.08)',color:'#ef5350',fontSize:10,borderRadius:4}}>[ RESTORE_FAILED // {restoreError} ]</div>
          )}
        </form>
      </div>
    </div>

    <style jsx>{CARD_CSS}</style>
    <style jsx>{COMMON_INPUT_CSS}</style>
    <style jsx>{`
      .sd-packed { font-size:12px; background:#151618; border:1px solid #2c2d32; border-radius:6px; padding:12px; max-height:150px; overflow:auto; white-space:pre-wrap; color:#c0c0c8; }
    `}</style>
  </>);
}

/* ════════════════════════════════════════════════════════════
   Shared CSS
   ════════════════════════════════════════════════════════════ */
const LABEL_STYLE = { fontSize:12, color:'#a0a0b0', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' };
const RESULT_PRE_STYLE = { fontSize:12, color:'#c0c0c8', whiteSpace:'pre-wrap', background:'#151618', padding:12, borderRadius:6 };
const COMMON_INPUT_CSS = ''; /* styles now in globals.css */

const CARD_CSS = `
  .sd-card { background:#25262b; border:1px solid #383940; border-radius:8px; padding:20px; }
  .sd-card-title { font-size:15px; font-weight:600; color:#e8e8ed; padding-bottom:12px; border-bottom:1px solid #383940; margin-bottom:12px; }
  .sd-card-body { font-size:13px; color:#a0a0b0; }
  .sd-stat-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
  .sd-stat-row:last-child { border-bottom:none; }
  .sd-tag-green { color:#66bb6a; font-weight:600; }
  .sd-tag-red { color:#ef5350; font-weight:600; }
  .sd-mono { font-family:'SF Mono','Fira Code',monospace; font-size:12px; }
  .sd-big-num { font-size:42px; font-weight:700; color:#6b9bff; line-height:1; }
  .sd-big-label { font-size:13px; color:#a0a0b0; margin-top:4px; }
  .sd-empty { text-align:center; padding:24px; color:#555; }
  .sd-ns-item { padding:6px 10px; margin-bottom:4px; background:rgba(255,255,255,0.03); border-radius:4px; font-size:13px; }
`;
