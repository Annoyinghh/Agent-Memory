'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

export default function MemoryPanel({ sessions = false }) {
  const { activeNamespace, refreshData } = useApp();
  return sessions ? <SessionTools namespace={activeNamespace} /> : <MemoryTools namespace={activeNamespace} refreshData={refreshData} />;
}

function MemoryTools({ namespace, refreshData }) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(10);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('manual');
  const [target, setTarget] = useState(namespace === 'all' ? '' : namespace);
  const [budget, setBudget] = useState(2000);
  const [compress, setCompress] = useState(false);
  const [output, setOutput] = useState('');
  const [sourceResults, setSourceResults] = useState(null);

  const run = async (name, operation) => {
    setBusy(name); setError('');
    try { await operation(); } catch (error) { setError(error.message); }
    finally { setBusy(''); }
  };
  const search = event => {
    event?.preventDefault();
    return run('search', async () => setResults((await api.search(namespace, query, topK)).results || []));
  };

  return <>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="tool-grid">
      <article className="panel"><h2>检索记忆与源码</h2>
        <form onSubmit={search} className="form-stack"><label>问题或关键词<input value={query} onChange={event => setQuery(event.target.value)} placeholder="留空可浏览当前空间的记忆" /></label>
          <div className="toolbar"><label>结果上限<select value={topK} onChange={event => setTopK(Number(event.target.value))}>{[5, 10, 20, 50].map(number => <option key={number}>{number}</option>)}</select></label>
            <button className="button" disabled={!!busy}>检索记忆</button><button className="button secondary" type="button" disabled={!!busy || !query.trim()} onClick={() => run('source', async () => setSourceResults((await api.preciseSourceSearch(namespace, query, topK, 4)).results || []))}>精确搜源码</button></div>
        </form>
        <p className="muted">排序分用于比较相关性，不代表答案正确概率。</p>
        {results?.map(record => <MemoryRecord key={`${record.id}:${record.timestamp}`} record={record} onChange={search} refreshData={refreshData} />)}
        {results?.length === 0 && <p className="empty-state">没有匹配的记忆。</p>}
        {sourceResults && <div><h3>源码命中</h3>{sourceResults.length ? sourceResults.map((item, index) => <details key={index}><summary>{item.source_file} · {item.line_number || item.line || item.source_location}</summary><pre>{item.snippet || item.context || JSON.stringify(item, null, 2)}</pre></details>) : <p className="empty-state">索引关联源码中没有匹配项。</p>}</div>}
      </article>
      <article className="panel"><h2>按预算组装上下文</h2>
        <p>使用左侧问题检索记忆，以 XML 片段交给 Agent。完整源码仍按需读取。</p>
        <div className="form-stack"><label>Token 预算<input type="number" min="100" max="32000" value={budget} onChange={event => setBudget(Number(event.target.value))} /></label>
          <label className="checkbox-label"><input type="checkbox" checked={compress} onChange={event => setCompress(event.target.checked)} />启用可选压缩</label>
          <button className="button" disabled={!!busy || !query.trim()} onClick={() => run('pack', async () => setOutput((await api.pack(namespace, query, budget, compress)).packed_context || '没有可用上下文'))}>生成上下文</button>
          {output && <><pre>{output}</pre><button className="button secondary" onClick={() => run('copy', () => navigator.clipboard.writeText(output))}>复制上下文</button></>}
        </div>
      </article>
      <article className="panel"><h2>保存项目知识</h2>
        <form className="form-stack" onSubmit={event => {
          event.preventDefault();
          run('insert', async () => { const value = await api.insert(target.trim(), content, source, 0.7); setOutput(`已保存：${value.id}`); setContent(''); await refreshData(); });
        }}>
          <label>目标空间<input required value={target} onChange={event => setTarget(event.target.value)} placeholder="具体项目名称" /></label>
          <label>来源<input required value={source} onChange={event => setSource(event.target.value)} /></label>
          <label>记忆内容<textarea required rows="7" value={content} onChange={event => setContent(event.target.value)} placeholder="项目约定、排查结论或待延续的任务知识" /></label>
          <div className="toolbar"><button className="button" disabled={!!busy || target.trim() === 'all'}>保存记忆</button>
            <button className="button secondary" type="button" disabled={!!busy || !content.trim() || !target.trim() || target.trim() === 'all'} onClick={() => run('snapshot', async () => { const value = await api.createSnapshot(target.trim(), content); setOutput(`已保存快照：${value.id}`); await refreshData(); })}>保存为快照</button></div>
        </form>
      </article>
      <CompressionTool />
    </div>
  </>;
}

