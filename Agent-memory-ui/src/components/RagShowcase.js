'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { nodeLabel, replayGalaxy } from '@/lib/replayGalaxy';
import GalaxyMap from './GalaxyMap';
import replay from './demo-replay.json';

const DigitalAvatar = dynamic(() => import('./DigitalAvatar'), {
  ssr: false,
  loading: () => <p className="hologram-message" role="status">正在载入全息数字人…</p>,
});

export default function RagShowcase() {
  const { activeNamespace, setActiveTab, isOnline, namespaces } = useApp();
  const [query, setQuery] = useState(replay.query);
  const [selectedId, setSelectedId] = useState(replayGalaxy.nodes[0].id);
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const result = live || replay;
  const canRun = isOnline && namespaces.includes(activeNamespace) && activeNamespace !== 'all';
  const selected = replayGalaxy.nodes.find(node => node.id === selectedId);

  async function run(event) {
    event.preventDefault();
    if (busy || !canRun || !query.trim()) return;
    const question = query.trim();
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
        <p className="rag-kicker">AGENT MEMORY / NAVIGATION</p>
        <h1 id="rag-heading">知识导航舱</h1>
        <p>沿代码星系定位证据，再切到 Agent 视角查看它收到的源码上下文。</p>
      </div>
      <div className="flight-actions">
        <a className="button" href="#rag-retrieval">查看检索演示 <span aria-hidden="true">↓</span></a>
        <a className="button secondary" href="#agent-view">查看 Agent 视角</a>
      </div>
    </section>
    <div className="flight-bridge">
      <section className="flight-panel bridge-map" aria-labelledby="bridge-map-heading">
        <header className="flight-panel-header">
          <div><h2 id="bridge-map-heading">源码星系</h2><p>星点定位文件和符号，连线表示它们的关系。</p></div>
          <button className="button secondary" onClick={() => setActiveTab('graph')}>打开星系图谱 <span aria-hidden="true">↗</span></button>
        </header>
        <GalaxyMap nodes={replayGalaxy.nodes} edges={replayGalaxy.edges} selectedId={selectedId} onSelect={setSelectedId} sample />
        <div className="bridge-coordinates">
          <span>当前定位 <code>{nodeLabel(selected)}</code></span>
          <div role="group" aria-label="样例节点">{replayGalaxy.nodes.map((node, index) =>
            <button className="flight-key" type="button" key={node.id} aria-label={`定位 ${nodeLabel(node)}`} aria-pressed={selectedId === node.id} onClick={() => setSelectedId(node.id)}>{String(index + 1).padStart(2, '0')}</button>)}</div>
        </div>
      </section>
      <section className="flight-panel bridge-avatar" aria-labelledby="avatar-heading">
        <header className="flight-panel-header"><div><h2 id="avatar-heading">全息联络</h2><p>Agent Memory</p></div><span className="flight-tag">A–01</span></header>
        <div className="rag-stage"><DigitalAvatar /></div>
        <p className="bridge-caption">检索命中后，Agent 可以按文件和行号核实证据。</p>
      </section>
    </div>

    <section id="rag-retrieval" className="flight-panel rag-retrieval" aria-labelledby="retrieval-heading">
      <div className="flight-panel-header">
        <div><h2 id="retrieval-heading">从问题到证据</h2><p>{live ? `当前空间 ${activeNamespace}` : '示例回放 · 本项目源码 · 隔离索引与测试向量'}</p></div>
        <span className="flight-tag">{live ? '实时检索' : '源码回放'}</span>
      </div>
      <form className="rag-query" onSubmit={run}>
        <label>检索问题<input value={query} onChange={event => setQuery(event.target.value)} readOnly={!canRun} maxLength={2000} /></label>
        {canRun
          ? <button className="button" disabled={busy || !query.trim()}>{busy ? '正在检索…' : '检索并打包'}</button>
          : <button type="button" className="button secondary" onClick={() => setActiveTab('projects')}>索引本机项目</button>}
      </form>
      {!canRun && <p className="rag-help">{namespaces.length ? '在顶栏选择项目空间即可运行实时检索。' : '建立项目索引后，可以用自己的问题运行实时检索。'}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {result.degraded?.length > 0 && <p className="notice" role="status">本次检索有通道降级：{result.degraded.join('、')}</p>}
      {!live && <aside className="rag-conclusion" aria-label="样例解读">
        <strong>从证据能得出什么</strong>
        <p><code>CODEBASE_SOURCE_ROOTS</code> 用逗号分隔额外允许的目录。程序会解析这些目录的真实路径，再用公共路径判断目标是否在允许范围内。</p>
        <small>据下方两段召回源码整理</small>
      </aside>}
      <article className="rag-evidence" aria-busy={busy}>
        <header className="flight-panel-header"><h3>召回证据</h3><span className="flight-tag">{result.hits.length} 条命中</span></header>
        {result.hits.length ? result.hits.map((hit, index) => <details key={hit.id} open={index === 0 || (!live && hit.id === selectedId)}>
          <summary><code>{hit.source || '来源未标注'}</code></summary>
          <pre>{hit.content}</pre>
        </details>) : <p>没有检索到相关记录。</p>}
      </article>
    </section>
    <section id="agent-view" className="flight-panel agent-view" aria-labelledby="agent-view-heading">
      <header className="flight-panel-header">
        <div><h2 id="agent-view-heading">AI 看到什么</h2><p>下面是 <code>pack_context</code> 返回的文本，可以直接放入 Agent 上下文。</p></div>
        <span className="flight-tag">{result.budget} Token 预算</span>
      </header>
      <div className="agent-payload">
        <article><h3>工具返回 · XML</h3><p className="rag-help">查询「{result.query}」</p><pre>{result.context}</pre></article>
        <article className="agent-legend"><h3>怎么读这份证据</h3><dl>
          <dt><code>source</code></dt><dd>记录来源。样例带有文件和行号，Agent 可回到原处核查。</dd>
          <dt><code>relevance</code> / <code>age</code></dt><dd>相关性等级与记录时效，辅助 Agent 选择证据。</dd>
          <dt><code>&lt;memory&gt;</code></dt><dd>预算内装入的记忆或源码片段。Agent 需要更多细节时，可再按符号调用 <code>get_code_snippet</code>。</dd>
        </dl></article>
      </div>
    </section>
  </div>;
}
