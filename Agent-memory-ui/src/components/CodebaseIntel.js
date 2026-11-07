'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import SourceSnippet from './SourceSnippet';

const TABS = [['architecture', '架构总览'], ['search', '符号搜索'], ['trace', '调用链'], ['changes', '变更影响'], ['deadcode', '未引用候选']];
const SYMBOL_PAGE_SIZE = 50;

export default function CodebaseIntel() {
  const { activeNamespace } = useApp();
  const [tab, setTab] = useState('architecture');
  return <>
    <div className="tab-list" role="tablist" aria-label="代码分析工具">{TABS.map(([key, title]) =>
      <button id={`code-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="code-panel" key={key} onClick={() => setTab(key)}>{title}</button>)}
    </div>
    <div id="code-panel" role="tabpanel" aria-labelledby={`code-tab-${tab}`}><CodeQuery key={tab} mode={tab} namespace={activeNamespace} /></div>
  </>;
}

function CodeQuery({ mode, namespace }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [start, setStart] = useState('');
  const [direction, setDirection] = useState('outbound');
  const [depth, setDepth] = useState(2);
  const [base, setBase] = useState('HEAD');
  const [version, setVersion] = useState(0);
  const [submittedFilters, setSubmittedFilters] = useState(null);

  useEffect(() => {
    let active = true;
    const request = mode === 'architecture'
      ? Promise.all([api.getArchitecture(namespace), api.getGraphSchema(namespace)]).then(([architecture, schema]) => ({ ...architecture, schema }))
      : mode === 'deadcode' ? api.getDeadCode(namespace) : null;
    request?.then(result => { if (active) setData(result); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [mode, namespace, version]);

  const run = async operation => {
    setBusy(true); setError(''); setSelected(null);
    try { setData(await operation()); } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  const search = (offset, filters = submittedFilters) => run(() => api.searchGraphStructured(namespace, {
    ...filters, limit: SYMBOL_PAGE_SIZE, offset,
  }));
  const trace = symbol => run(() => api.traceGraphPath(namespace, symbol || start.trim(), direction, 'calls', depth));
  const traceNodes = new Map((mode === 'trace' ? data?.nodes || [] : []).map(node => [node.id, node]));

  return <>
    {error && <p className="notice error" role="alert">{error}</p>}
    {mode === 'search' && <SymbolSearchForm busy={busy} onSearch={filters => {
      setSubmittedFilters(filters);
      search(0, filters);
    }} />}
    {mode === 'trace' && <form className="panel query-form" onSubmit={event => { event.preventDefault(); trace(); }}>
      <label>符号名或精确节点 ID<input required value={start} onChange={event => setStart(event.target.value)} placeholder="名称重复时会列出候选项" /></label>
      <label>方向<select value={direction} onChange={event => setDirection(event.target.value)}><option value="outbound">它调用什么</option><option value="inbound">谁调用它</option><option value="both">双向关系</option></select></label>
      <label>深度<select value={depth} onChange={event => setDepth(Number(event.target.value))}>{[1, 2, 3, 4, 5].map(number => <option key={number}>{number}</option>)}</select></label>
      <button className="button" disabled={busy}>{busy ? '追踪中…' : '追踪调用链'}</button>
    </form>}
    {mode === 'changes' && <form className="panel query-form" onSubmit={event => { event.preventDefault(); run(() => api.detectChanges(namespace, base)); }}>
      <label>Git 基准<input required value={base} onChange={event => setBase(event.target.value)} /></label><button className="button" disabled={busy}>分析变更</button>
      <p className="muted">分析索引中的静态关系。没有 Git 时按文件哈希比较；报告中的风险是启发式信号。</p>
    </form>}
    {['architecture', 'deadcode'].includes(mode) && <div className="toolbar"><p className="muted">{mode === 'deadcode' ? '零入边函数是待核查候选；入口、回调和动态调用也可能出现在这里，不应直接删除。' : '从结构总览定位关键符号，再查看源码证据。'}</p><button className="button secondary" onClick={() => { setData(null); setError(''); setVersion(value => value + 1); }}>刷新</button></div>}
    <div className={selected ? 'analysis-layout' : ''}>
      <div className="analysis-results">
        {!data && ['architecture', 'deadcode'].includes(mode) && !error && <p className="empty-state" role="status">正在读取代码索引…</p>}
        {data && mode === 'architecture' && <>
          <div className="metric-grid">{[['源码文件', data.file_count], ['图谱节点', data.schema?.nodes], ['关系', data.schema?.edges], ['社区', data.communities?.length]].map(([title, value]) => <div className="metric" key={title}><strong>{value ?? 0}</strong><span>{title}</span></div>)}</div>
          <article className="panel"><h2>结构分布</h2><div className="toolbar">{Object.entries(data.node_type_counts || {}).map(([type, count]) => <span className="badge" key={type}>{type} · {count}</span>)}</div><p>{Object.entries(data.language_breakdown || {}).map(([language, count]) => `${language}: ${count}`).join(' · ') || '暂无语言信息'}</p></article>
          <SymbolTable title="连接热点" nodes={data.hotspots} onSelect={setSelected} />
          <SymbolTable title="入口候选" nodes={data.entry_point_candidates} onSelect={setSelected} />
        </>}
        {data && ['search', 'deadcode'].includes(mode) && <>
          <SymbolTable title={`${mode === 'search' ? '搜索结果' : '未引用候选'} · ${data.total ?? data.dead_count ?? 0}`} nodes={data.results} onSelect={setSelected} />
          {mode === 'search' && <div className="toolbar">
            <button className="button secondary" disabled={busy || !data.offset} onClick={() => search(Math.max(0, data.offset - SYMBOL_PAGE_SIZE))}>上一页</button>
            <span className="muted">第 {Math.floor(data.offset / SYMBOL_PAGE_SIZE) + 1} 页 · 每页最多 {SYMBOL_PAGE_SIZE} 项</span>
            <button className="button secondary" disabled={busy || data.offset + SYMBOL_PAGE_SIZE >= data.total} onClick={() => search(data.offset + SYMBOL_PAGE_SIZE)}>下一页</button>
          </div>}
        </>}
        {data && mode === 'trace' && <>
          {data.error ? <article className="panel"><h2>{data.error === 'ambiguous' ? '请选择具体符号' : '未找到符号'}</h2><p>{data.message}</p>{data.candidates?.map(node => <button className="project-entry" key={node.id} onClick={() => { setStart(node.id); trace(node.id); }}><strong>{node.label}</strong><span>{node.source_file}</span></button>)}</article> : <>
            <p className="muted">展开深度 {data.depth_reached} · {data.node_count} 个节点{data.truncated ? ' · 已达到查询上限，缩小深度可继续核查' : ''}</p>
            <SymbolTable title="调用链节点" nodes={data.nodes} onSelect={setSelected} />
            <article className="panel"><h2>关系方向</h2><p className="muted">箭头表示索引中的调用方向。</p><div className="edge-list">{data.edges?.map((edge, index) => {
              const from = traceNodes.get(edge.from), to = traceNodes.get(edge.to);
              return <div key={index}><button className="text-button" onClick={() => from && setSelected(from)}>{from?.label || edge.from}</button><span> — {edge.relation} → </span><button className="text-button" onClick={() => to && setSelected(to)}>{to?.label || edge.to}</button></div>;
            })}</div></article>
          </>}
        </>}
        {data && mode === 'changes' && <>
          {data.error ? <p className="notice error">{data.message || data.error}</p> : <>
            <p className="muted">{data.git_unavailable ? '使用文件哈希比较' : `Git 基准：${data.base}`} · {data.changed_files?.length || 0} 个变化文件 · {data.blast_radius?.affected_count || 0} 个下游关联节点</p>
            <SymbolTable title="变更文件中的符号" nodes={data.impacted_nodes} onSelect={setSelected} />
            <details className="panel"><summary>查看完整变更分析</summary><pre>{JSON.stringify(data, null, 2)}</pre></details>
          </>}
        </>}
      </div>
      {selected && <SourceEvidence key={selected.id} namespace={namespace} node={selected} onClose={() => setSelected(null)} />}
    </div>
  </>;
}

function SymbolSearchForm({ busy, onSearch }) {
  function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const minimum = fields.get('minimum');
    const maximum = fields.get('maximum');
    onSearch({
      nameRegex: fields.get('name').trim(),
      sourceFileRegex: fields.get('file').trim(),
      nodeType: fields.get('type') || null,
      minDegree: minimum === '' ? undefined : Number(minimum),
      maxDegree: maximum === '' ? undefined : Number(maximum),
    });
  }

  return <form className="panel query-form" onSubmit={submit}>
    <label>符号名（正则）<input name="name" placeholder="例如 ProcessOrder|handler" /></label>
    <label>文件路径（正则）<input name="file" placeholder="例如 services/.*" /></label>
    <label>节点类型<select name="type" defaultValue="">
      <option value="">全部类型</option>
      {['function', 'class', 'file', 'document', 'rationale', 'symbol'].map(type => <option key={type}>{type}</option>)}
    </select></label>
    <label>最小连接数<input name="minimum" type="number" min="0" /></label>
    <label>最大连接数<input name="maximum" type="number" min="0" /></label>
    <button className="button" disabled={busy}>{busy ? '检索中…' : '搜索符号'}</button>
  </form>;
}

function SymbolTable({ title, nodes = [], onSelect }) {
  return <article className="panel symbol-table"><h2>{title}</h2>{nodes.length ? <div className="table-scroll"><table><thead><tr><th>符号</th><th>文件与位置</th><th>类型 / 连接</th></tr></thead><tbody>{nodes.map(node => <tr key={node.id}><td><button className="text-button" onClick={() => onSelect(node)}>{node.label || node.id}</button></td><td className="source-path">{node.source_file || '未记录'}<small>{node.source_location}</small></td><td><span>{node.node_type || 'symbol'}</span>{node.total_degree !== undefined && <small>入 {node.in_degree || 0} / 出 {node.out_degree || 0}</small>}{node.risk && <small>风险信号 {node.risk}</small>}</td></tr>)}</tbody></table></div> : <p className="empty-state">当前索引没有匹配项。</p>}</article>;
}

function SourceEvidence({ namespace, node, onClose }) {
  return <aside className="panel source-evidence">
    <div className="toolbar"><h2>源码证据</h2><button className="button secondary" onClick={onClose}>关闭</button></div>
    <strong>{node.label}</strong><p className="source-path">{node.source_file} {node.source_location}</p><code>{node.id}</code>
    <SourceSnippet namespace={namespace} nodeId={node.id} contextLines={8} loadingText="正在读取…" />
    <p className="muted">源码来自当前本机文件，关系来自已建立的索引；代码变化后请增量同步。</p>
  </aside>;
}
