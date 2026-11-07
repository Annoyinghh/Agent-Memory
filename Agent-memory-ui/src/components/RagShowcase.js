'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import replay from './demo-replay.json';

const DigitalAvatar = dynamic(() => import('./DigitalAvatar'), {
  ssr: false,
  loading: () => <p className="hologram-message" role="status">正在载入全息数字人…</p>,
});

export default function RagShowcase() {
  const { activeNamespace, setActiveTab, isOnline, namespaces } = useApp();
  const [query, setQuery] = useState(replay.query);
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const result = live || replay;
  const canRun = isOnline && namespaces.includes(activeNamespace) && activeNamespace !== 'all';

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
        <p className="rag-kicker">AGENT MEMORY <span>·</span> RAG</p>
        <h1 id="rag-heading">让 Agent 带着<span>源码证据回答</span></h1>
        <p>输入一个问题，查看检索命中的文件和片段，再看 Agent 实际能拿到的上下文。</p>
        <a className="button" href="#rag-retrieval">查看检索演示 <span aria-hidden="true">↓</span></a>
      </div>
      <div className="rag-stage"><DigitalAvatar /></div>
    </section>

    <section id="rag-retrieval" className="rag-retrieval" aria-labelledby="retrieval-heading">
      <div className="rag-section-heading">
        <div><h2 id="retrieval-heading">从问题到证据</h2><p>{live ? `当前空间 ${activeNamespace}` : '示例回放 · 本项目源码 · 隔离索引与测试向量'}</p></div>
        <button className="button secondary" onClick={() => setActiveTab('graph')}>查看关系星图 <span aria-hidden="true">↗</span></button>
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
      <div className="rag-results" aria-busy={busy}>
        <article>
          <header><h3>召回证据</h3><span className="badge">{result.hits.length} 条命中</span></header>
          {result.hits.length ? result.hits.map((hit, index) => <details key={hit.id} open={index === 0}>
            <summary><code>{hit.source || '来源未标注'}</code></summary>
            <pre>{hit.content}</pre>
          </details>) : <p>没有检索到相关记录。</p>}
        </article>
        <article>
          <header><h3>交给 Agent 的上下文</h3><span className="badge">{result.budget} Token 预算</span></header>
          <p className="rag-help">查询「{result.query}」的打包结果</p>
          <pre>{result.context}</pre>
        </article>
      </div>
    </section>
  </div>;
}
