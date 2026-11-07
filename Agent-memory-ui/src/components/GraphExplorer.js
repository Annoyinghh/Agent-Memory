'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import SourceSnippet from './SourceSnippet';

const label = node => (node.content || node.label || node.id).split('\n')[0].replace(/^label:\s*/, '');

export default function GraphExplorer() {
  const { activeNamespace } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [relation, setRelation] = useState('all');

  useEffect(() => {
    let active = true;
    Promise.all([api.getGraphData(activeNamespace, 200), api.graphStats(activeNamespace)])
      .then(([graph, stats]) => { if (active) setData({ ...graph, stats }); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [activeNamespace]);

  if (error) return <p role="alert" className="notice error">{error}</p>;
  if (!data) return <p role="status" className="empty-state">正在读取项目关系…</p>;
  const nodes = data.nodes || [];
  const selected = nodes.find(node => node.id === selectedId) || nodes[0];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = data.edges.filter(edge =>
    (edge.source === selected?.id || edge.target === selected?.id) && (relation === 'all' || edge.relation === relation));
  const neighbors = [...new Set(edges.map(edge => edge.source === selected?.id ? edge.target : edge.source))]
    .filter(id => id !== selected?.id && byId.has(id)).slice(0, 16);
  const visible = new Set([selected?.id, ...neighbors]);
  const positions = new Map([[selected?.id, { x: 420, y: 300 }], ...neighbors.map((id, index) => {
    const angle = index * Math.PI * 2 / Math.max(1, neighbors.length) - Math.PI / 2;
    return [id, { x: 420 + Math.cos(angle) * 290, y: 300 + Math.sin(angle) * 230 }];
  })]);
  const filteredNodes = nodes.filter(node => `${label(node)} ${node.source_file || ''}`.toLowerCase().includes(query.toLowerCase()));

  return <>
    <div className="panel graph-summary"><div><h2>代码关系 · {activeNamespace}</h2><p>显示最多 200 条记录的样本；当前节点最多展开 16 个已加载邻居。缺少连线不代表没有依赖。</p></div>
      <span className="badge">{nodes.length} / {data.stats.nodes} 条记录 · {data.stats.edges} 条关系</span>
    </div>
    <div className="graph-workspace">
      <aside className="panel node-browser"><label htmlFor="node-filter">筛选已加载节点</label>
        <input id="node-filter" value={query} onChange={event => setQuery(event.target.value)} placeholder="符号名或文件路径" />
        <div className="node-list">{filteredNodes.map(node => <button className={selected?.id === node.id ? 'selected' : ''} key={node.id} onClick={() => setSelectedId(node.id)}>
          <strong>{label(node)}</strong><small>{node.source_file || node.source || '记忆记录'}</small>
        </button>)}</div>
        {!filteredNodes.length && <p className="empty-state">样本中无匹配项。可在「代码分析」搜索整个索引。</p>}
      </aside>
      <div className="panel graph-canvas"><div className="toolbar"><h2>局部连接</h2><label>关系类型<select value={relation} onChange={event => setRelation(event.target.value)}>
        <option value="all">全部关系</option>{[...new Set(data.edges.map(edge => edge.relation))].map(type => <option key={type}>{type}</option>)}
      </select></label></div>
        {selected ? <svg viewBox="0 0 840 600" role="img" aria-label={`节点 ${label(selected)} 的关系图。节点也可以通过左侧列表选择。`}>
          <defs><marker id="edge-arrow" markerWidth="8" markerHeight="8" refX="24" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#56837a" /></marker></defs>
          {edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)).map((edge, index) => {
            const from = positions.get(edge.source), to = positions.get(edge.target);
            return <g key={`${edge.source}:${edge.target}:${edge.relation}:${index}`}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#42635e" markerEnd="url(#edge-arrow)" /><title>{edge.relation}</title></g>;
          })}
          {[selected.id, ...neighbors].map(id => {
            const point = positions.get(id), node = byId.get(id);
            return <g key={id} role="button" tabIndex={0} aria-label={`查看 ${label(node)}`} onClick={() => setSelectedId(id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(id); } }} className="graph-node">
              <circle cx={point.x} cy={point.y} r={id === selected.id ? 27 : 18} fill={id === selected.id ? '#80d9bf' : '#243b35'} stroke="#80d9bf" />
              <text x={point.x} y={point.y + 43} textAnchor="middle" fill="#d6e5df" fontSize="12">{label(node).slice(0, 26)}</text><title>{label(node)}</title>
            </g>;
          })}
        </svg> : <p className="empty-state">尚无索引数据。请先在「索引管理」建立项目索引。</p>}
        {selected && !neighbors.length && <p className="muted">此样本中没有该节点的连接，可通过代码分析的调用链工具继续查询。</p>}
      </div>
    </div>
    {selected && <NodeEvidence key={selected.id} node={selected} namespace={activeNamespace} edges={edges} byId={byId} onSelect={setSelectedId} />}
  </>;
}

function NodeEvidence({ node, namespace, edges, byId, onSelect }) {
  return <article className="panel"><div className="toolbar"><h2>{label(node)}</h2><span className="badge">{node.node_type || 'memory'}</span></div>
    <p className="source-path">{node.source_file || node.source} {node.source_location}</p>
    <details><summary>节点标识与索引内容</summary><code>{node.id}</code><pre>{node.content}</pre></details>
    {node.node_type && <SourceSnippet namespace={namespace} nodeId={node.id} />}
    <div className="relationship-list">{edges.map((edge, index) => {
      const id = edge.source === node.id ? edge.target : edge.source;
      return <button className="button secondary" key={index} onClick={() => onSelect(id)}>{edge.source === node.id ? '调用方向 →' : '← 传入方向'} {edge.relation} · {label(byId.get(id) || { id })}</button>;
    })}</div>
  </article>;
}
