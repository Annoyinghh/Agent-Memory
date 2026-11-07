'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { nodeLabel, replayGalaxy } from '@/lib/replayGalaxy';
import { useProjectGalaxy } from '@/lib/useProjectGalaxy';
import GalaxyMap from './GalaxyMap';
import SourceSnippet from './SourceSnippet';
import replay from './demo-replay.json';

const DigitalAvatar = dynamic(() => import('./DigitalAvatar'), {
  ssr: false,
  loading: () => <p className="hologram-message" role="status">正在载入全息数字人…</p>,
});

const WIDE_BRIDGE = '(min-width: 900px)';
const isWideBridge = () => window.matchMedia(WIDE_BRIDGE).matches;
const isWideOnServer = () => false;
function subscribeBridgeWidth(update) {
  const query = window.matchMedia(WIDE_BRIDGE);
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
}

export default function RagShowcase() {
  const { activeNamespace, setActiveTab, isOnline, namespaces } = useApp();
  const graph = useProjectGalaxy(activeNamespace);
  const sample = activeNamespace === 'all' || graph?.data?.nodes.length === 0;
  const sector = sample ? replayGalaxy : graph?.data;
  const [query, setQuery] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showSource, setShowSource] = useState(false);
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hailingOverride, setHailingOverride] = useState(null);
  const wide = useSyncExternalStore(subscribeBridgeWidth, isWideBridge, isWideOnServer);
  const hailingOpen = hailingOverride ?? wide;
  const result = live || (sample ? replay : null);
  const canRun = isOnline && namespaces.includes(activeNamespace) && activeNamespace !== 'all';
  const selected = sector?.nodes.find(node => node.id === selectedId) || sector?.nodes[0];
  const location = selected && [selected.source_file || selected.source, selected.source_location].filter(Boolean).join(':');
  const questionText = query ?? (sample ? replay.query : selected ? nodeLabel(selected) : '');

  async function run(event) {
    event.preventDefault();
    if (busy || !canRun || !questionText.trim()) return;
    const question = questionText.trim();
    setBusy(true);
    setError('');
    try {
      const search = await api.search(activeNamespace, question, 3);
      const packed = await api.pack(activeNamespace, question, replay.budget);
      setLive({
        query: question,
        hits: search.results,
        budget: replay.budget,
        context: packed.packed_context,
        degraded: search.degraded_channels,
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="rag-showcase">
    <section className="rag-hero" aria-labelledby="rag-heading">
      <div className="rag-intro">
        <p className="rag-kicker">AGENT MEMORY / BRIDGE</p>
        <h1 id="rag-heading">知识导航舱</h1>
        <p>选一颗星，沿着源码找到 Agent 收到的证据。</p>
      </div>
      <div className="flight-actions">
        <a className="button" href="#rag-retrieval">查看检索演示 <span aria-hidden="true">↓</span></a>
        <a className="button secondary" href="#agent-view">查看 Agent 视角</a>
      </div>
    </section>
    <div className="flight-bridge" data-hailing={hailingOpen ? 'open' : 'closed'}>
      <section className="bridge-map" aria-labelledby="bridge-map-heading">
        <header className="bridge-instrument-header">
          <h2 id="bridge-map-heading">源码星系</h2>
          <button className="flight-key" type="button" onClick={() => setActiveTab('graph')}>打开星系图谱 <span aria-hidden="true">↗</span></button>
        </header>
        {sector ? <GalaxyMap nodes={sector.nodes} edges={sector.edges} selectedId={selected?.id} onSelect={setSelectedId} sample={sample}>
          {selected && <div className="bridge-coordinates">
            <div className="bridge-target">
              <label htmlFor="bridge-node">节点目录</label>
              <select id="bridge-node" value={selected.id} onChange={event => setSelectedId(event.target.value)}>
                {sector.nodes.map(node => <option key={node.id} value={node.id}>{nodeLabel(node)}</option>)}
              </select>
              <code title={location}>{location || '无源码位置'}</code>
            </div>
            <a className="button" href="#star-source" onClick={() => setShowSource(true)}>查看源码</a>
          </div>}
        </GalaxyMap> : <p className="bridge-map-status" role={graph?.error ? 'alert' : 'status'}>{graph?.error || '正在读取项目星系…'}</p>}
      </section>
      <section className="bridge-avatar" aria-labelledby="avatar-heading">
        <header className="bridge-instrument-header">
          <h2 id="avatar-heading">全息联络</h2>
          <button className="flight-key" type="button" aria-expanded={hailingOpen} aria-controls="bridge-hailing" onClick={() => setHailingOverride(!hailingOpen)}>{hailingOpen ? '收起' : '展开'}</button>
        </header>
        <div id="bridge-hailing" className="rag-stage" hidden={!hailingOpen}>{hailingOpen && <DigitalAvatar />}</div>
      </section>
    </div>

    {selected && <section id="star-source" className="flight-panel star-source" aria-labelledby="star-source-heading" tabIndex={-1}>
      <header className="flight-panel-header">
        <div><h2 id="star-source-heading">{nodeLabel(selected)}</h2><p>{location}</p></div>
        <a className="button secondary" href="#rag-retrieval">继续到检索</a>
      </header>
      {!showSource ? <p>从星图点「查看源码」，打开当前节点的证据。</p>
        : sample ? (selected.content ? <pre>{selected.content}</pre> : replay.hits.map(hit => <div key={hit.id}><code>{hit.source}</code><pre>{hit.content}</pre></div>))
        : selected.node_type ? <SourceSnippet namespace={activeNamespace} nodeId={selected.id} indexedContent={selected.content} /> : <pre>{selected.content}</pre>}
    </section>}

    <section id="rag-retrieval" className="flight-panel rag-retrieval" aria-labelledby="retrieval-heading">
      <div className="flight-panel-header">
        <div><h2 id="retrieval-heading">从问题到证据</h2><p>{sample && !live ? '示例回放 · 本项目源码 · 隔离索引与测试向量' : `当前空间 ${activeNamespace}`}</p></div>
        <span className="flight-tag">{sample && !live ? '源码回放' : '实时检索'}</span>
      </div>
      <form className="rag-query" onSubmit={run}>
        <label>检索问题<input value={questionText} onChange={event => setQuery(event.target.value)} readOnly={!canRun} maxLength={2000} /></label>
        {canRun
          ? <button className="button" disabled={busy || !questionText.trim()}>{busy ? '正在检索…' : '检索并打包'}</button>
          : <button type="button" className="button secondary" onClick={() => setActiveTab('projects')}>索引本机项目</button>}
      </form>
      {!canRun && <p className="rag-help">{namespaces.length ? '在顶栏选择项目空间即可运行实时检索。' : '建立项目索引后，可以用自己的问题运行实时检索。'}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {result?.degraded?.length > 0 && <p className="notice" role="status">本次检索有通道降级：{result.degraded.join('、')}</p>}
      {sample && !live && <aside className="rag-conclusion" aria-label="样例解读">
        <strong>从证据能得出什么</strong>
        <p><code>CODEBASE_SOURCE_ROOTS</code> 用逗号分隔额外允许的目录。程序会解析这些目录的真实路径，再用公共路径判断目标是否在允许范围内。</p>
        <small>据下方两段召回源码整理</small>
      </aside>}
      {result && <article className="rag-evidence" aria-busy={busy}>
        <header className="flight-panel-header"><h3>召回证据</h3><span className="flight-tag">{result.hits.length} 条命中</span></header>
        {result.hits.length ? result.hits.map((hit, index) => <details key={hit.id} open={index === 0 || (!live && hit.id === selectedId)}>
          <summary><code>{hit.source || '来源未标注'}</code></summary>
          <pre>{hit.content}</pre>
        </details>) : <p>没有检索到相关记录。</p>}
      </article>}
    </section>
    <section id="agent-view" className="flight-panel agent-view" aria-labelledby="agent-view-heading">
      <header className="flight-panel-header">
        <div><h2 id="agent-view-heading">AI 看到什么</h2><p>下面是 <code>pack_context</code> 返回的文本，可以直接放入 Agent 上下文。</p></div>
        <span className="flight-tag">{replay.budget} Token 预算</span>
      </header>
      <div className="agent-payload">
        <article><h3>工具返回 · XML</h3>{result ? <><p className="rag-help">查询「{result.query}」</p><pre>{result.context}</pre></> : <p>运行上方检索后查看本次查询的原始返回。</p>}</article>
        <article className="agent-legend"><h3>怎么读这份证据</h3><dl>
          <dt><code>source</code></dt><dd>记录来源。样例带有文件和行号，Agent 可回到原处核查。</dd>
          <dt><code>relevance</code> / <code>age</code></dt><dd>相关性等级与记录时效，辅助 Agent 选择证据。</dd>
          <dt><code>&lt;memory&gt;</code></dt><dd>预算内装入的记忆或源码片段。Agent 需要更多细节时，可再按符号调用 <code>get_code_snippet</code>。</dd>
        </dl></article>
      </div>
    </section>
  </div>;
}
