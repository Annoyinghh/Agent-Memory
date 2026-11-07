'use client';

import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';

const loading = () => <p role="status" className="empty-state">正在载入工具…</p>;
const CodebaseIntel = dynamic(() => import('./CodebaseIntel'), { loading });
const GraphExplorer = dynamic(() => import('./GraphExplorer'), { loading });
const ProjectPanel = dynamic(() => import('./ProjectPanel'), { loading });
const MemoryPanel = dynamic(() => import('./MemoryPanel'), { loading });

const VIEWS = [
  ['code', '代码分析', '01', '架构、符号、调用链与变更影响'],
  ['graph', '关系图谱', '02', '查看连接，选择节点，读取源码'],
  ['projects', '索引管理', '03', '增量同步、任务进度与备份'],
  ['memory', '记忆工具', '04', '检索、写入与上下文打包'],
  ['sessions', '会话与工作记忆', '05', '延续任务与维护临时上下文'],
  ['guide', '接入说明', '06', '人和 AI 共用同一份项目知识'],
];

export default function Workspace() {
  const { activeNamespace, setActiveNamespace, activeTab, setActiveTab, namespaces, stats, isOnline } = useApp();
  const view = VIEWS.find(([key]) => key === activeTab) || VIEWS[0];
  const needsProject = ['code', 'graph', 'sessions'].includes(activeTab) && activeNamespace === 'all';

  return <div className="workbench">
    <a href="#workspace-content" className="skip-link">跳到工作区</a>
    <aside className="workspace-sidebar">
      <div className="workspace-brand"><span className="brand-mark">am</span><span>Agent Memory<small>LOCAL CODE INTELLIGENCE</small></span></div>
      <p className="nav-label">工作空间 / WORKSPACE</p>
      <nav aria-label="工作台导航">{VIEWS.map(([key, title, number]) =>
        <button key={key} onClick={() => setActiveTab(key)} aria-current={activeTab === key ? 'page' : undefined}>
          <span className="nav-number">{number}</span>{title}
        </button>)}
      </nav>
      <div className="workspace-status">
        <span className={`status-dot ${isOnline ? 'online' : ''}`} />{isOnline ? '本地引擎已连接' : '等待本地引擎'}
        <small>{namespaces.length} 个项目空间 · {(stats.total_chunks || 0).toLocaleString()} 条记录</small>
      </div>
    </aside>
    <main id="workspace-content" className="workspace-main">
      <header className="workspace-header">
        <div><p className="eyebrow">WORKSPACE / {view[2]}</p><h1>{view[1]}</h1><p>{view[3]}</p></div>
        <div className="project-selector"><label htmlFor="project">项目空间</label>
          <select id="project" value={activeNamespace} onChange={event => setActiveNamespace(event.target.value)}>
            <option value="all">全部空间</option>
            {namespaces.filter(name => name !== 'all').map(name => <option key={name}>{name}</option>)}
          </select>
          <button className="button secondary" onClick={() => setActiveTab('projects')}>索引项目</button>
        </div>
      </header>
      {!isOnline && <p className="notice" role="status">引擎尚未连接。请运行项目根目录的 start.bat 或 docker compose up -d。</p>}
      <section key={`${activeTab}:${activeNamespace}`} className="workspace-content" aria-label={view[1]}>
        {needsProject ? <div className="welcome-panel">
          <p className="eyebrow">START WITH YOUR SOURCE</p><h2>先选一个项目，再沿着代码找答案。</h2>
          <p>索引代码后，可以查看架构、搜索符号、追踪调用关系，并回到对应源码核实。</p>
          <button className="button" onClick={() => setActiveTab('projects')}>建立项目索引</button>
          {namespaces.length > 0 && <div className="project-list">{namespaces.map(name =>
            <button className="project-entry" key={name} onClick={() => setActiveNamespace(name)}><strong>{name}</strong><span>打开项目 ›</span></button>)}
          </div>}
        </div> : <>
          {activeTab === 'code' && <CodebaseIntel />}
          {activeTab === 'graph' && <GraphExplorer />}
          {activeTab === 'projects' && <ProjectPanel />}
          {activeTab === 'memory' && <MemoryPanel />}
          {activeTab === 'sessions' && <MemoryPanel sessions />}
        </>}
        {activeTab === 'guide' && <Guide />}
      </section>
    </main>
  </div>;
}

function Guide() {
  return <div className="reading-column">
    <article className="panel"><p className="eyebrow">FOR PEOPLE</p><h2>从问题走到源码</h2>
      <ol><li>在「索引管理」填入本机项目绝对路径，建立增量索引。</li><li>选择项目空间，在「代码分析」查看架构、搜索符号或追踪调用链。</li><li>选择符号查看带行号的源码；在「关系图谱」检查关联。</li><li>修改代码后增量同步。未索引的关系和动态调用仍需通过源码与测试核实。</li></ol>
    </article>
    <article className="panel"><p className="eyebrow">FOR AGENTS</p><h2>先发现，再定位，最后取证</h2>
      <pre>{`project_overview()
get_architecture(namespace="my-project")
search_graph(namespace="my-project", name_regex="ProcessOrder", limit=10)
trace_path(namespace="my-project", start="<exact node_id>", depth=2)
get_code_snippet(namespace="my-project", node_id="<exact node_id>")`}</pre>
      <p>结构化工具直接查询代码图谱；需要语义记忆时再用 hybrid_search 和 pack_context。符号重名时先选候选项。按需分页与读取片段，避免整库塞进上下文。</p>
    </article>
    <article className="panel"><h2>连接 MCP</h2><p>本机 stdio 配置示例。将路径替换为实际安装位置，Python 解释器需安装后端依赖。</p>
      <pre>{JSON.stringify({ mcpServers: { 'agent-memory': { command: 'D:/path/to/Agent-Memory-main/.venv/Scripts/python.exe', args: ['D:/path/to/Agent-Memory-main/Agent-Memory-Server/server.py'] } } }, null, 2)}</pre>
      <p>REST、MCP 和工作台读取同一份数据。索引路径需要位于允许的源码目录内；额外目录通过 CODEBASE_SOURCE_ROOTS 配置。</p>
    </article>
  </div>;
}
