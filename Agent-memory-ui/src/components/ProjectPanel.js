'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api, BASE_URL, waitForTask } from '@/lib/api';

export default function ProjectPanel() {
  const { activeNamespace, refreshData, setActiveNamespace, setActiveTab,
    projectTask, setProjectTask, startingProjectTask, setStartingProjectTask } = useApp();
  const [namespace, setNamespace] = useState(activeNamespace === 'all' ? '' : activeNamespace);
  const [path, setPath] = useState('');
  const [mode, setMode] = useState('incremental');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [protectedSpaces, setProtectedSpaces] = useState([]);
  const { id: taskId, namespace: taskNamespace, status, result } = projectTask || {};
  const busy = startingProjectTask || status === 'running' || status === 'paused';
  const currentProgress = progress?.task_id === taskId ? progress : null;
  const selected = activeNamespace !== 'all';
  const isProtected = protectedSpaces.includes(activeNamespace);

  useEffect(() => {
    let active = true;
    api.getProtectedNamespaces().then(result => { if (active) setProtectedSpaces(result.protected_namespaces || []); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!taskId || status !== 'running') return;
    const controller = new AbortController();
    let taskFailed = false;
    waitForTask(taskId, {
      signal: controller.signal,
      onProgress: task => { taskFailed = task.status === 'failed'; setProgress(task); },
    }).then(value => {
      if (controller.signal.aborted) return;
      setProjectTask({ id: taskId, namespace: taskNamespace, status: value?.error ? 'failed' : 'completed', result: value, error: value?.error });
      if (!value?.error) refreshData();
    }).catch(error => {
      if (!controller.signal.aborted) {
        setProjectTask({ id: taskId, namespace: taskNamespace, status: taskFailed ? 'failed' : 'paused', error: error.message });
      }
    });
    return () => controller.abort();
  }, [taskId, taskNamespace, status, setProjectTask, refreshData]);

  const runTask = async (start, target) => {
    setStartingProjectTask(true); setProjectTask(null); setError('');
    try {
      const task = await start();
      if (!task.task_id) throw new Error('服务没有返回任务 ID。');
      // The workbench owns the ID even if this panel unmounts before the response.
      setProjectTask({ id: task.task_id, namespace: task.namespace, status: 'running' });
    } catch (error) { setProjectTask({ namespace: target, status: 'failed', error: error.message }); }
    finally { setStartingProjectTask(false); }
  };

  const extract = event => {
    event.preventDefault();
    if (busy || !path.trim() || !namespace.trim() || namespace.trim() === 'all') return;
    if (mode === 'rebuild' && !confirm(`全量重建会清空「${namespace}」的现有图谱和记忆，再重新提取。继续？`)) return;
    runTask(() => mode === 'json'
      ? api.importGraphFile(path.trim(), namespace.trim())
      : api.extractCodebase(path.trim(), namespace.trim(), { incremental: mode === 'incremental', rebuild: mode === 'rebuild' }), namespace.trim());
  };

  const restore = () => {
    if (busy || !file || !selected || !confirm(`恢复会覆盖「${activeNamespace}」的全部数据。请确认已保存所需备份。继续？`)) return;
    runTask(() => api.restoreNamespace(file, activeNamespace), activeNamespace);
  };

  const toggleProtection = async () => {
    try {
      if (isProtected) await api.unprotectNamespace(activeNamespace);
      else await api.protectNamespace(activeNamespace);
      setProtectedSpaces(current => isProtected ? current.filter(name => name !== activeNamespace) : [...current, activeNamespace]);
    } catch (error) { setError(error.message); }
  };

  return <div className="reading-column wide">
    <article className="panel"><h2>同步项目源码</h2>
      <p>增量同步保留未变化文件的索引。任务在后台执行，切换页面后可返回这里继续跟踪。</p>
      <form onSubmit={extract} className="form-stack">
        <label>项目空间<input required value={namespace} onChange={event => setNamespace(event.target.value)} placeholder="例如 order-service" /></label>
        <label>{mode === 'json' ? 'graph.json 绝对路径' : '项目目录绝对路径'}<input required value={path} onChange={event => setPath(event.target.value)} placeholder="D:/Project/my-project 或 /workspace/my-project" /></label>
        <div className="toolbar"><label>同步方式<select value={mode} onChange={event => setMode(event.target.value)}><option value="incremental">增量同步（推荐）</option><option value="rebuild">全量重建</option><option value="json">导入已有 graph.json</option></select></label>
          <button className="button" disabled={busy || namespace.trim() === 'all'}>{busy ? '正在处理…' : '开始索引'}</button></div>
      </form>
    </article>
    {(projectTask || startingProjectTask || error) && <article className="panel" aria-live="polite"><h2>任务状态</h2>
      {startingProjectTask && <p>正在创建后台任务…</p>}
      {taskNamespace && <p>任务空间：{taskNamespace}</p>}
      {taskId && <p>任务 ID：<code>{taskId}</code> <a href={`${BASE_URL}/api/tasks/${encodeURIComponent(taskId)}`} target="_blank" rel="noreferrer">查看原始状态</a></p>}
      {currentProgress && <><progress max="100" value={currentProgress.percent || 0} /><p>{currentProgress.stage} · {currentProgress.percent || 0}% · {currentProgress.message}</p></>}
      {(projectTask?.error || error) && <p className="notice error" role="alert">{projectTask?.error || error}</p>}
      {status === 'paused' && <div className="toolbar"><button className="button secondary" onClick={() => setProjectTask({ id: taskId, namespace: taskNamespace, status: 'running' })}>继续跟踪</button><button className="button secondary" onClick={() => setProjectTask(null)}>停止跟踪（后台任务继续）</button></div>}
      {status === 'completed' && <><p>{result?.skipped_unchanged ? '源码没有变化，已跳过重复索引。' : `「${taskNamespace}」处理完成。`}</p><details><summary>任务详情</summary><pre>{JSON.stringify(result, null, 2)}</pre></details><button className="button" onClick={() => { setActiveNamespace(taskNamespace); setActiveTab('code'); }}>打开代码分析</button></>}
    </article>}
    <article className="panel"><h2>保护与备份</h2><p>当前空间：<strong>{activeNamespace}</strong>。备份保留记忆、图谱、向量、会话和工作记忆。</p>
      <div className="toolbar"><button className="button secondary" disabled={!selected || busy} onClick={toggleProtection}>{isProtected ? '解除只读保护' : '设为只读'}</button>
        {selected && <><a className="button secondary" href={`${BASE_URL}/api/backup?namespace=${encodeURIComponent(activeNamespace)}`}>下载备份</a><a className="button secondary" href={api.getArtifactDownloadUrl(activeNamespace)}>下载团队工件</a></>}
      </div>
      <div className="toolbar"><label>恢复备份或团队工件<input type="file" accept=".gz,.json" onChange={event => setFile(event.target.files?.[0] || null)} /></label><button className="button danger" disabled={!file || !selected || busy || isProtected} onClick={restore}>覆盖恢复到当前空间</button></div>
      {!selected && <p className="muted">先在顶栏选择具体项目空间，再进行保护或恢复。</p>}
    </article>
  </div>;
}