function MemoryRecord({ record, onChange, refreshData }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(record.content);
  const [source, setSource] = useState(record.source);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutate = async operation => {
    setBusy(true); setError('');
    try { await operation(); setEditing(false); await onChange(); await refreshData(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  return <div className="memory-record">
    <div className="toolbar"><strong>{record.source}</strong><span className="badge">{record.score_kind} · {Number(record.score).toFixed(3)}</span></div>
    <small className="source-path">{record.namespace} · {new Date(record.timestamp * 1000).toLocaleString()} · {record.id}</small>
    {editing ? <div className="form-stack"><label>来源<input value={source} onChange={event => setSource(event.target.value)} /></label><label>内容<textarea rows="6" value={content} onChange={event => setContent(event.target.value)} /></label></div> : <pre>{record.content}</pre>}
    <div className="toolbar">
      {editing ? <><button className="button" disabled={busy || !content.trim()} onClick={() => mutate(() => api.update(record.id, record.namespace, content, source))}>保存修改</button><button className="button secondary" onClick={() => setEditing(false)}>取消</button></> : <>
        <button className="button secondary" onClick={() => setEditing(true)}>编辑</button>
        <button className="button secondary" disabled={busy} onClick={() => mutate(() => api.pinMemory(record.id, true))}>置顶</button>
        <button className="button secondary" disabled={busy} onClick={() => mutate(() => api.pinMemory(record.id, false))}>取消置顶</button>
        <button className="button danger" disabled={busy} onClick={() => { if (confirm('删除这条记忆？')) mutate(() => api.deleteById(record.namespace, record.id)); }}>删除</button>
      </>}
    </div>{error && <p role="alert" className="notice error">{error}</p>}
  </div>;
}

function CompressionTool() {
  const [text, setText] = useState('');
  const [key, setKey] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async restore => {
    setBusy(true); setError('');
    try {
      const value = restore ? await api.retrieveCompressed(key) : await api.compress(text);
      setResult(value);
      if (value.key) setKey(value.key);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  return <article className="panel"><h2>压缩与原文取回</h2><p>压缩器不可用时返回原文；收益以实际返回结果为准。</p>
    <label>待压缩文本<textarea rows="6" value={text} onChange={event => setText(event.target.value)} /></label>
    <button className="button secondary" disabled={busy || !text.trim()} onClick={() => run(false)}>压缩文本</button>
    <label>原文取回 Key<input value={key} onChange={event => setKey(event.target.value)} /></label>
    <button className="button secondary" disabled={busy || !key.trim()} onClick={() => run(true)}>取回原文</button>
    {result && <pre>{JSON.stringify(result, null, 2)}</pre>}{error && <p className="notice error" role="alert">{error}</p>}
  </article>;
}

function SessionTools({ namespace }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [role, setRole] = useState('user');
  const [text, setText] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.listSessions(namespace), api.getShortTermMemory(namespace), api.listWorkingMemory(namespace)])
      .then(([sessions, shortTerm, working]) => { if (active) setData({ sessions: sessions.sessions, history: shortTerm.history, state: working.state }); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [namespace, version]);

  const run = async operation => {
    setBusy(true); setError('');
    try { await operation(); setVersion(current => current + 1); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  };

  return <>{error && <p className="notice error" role="alert">{error}</p>}
    <div className="tool-grid">
      <article className="panel"><h2>会话</h2><form className="toolbar" onSubmit={event => { event.preventDefault(); run(async () => { await api.createSession(namespace, sessionId || null); setSessionId(''); }); }}>
        <input aria-label="新会话名称" value={sessionId} onChange={event => setSessionId(event.target.value)} placeholder="会话 ID（留空自动生成）" /><button className="button" disabled={busy}>创建会话</button></form>
        {!data && <p role="status">正在载入…</p>}
        {data?.sessions.map(session => <div key={session.id} className="memory-record"><div className="toolbar"><button className="text-button" onClick={() => setSelectedSession(session.id)}>{session.id}</button><span className="badge">{session.status}</span></div>
          <div className="toolbar"><button className="button secondary" disabled={busy} onClick={() => run(() => api.updateSessionStatus(session.id, session.status === 'active' ? 'closed' : 'active'))}>{session.status === 'active' ? '关闭' : '重新打开'}</button>
            <button className="button danger" disabled={busy} onClick={() => { if (confirm('删除会话及其关联？记忆正文会保留。')) run(async () => { await api.deleteSession(session.id); if (selectedSession === session.id) setSelectedSession(null); }); }}>删除</button></div></div>)}
        {data?.sessions.length === 0 && <p className="empty-state">暂无会话。</p>}
      </article>
      {selectedSession && <SessionDetail key={selectedSession} id={selectedSession} />}
      <article className="panel"><h2>短期对话</h2><form className="form-stack" onSubmit={event => { event.preventDefault(); run(async () => { await api.addShortTermMemory(namespace, role, text); setText(''); }); }}>
        <label>角色<select value={role} onChange={event => setRole(event.target.value)}>{['user', 'assistant', 'system'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label>内容<textarea required rows="3" value={text} onChange={event => setText(event.target.value)} /></label><button className="button" disabled={busy}>添加对话</button></form>
        <div className="toolbar"><button className="button secondary" disabled={busy} onClick={() => run(() => api.consolidateMemory(namespace))}>摘要为长期记忆</button><button className="button danger" disabled={busy} onClick={() => { if (confirm('清空当前空间的短期对话？')) run(() => api.deleteShortTermMemory(namespace)); }}>清空</button></div>
        {data?.history.map((turn, index) => <div className="memory-record" key={index}><strong>{turn.role}</strong><pre>{turn.content}</pre></div>)}
      </article>
      <article className="panel"><h2>工作记忆</h2><form className="form-stack" onSubmit={event => { event.preventDefault(); run(async () => { await api.writeWorkingMemory(namespace, key, value); setKey(''); setValue(''); }); }}>
        <label>Key<input required value={key} onChange={event => setKey(event.target.value)} /></label><label>Value<textarea required rows="3" value={value} onChange={event => setValue(event.target.value)} /></label><button className="button" disabled={busy}>写入 / 更新</button></form>
        {Object.entries(data?.state || {}).map(([name, text]) => <div className="memory-record" key={name}><strong>{name}</strong><pre>{text}</pre><div className="toolbar"><button className="button secondary" onClick={() => { setKey(name); setValue(text); }}>编辑</button><button className="button danger" disabled={busy} onClick={() => run(() => api.deleteWorkingMemory(namespace, name))}>删除</button></div></div>)}
      </article>
    </div>
  </>;
}

function SessionDetail({ id }) {
  const [data, setData] = useState(null);
  const [memoryId, setMemoryId] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api.getSessionMemories(id), api.getSessionContext(id, 4000)])
      .then(([memories, context]) => { if (active) setData({ memories: memories.memories, context: context.packed_context }); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [id, version]);
  const run = async operation => {
    setBusy(true); setError('');
    try { await operation(); setMemoryId(''); setVersion(current => current + 1); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  return <article className="panel"><h2>会话上下文</h2><p className="source-path">{id}</p>
    <form className="toolbar" onSubmit={event => { event.preventDefault(); run(() => api.linkMemoryToSession(id, memoryId.trim())); }}><input required aria-label="要关联的记忆 ID" placeholder="从记忆检索中复制 ID" value={memoryId} onChange={event => setMemoryId(event.target.value)} /><button className="button" disabled={busy}>关联</button></form>
    {error && <p role="alert" className="notice error">{error}</p>}
    {data?.memories.map(memory => <div className="memory-record" key={memory.id}><strong>{memory.source}</strong><pre>{memory.content}</pre><button className="button secondary" disabled={busy} onClick={() => run(() => api.unlinkMemoryFromSession(id, memory.id))}>解除关联</button></div>)}
    <details><summary>打包后的上下文</summary><pre>{data?.context || '暂无上下文'}</pre></details>
  </article>;
}
