'use client';

import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';

const loading = () => <p role="status" className="empty-state">正在载入工具…</p>;
const CodebaseIntel = dynamic(() => import('./CodebaseIntel'), { loading });
const GraphExplorer = dynamic(() => import('./GraphExplorer'), { loading });
const ProjectPanel = dynamic(() => import('./ProjectPanel'), { loading });
const MemoryPanel = dynamic(() => import('./MemoryPanel'), { loading });

const VIEWS = [
  ['code', '代码分析', '查看项目架构、搜索符号、追踪调用和评估变更影响。'],
  ['graph', '关系图谱', '查看节点之间的连接，回到源码核实。'],
  ['projects', '索引管理', '从本机源码建立索引，跟踪任务和管理备份。'],
  ['memory', '记忆工具', '检索和写入记忆，按预算组装上下文。'],
  ['sessions', '会话与工作记忆', '延续任务并维护临时上下文。'],
  ['guide', '接入说明', '用工作台或 MCP 查询同一份项目索引。'],
];

export default function Workspace() {
  const { activeNamespace, setActiveNamespace, activeTab, setActiveTab, namespaces, stats, isOnline } = useApp();
  const view = VIEWS.find(([key]) => key === activeTab) || VIEWS[0];
  const needsProject = ['code', 'graph', 'sessions'].includes(activeTab) && activeNamespace === 'all';
  const engineStatus = isOnline === null ? '正在连接本地引擎' : isOnline ? '本地引擎已连接' : '本地引擎未连接';

  return <div className="workbench">
    <a href="#workspace-content" className="skip-link">跳到工作区</a>
    <aside className="workspace-sidebar">
      <div className="workspace-brand"><span className="brand-mark" aria-hidden="true">am</span><span>Agent Memory<small>本地代码工作台</small></span></div>
      <nav aria-label="工作台导航">{VIEWS.map(([key, title]) =>
        <button key={key} onClick={() => setActiveTab(key)} aria-current={activeTab === key ? 'page' : undefined}>
          {title}
        </button>)}
      </nav>
      <div className="workspace-status">
        <span className="status-dot" data-online={isOnline} />{engineStatus}
        <small>{namespaces.length} 个项目空间 · {(stats.total_chunks || 0).toLocaleString()} 条记录</small>
      </div>
    </aside>
    <main id="workspace-content" className="workspace-main">
      <header className="workspace-header">
        <div><h1>{view[1]}</h1><p>{view[2]}</p></div>
        {(namespaces.length > 0 || activeNamespace !== 'all') && <div className="project-selector"><label htmlFor="project">项目空间</label>
          <select id="project" value={activeNamespace} onChange={event => setActiveNamespace(event.target.value)}>
            <option value="all">全部空间</option>
            {namespaces.filter(name => name !== 'all').map(name => <option key={name}>{name}</option>)}
          </select>
        </div>}
      </header>
      {isOnline === false && <p className="notice" role="status">引擎尚未连接。请运行项目根目录的 start.bat 或 docker compose up -d。</p>}
      <section key={`${activeTab}:${activeNamespace}`} className="workspace-content" aria-label={view[1]}>
        {needsProject && (namespaces.length > 0 ? <div className="panel project-picker">
          <div className="toolbar"><h2>选择项目空间</h2><button className="button secondary" onClick={() => setActiveTab('projects')}>建立项目索引</button></div>
          <div className="project-list">{namespaces.map(name =>
            <button className="project-entry" key={name} onClick={() => setActiveNamespace(name)}><strong>{name}</strong><span>打开项目 ›</span></button>)}
          </div>
        </div> : <div className="panel welcome-panel">
          <div className="welcome-intro">
            <h2>建立第一个项目索引</h2>
            <p>给本机的代码目录建一份索引。工作台和 MCP 就能按项目查找符号和源码位置。</p>
            <button className="button" onClick={() => setActiveTab('projects')}>建立项目索引 <span aria-hidden="true">→</span></button>
          </div>
          <div className="welcome-steps">
            <h3>首次使用</h3>
            <ol>
              <li>填写项目空间名和代码目录</li>
              <li>运行增量同步</li>
              <li>打开对应空间开始查询</li>
            </ol>
          </div>
        </div>)}
        {!needsProject && <>
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
    <article className="panel"><h2>在工作台查询源码</h2>
      <ol><li>在「索引管理」填入本机项目绝对路径，建立增量索引。</li><li>选择项目空间，在「代码分析」查看架构、搜索符号或追踪调用链。</li><li>选择符号查看带行号的源码；在「关系图谱」检查关联。</li><li>修改代码后增量同步。未索引的关系和动态调用仍需通过源码与测试核实。</li></ol>
    </article>
    <article className="panel"><h2>通过 MCP 查询源码</h2>
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
