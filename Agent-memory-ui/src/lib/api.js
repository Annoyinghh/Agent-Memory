/**
 * Agent Memory API Client Utility
 *
 * Calls are relative (BASE_URL = '') so the browser talks to whatever origin served
 * the page. In Docker the Next.js server reverse-proxies /api/* → backend:8900 via
 * next.config.mjs `rewrites`, so only one host port is exposed regardless of LAN IP.
 * Override with NEXT_PUBLIC_API_URL only for a non-proxied direct backend address.
 */

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${BASE_URL}${path}`, { cache: 'no-store', ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error?.detail;
    throw new Error(typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : `HTTP Error: ${response.status}`);
  }
  return response.json();
}

function upload(path, file, targetNamespace) {
  const body = new FormData();
  body.append('file', file);
  const query = targetNamespace ? `?target_namespace=${encodeURIComponent(targetNamespace)}` : '';
  return request(`${path}${query}`, { method: 'POST', body });
}

/** Sequential polling: never overlap requests; stop on failure, timeout or unmount. */
export async function waitForTask(taskId, { signal, onProgress, intervalMs = 1000, timeoutMs = 1200000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  while (true) {
    combined.throwIfAborted();
    const task = await request(`/api/tasks/${encodeURIComponent(taskId)}`, { signal: combined });
    onProgress?.(task);
    if (task.status === 'completed') return task.result;
    if (task.status === 'failed') throw new Error(task.error || '任务失败');
    await new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(combined.reason); };
      const timer = setTimeout(() => { combined.removeEventListener('abort', cancel); resolve(); }, intervalMs);
      combined.addEventListener('abort', cancel, { once: true });
      if (combined.aborted) cancel();
    });
  }
}

export const api = {
  getStats: () => request('/api/stats'),

  search: (namespace, query, topK = 5) =>
    request('/api/memory/search', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, top_k: topK }),
    }),

  insert: (namespace, content, source, dedupThreshold = 0.0) =>
    request('/api/memory/insert', {
      method: 'POST',
      body: JSON.stringify({ namespace, content, source, dedup_threshold: dedupThreshold }),
    }),

  update: (docId, namespace, content, source) =>
    request('/api/memory/update', {
      method: 'POST',
      body: JSON.stringify({ doc_id: docId, namespace, content, source }),
    }),

  pack: (namespace, query, maxTokens = 2000, compress = false) =>
    request('/api/memory/pack', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, max_tokens: maxTokens, compress }),
    }),

  compress: (text, language = null) =>
    request('/api/compress', {
      method: 'POST',
      body: JSON.stringify({ text, language: language === 'none' || language === 'auto' ? null : language }),
    }),

  retrieveCompressed: (key) =>
    request(`/api/compress/retrieve?key=${encodeURIComponent(key)}`),

  createSnapshot: (namespace, summary) =>
    request('/api/memory/snapshot', {
      method: 'POST',
      body: JSON.stringify({ namespace, summary }),
    }),

  deleteById: (namespace, docId) =>
    request('/api/memory/delete', {
      method: 'DELETE',
      body: JSON.stringify({ namespace, doc_id: docId }),
    }),

  getShortTermMemory: (namespace) =>
    request(`/api/memory/short_term?namespace=${encodeURIComponent(namespace)}`),

  addShortTermMemory: (namespace, role, content) =>
    request('/api/memory/short_term', {
      method: 'POST',
      body: JSON.stringify({ namespace, role, content }),
    }),

  deleteShortTermMemory: (namespace, index = null) => {
    const hasIndex = index !== null && index !== undefined && index !== '';
    const url = hasIndex 
      ? `/api/memory/short_term?namespace=${encodeURIComponent(namespace)}&index=${index}`
      : `/api/memory/short_term?namespace=${encodeURIComponent(namespace)}`;
    return request(url, { method: 'DELETE' });
  },

  listWorkingMemory: (namespace) =>
    request(`/api/memory/working/list?namespace=${encodeURIComponent(namespace)}`),

  writeWorkingMemory: (namespace, key, value) =>
    request('/api/memory/working', {
      method: 'POST',
      body: JSON.stringify({ namespace, key, value }),
    }),

  deleteWorkingMemory: (namespace, key) =>
    request(`/api/memory/working?namespace=${encodeURIComponent(namespace)}&key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  consolidateMemory: (namespace) =>
    request('/api/memory/consolidate', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),

  pinMemory: (docId, isPinned) =>
    request('/api/memory/pin', {
      method: 'POST',
      body: JSON.stringify({ doc_id: docId, is_pinned: isPinned }),
    }),

  createSession: (namespace, sessionId = null) => {
    const body = { namespace };
    if (sessionId) body.session_id = sessionId;
    return request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  listSessions: (namespace, status = null) => {
    let url = `/api/sessions?namespace=${encodeURIComponent(namespace)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    return request(url);
  },

  updateSessionStatus: (sessionId, status) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  linkMemoryToSession: (sessionId, memoryId) =>
    request('/api/sessions/link', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, memory_id: memoryId }),
    }),

  unlinkMemoryFromSession: (sessionId, memoryId) =>
    request('/api/sessions/unlink', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, memory_id: memoryId }),
    }),

  getSessionMemories: (sessionId) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/memories`),

  getSessionContext: (sessionId, maxTokens = 2000) =>
    request('/api/sessions/context', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, max_tokens: maxTokens }),
    }),

  deleteSession: (sessionId) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),

  protectNamespace: (namespace) =>
    request('/api/namespaces/protect', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),

  unprotectNamespace: (namespace) =>
    request('/api/namespaces/unprotect', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),

  getProtectedNamespaces: () =>
    request('/api/namespaces/protected'),

  graphStats: (namespace = null) => {
    let url = '/api/graph/stats';
    if (namespace) url += `?namespace=${encodeURIComponent(namespace)}`;
    return request(url);
  },

  getGraphData: (namespace = 'all', limit = 500) =>
    request(`/api/graph/data?namespace=${encodeURIComponent(namespace)}&limit=${limit}`),

  extractCodebase: (targetDir, namespace, options = false) => {
    let rebuild = false;
    let incremental = false;
    if (typeof options === 'boolean') {
      rebuild = options;
    } else if (options && typeof options === 'object') {
      rebuild = !!options.rebuild;
      incremental = !!options.incremental;
    }
    return request('/api/graph/extract', {
      method: 'POST',
      body: JSON.stringify({ target_dir: targetDir, namespace, rebuild, incremental }),
    });
  },

  importGraphFile: (graphPath, namespace) =>
    request('/api/graph/import-file', {
      method: 'POST',
      body: JSON.stringify({ graph_path: graphPath, namespace }),
    }),

  preciseSourceSearch: (namespace, query, maxResults = 8, contextLines = 4) =>
    request('/api/graph/source-search', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, max_results: maxResults, context_lines: contextLines }),
    }),

  restoreNamespace: (file, targetNamespace = null) => upload('/api/restore', file, targetNamespace),

  traceGraphPath: (namespace, start, direction = 'outbound', relation = 'calls', depth = 3, limitPerNode = 50) =>
    request('/api/graph/trace', {
      method: 'POST',
      body: JSON.stringify({
        namespace,
        start,
        direction,
        relation,
        depth,
        limit_per_node: limitPerNode,
      }),
    }),

  searchGraphStructured: (namespace, filters = {}) =>
    request('/api/graph/search-structured', {
      method: 'POST',
      body: JSON.stringify({
        namespace,
        node_type: filters.nodeType || null,
        source_file_regex: filters.sourceFileRegex || null,
        name_regex: filters.nameRegex || null,
        min_degree: filters.minDegree !== undefined ? parseInt(filters.minDegree) : null,
        max_degree: filters.maxDegree !== undefined ? parseInt(filters.maxDegree) : null,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
      }),
    }),

  getArchitecture: (namespace, hotspotTop = 20) =>
    request(`/api/graph/architecture?namespace=${encodeURIComponent(namespace)}&hotspot_top=${hotspotTop}`),

  getDeadCode: (namespace, limit = 500) =>
    request(`/api/graph/dead-code?namespace=${encodeURIComponent(namespace)}&limit=${limit}`),

  getGraphSchema: (namespace = null) => {
    let url = '/api/graph/schema';
    if (namespace) url += `?namespace=${encodeURIComponent(namespace)}`;
    return request(url);
  },

  getCodeSnippet: (namespace, nodeId = null, qualifiedName = null, contextLines = 6, signal) =>
    request('/api/graph/snippet', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        namespace,
        node_id: nodeId,
        qualified_name: qualifiedName,
        context_lines: contextLines,
      }),
    }),

  detectChanges: (namespace, base = 'HEAD', unified = false) =>
    request('/api/graph/changes', {
      method: 'POST',
      body: JSON.stringify({
        namespace,
        base,
        unified,
      }),
    }),

  getArtifactDownloadUrl: (namespace) =>
    `${BASE_URL}/api/graph/artifact?namespace=${encodeURIComponent(namespace)}`,

  restoreArtifact: (file, targetNamespace = null) => upload('/api/graph/artifact/restore', file, targetNamespace),
};
