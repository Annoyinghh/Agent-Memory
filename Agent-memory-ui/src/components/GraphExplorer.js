'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { nodeLabel, replayGalaxy } from '@/lib/replayGalaxy';
import { useProjectGalaxy } from '@/lib/useProjectGalaxy';
import GalaxyMap from './GalaxyMap';
import SourceSnippet from './SourceSnippet';

export default function GraphExplorer() {
  const { activeNamespace } = useApp();
  return activeNamespace === 'all' ? <GraphConsole data={replayGalaxy} sample /> : <ProjectGraph namespace={activeNamespace} />;
}

function ProjectGraph({ namespace }) {
  const graph = useProjectGalaxy(namespace, true);
  if (!graph) return <p role="status" className="empty-state">正在读取项目关系…</p>;
  if (graph.error) return <p role="alert" className="notice error">{graph.error}</p>;
  return <GraphConsole data={graph.data} namespace={namespace} />;
}

function GraphConsole({ data, namespace, sample = false }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [relation, setRelation] = useState('all');
  const { nodes, edges } = data;
  const selected = nodes.find(node => node.id === selectedId) || nodes[0];
  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const filteredEdges = useMemo(() => relation === 'all' ? edges : edges.filter(edge => edge.relation === relation), [edges, relation]);
  const incident = filteredEdges.filter(edge => edge.source === selected?.id || edge.target === selected?.id);
  const normalized = query.trim().toLowerCase();
  const visibleNodes = nodes.filter(node => `${nodeLabel(node)} ${node.source_file || ''}`.toLowerCase().includes(normalized));

  return <div className="flight-graph">
    <div className="flight-panel graph-main">
      <header className="flight-panel-header">
        <div><h2>{sample ? '样例星系' : namespace}</h2><p>{sample ? '样例取自项目源码，可在顶栏切换到自己的索引。' : `显示 ${nodes.length} / ${data.stats.nodes} 条记录。选中星点可查看其关联和源码。`}</p></div>
        <span className="flight-tag">{edges.length} 条样本关系</span>
      </header>
      <GalaxyMap nodes={nodes} edges={filteredEdges} selectedId={selected?.id} onSelect={setSelectedId} sample={sample} />
      <p className="galaxy-instructions">拖动旋转 · 滚轮或双指缩放 · 点亮带光环的代码节点</p>
    </div>
    <aside className="flight-panel graph-catalog" aria-label="节点目录">
      <h2>节点目录</h2>
      <label>筛选节点<input value={query} onChange={event => setQuery(event.target.value)} placeholder="符号名或文件路径" /></label>
      <label>关系类型<select value={relation} onChange={event => setRelation(event.target.value)}>
        <option value="all">全部关系</option>{[...new Set(edges.map(edge => edge.relation))].map(type => <option key={type}>{type}</option>)}
      </select></label>
      <div className="node-list">{visibleNodes.map(node => <button aria-pressed={selected?.id === node.id} className={selected?.id === node.id ? 'selected' : ''} key={node.id} onClick={() => setSelectedId(node.id)}>
        <strong>{nodeLabel(node)}</strong><small>{node.source_file || node.source || '记忆记录'}</small>
      </button>)}</div>
      {!visibleNodes.length && <p className="empty-state">当前样本没有匹配节点。可在「代码分析」搜索整个索引。</p>}
    </aside>
    {selected && <article className="flight-panel graph-evidence">
      <div className="flight-panel-header"><h2>{nodeLabel(selected)}</h2><span className="flight-tag">{selected.node_type || 'memory'}</span></div>
      <p className="source-path">{selected.source_file || selected.source} {selected.source_location}</p>
      {!sample && <p className="source-path">节点 ID <code>{selected.id}</code></p>}
      {selected.content && <details open={sample}><summary>{sample ? '样例源码' : '索引内容'}</summary><pre>{selected.content}</pre></details>}
      {!sample && selected.node_type && <SourceSnippet key={selected.id} namespace={namespace} nodeId={selected.id} indexedContent={selected.content} />}
      <div className="relationship-list">{incident.map((edge, index) => {
        const id = edge.source === selected.id ? edge.target : edge.source;
        return <button className="button secondary" key={index} onClick={() => setSelectedId(id)}>{edge.source === selected.id ? '→' : '←'} {edge.relation} · {nodeLabel(byId.get(id) || { id })}</button>;
      })}</div>
      {incident.length > 32 && <p className="muted">星图显示前 32 条连线，关系清单保留全部 {incident.length} 条。</p>}
    </article>}
  </div>;
}
