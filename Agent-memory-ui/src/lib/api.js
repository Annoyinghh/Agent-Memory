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
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.detail || `HTTP Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API request error on ${path}:`, error);
    throw error;
  }
}

/**
 * SSE (Server-Sent Events) request with progress callback
 * @param {string} path - API endpoint path
 * @param {object} body - Request body
 * @param {function} onProgress - Callback for progress updates: (stage, current, total, message, percent) => void
 * @returns {Promise<object>} Final result
 */
async function sseRequest(path, body, onProgress) {
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
    // Disable default timeout
    signal: null,
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastProgressTime = Date.now();

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      // Skip empty lines and comments (keep-alive)
      if (!line.trim() || line.startsWith(':')) {
        lastProgressTime = Date.now();
        continue;
      }

      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));

        if (data.done) {
          return data.result;
        } else if (data.error) {
          throw new Error(data.error);
        } else if (onProgress) {
          onProgress(data.stage, data.current, data.total, data.message, data.percent);
          lastProgressTime = Date.now();
        }
      }
    }

    // Check for timeout (no data for 60 seconds)
    if (Date.now() - lastProgressTime > 60000) {
      throw new Error('Connection timeout: no data received for 60 seconds');
    }
  }

  throw new Error('Stream ended without result');
}

export const api = {
  /**
   * Get database statistics
   * @returns {Promise<{total_chunks: number, namespaces: Record<string, number>}>}
   */
  getStats: () => request('/api/stats', { method: 'GET' }),

  /**
   * List all namespaces
   * @returns {Promise<{namespaces: string[]}>}
   */
  getNamespaces: () => request('/api/namespaces', { method: 'GET' }),

  /**
   * Search database
   * @param {string} namespace
   * @param {string} query
   * @param {number} topK
   * @returns {Promise<{query: string, namespace: string, total: number, results: Array<{id: string, namespace: string, content: string, source: string, timestamp: number, score: number}>}>}
   */
  search: (namespace, query, topK = 5) =>
    request('/api/memory/search', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, top_k: topK }),
    }),

  /**
   * Insert new memory chunk
   * @param {string} namespace
   * @param {string} content
   * @param {string} source
   * @param {number} dedupThreshold
   * @returns {Promise<{id: string, namespace: string, message: string}>}
   */
  insert: (namespace, content, source, dedupThreshold = 0.0) =>
    request('/api/memory/insert', {
      method: 'POST',
      body: JSON.stringify({ namespace, content, source, dedup_threshold: dedupThreshold }),
    }),

  /**
   * Update existing memory chunk by ID
   * @param {string} docId
   * @param {string} namespace
   * @param {string} content
   * @param {string} source
   * @returns {Promise<{id: string, namespace: string, message: string}>}
   */
  update: (docId, namespace, content, source) =>
    request('/api/memory/update', {
      method: 'POST',
      body: JSON.stringify({ doc_id: docId, namespace, content, source }),
    }),

  /**
   * Pack best context under a token budget
   * @param {string} namespace
   * @param {string} query
   * @param {number} maxTokens
   * @param {boolean} compress
   * @returns {Promise<{query: string, namespace: string, packed_context: string, compressed?: boolean, ratio?: number}>}
   */
  pack: (namespace, query, maxTokens = 2000, compress = false) =>
    request('/api/memory/pack', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, max_tokens: maxTokens, compress }),
    }),

  /**
   * Compress arbitrary text using headroom
   * @param {string} text
   * @param {string|null} language
   * @returns {Promise<{compressed: string, key?: string, original_tokens: number, compressed_tokens: number, ratio: number, method: string}>}
   */
  compress: (text, language = null) =>
    request('/api/compress', {
      method: 'POST',
      body: JSON.stringify({ text, language: language === 'none' || language === 'auto' ? null : language }),
    }),

  /**
   * Retrieve original text using a CCR key
   * @param {string} key
   * @returns {Promise<{key: string, original: string}>}
   */
  retrieveCompressed: (key) =>
    request(`/api/compress/retrieve?key=${encodeURIComponent(key)}`, {
      method: 'GET',
    }),

  /**
   * Get headroom compression status and stats
   * @returns {Promise<{available: boolean, ccr_dir: string, min_tokens: number, enabled_env: string, error?: string}>}
   */
  getCompressStats: () =>
    request('/api/compress/stats', {
      method: 'GET',
    }),

  /**
   * Create high priority state snapshot
   * @param {string} namespace
   * @param {string} summary
   * @returns {Promise<{id: string, namespace: string, message: string}>}
   */
  createSnapshot: (namespace, summary) =>
    request('/api/memory/snapshot', {
      method: 'POST',
      body: JSON.stringify({ namespace, summary }),
    }),

  /**
   * Delete memory by ID
   * @param {string} namespace
   * @param {string} docId
   * @returns {Promise<{deleted_count: number, message: string}>}
   */
  deleteById: (namespace, docId) =>
    request('/api/memory/delete', {
      method: 'DELETE',
      body: JSON.stringify({ namespace, doc_id: docId }),
    }),

  /**
   * Delete memory by Source Prefix
   * @param {string} namespace
   * @param {string} sourcePrefix
   * @returns {Promise<{deleted_count: number, message: string}>}
   */
  deleteBySourcePrefix: (namespace, sourcePrefix) =>
    request('/api/memory/delete', {
      method: 'DELETE',
      body: JSON.stringify({ namespace, source_prefix: sourcePrefix }),
    }),

  /**
   * Get short term dialog memory history
   * @param {string} namespace
   * @returns {Promise<{namespace: string, history: Array<{role: string, content: string, timestamp?: number}>}>}
   */
  getShortTermMemory: (namespace) =>
    request(`/api/memory/short_term?namespace=${encodeURIComponent(namespace)}`, {
      method: 'GET',
    }),

  /**
   * Add a dialogue turn to short term memory
   * @param {string} namespace
   * @param {string} role
   * @param {string} content
   * @returns {Promise<{namespace: string, message: string}>}
   */
  addShortTermMemory: (namespace, role, content) =>
    request('/api/memory/short_term', {
      method: 'POST',
      body: JSON.stringify({ namespace, role, content }),
    }),

  /**
   * Delete or clear short term dialog memory
   * @param {string} namespace
   * @param {number} [index] - Optional. If provided, deletes specific turn. Otherwise clears all.
   * @returns {Promise<{namespace: string, message: string}>}
   */
  deleteShortTermMemory: (namespace, index = null) => {
    const hasIndex = index !== null && index !== undefined && index !== '';
    const url = hasIndex 
      ? `/api/memory/short_term?namespace=${encodeURIComponent(namespace)}&index=${index}`
      : `/api/memory/short_term?namespace=${encodeURIComponent(namespace)}`;
    console.log('[API Client] deleteShortTermMemory URL:', url);
    return request(url, { method: 'DELETE' });
  },

  /**
   * List working memory state (scratchpad)
   * @param {string} namespace
   * @returns {Promise<{namespace: string, state: Record<string, string>}>}
   */
  listWorkingMemory: (namespace) =>
    request(`/api/memory/working/list?namespace=${encodeURIComponent(namespace)}`, {
      method: 'GET',
    }),

  /**
   * Write a key-value pair to working memory
   * @param {string} namespace
   * @param {string} key
   * @param {string} value
   * @returns {Promise<{message: string}>}
   */
  writeWorkingMemory: (namespace, key, value) =>
    request('/api/memory/working', {
      method: 'POST',
      body: JSON.stringify({ namespace, key, value }),
    }),

  /**
   * Delete a key from working memory
   * @param {string} namespace
   * @param {string} key
   * @returns {Promise<{message: string}>}
   */
  deleteWorkingMemory: (namespace, key) =>
    request(`/api/memory/working?namespace=${encodeURIComponent(namespace)}&key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  /**
   * Clear all working memory keys for a namespace
   * @param {string} namespace
   * @returns {Promise<{message: string}>}
   */
  clearWorkingMemory: (namespace) =>
    request(`/api/memory/working/clear?namespace=${encodeURIComponent(namespace)}`, {
      method: 'DELETE',
    }),

  /**
   * Consolidate short term memories into long term memories
   * @param {string} namespace
   * @returns {Promise<{namespace: string, id: string|null, message: string}>}
   */
  consolidateMemory: (namespace) =>
    request('/api/memory/consolidate', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),

  /**
   * Pin or unpin a long term memory
   * @param {string} docId
   * @param {boolean} isPinned
   * @returns {Promise<{message: string}>}
   */
  pinMemory: (docId, isPinned) =>
    request('/api/memory/pin', {
      method: 'POST',
      body: JSON.stringify({ doc_id: docId, is_pinned: isPinned }),
    }),

  /**
   * Record access/read simulation on a memory
   * @param {string} docId
   * @returns {Promise<{message: string}>}
   */
  accessMemory: (docId) =>
    request('/api/memory/access', {
      method: 'POST',
      body: JSON.stringify({ doc_id: docId }),
    }),

  /**
   * Active Forgetting: remove memories exceeding capacity
   * @param {string} namespace
   * @param {number} maxCapacity
   * @returns {Promise<{namespace: string, deleted_count: number}>}
   */
  activeForgetting: (namespace, maxCapacity = 10000) =>
    request('/api/memory/forget', {
      method: 'POST',
      body: JSON.stringify({ namespace, max_capacity: maxCapacity }),
    }),

  // ── Session Management ──

  /**
   * Create a new session
   * @param {string} namespace
   * @param {string} [sessionId]
   * @returns {Promise<{id: string, namespace: string, created_at: number, last_active: number, status: string}>}
   */
  createSession: (namespace, sessionId = null) => {
    const body = { namespace };
    if (sessionId) body.session_id = sessionId;
    return request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /**
   * List sessions for a namespace
   * @param {string} namespace
   * @param {string} [status] - 'active', 'archived', 'closed'
   * @returns {Promise<{namespace: string, sessions: Array<{id: string, namespace: string, created_at: number, last_active: number, status: string}>}>}
   */
  listSessions: (namespace, status = null) => {
    let url = `/api/sessions?namespace=${encodeURIComponent(namespace)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    return request(url, { method: 'GET' });
  },

  /**
   * Get a single session
   * @param {string} sessionId
   * @returns {Promise<{id: string, namespace: string, created_at: number, last_active: number, status: string}>}
   */
  getSession: (sessionId) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' }),

  /**
   * Update session status
   * @param {string} sessionId
   * @param {string} status - 'active', 'archived', 'closed'
   * @returns {Promise<{message: string}>}
   */
  updateSessionStatus: (sessionId, status) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  /**
   * Link a memory to a session
   * @param {string} sessionId
   * @param {string} memoryId
   * @returns {Promise<{message: string}>}
   */
  linkMemoryToSession: (sessionId, memoryId) =>
    request('/api/sessions/link', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, memory_id: memoryId }),
    }),

  /**
   * Unlink a memory from a session
   * @param {string} sessionId
   * @param {string} memoryId
   * @returns {Promise<{message: string}>}
   */
  unlinkMemoryFromSession: (sessionId, memoryId) =>
    request('/api/sessions/unlink', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, memory_id: memoryId }),
    }),

  /**
   * Get memories linked to a session
   * @param {string} sessionId
   * @returns {Promise<{session_id: string, memories: Array>}>}
   */
  getSessionMemories: (sessionId) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}/memories`, { method: 'GET' }),

  /**
   * Pack context from session's linked memories
   * @param {string} sessionId
   * @param {number} [maxTokens=2000]
   * @returns {Promise<{session_id: string, namespace: string, packed_context: string}>}
   */
  getSessionContext: (sessionId, maxTokens = 2000) =>
    request('/api/sessions/context', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, max_tokens: maxTokens }),
    }),

  /**
   * Delete a session and its memory links
   * @param {string} sessionId
   * @returns {Promise<{message: string}>}
   */
  deleteSession: (sessionId) =>
    request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),

  // ── Namespace Protection ──

  /**
   * Protect a namespace (make it read-only)
   * @param {string} namespace
   * @returns {Promise<{message: string}>}
   */
  protectNamespace: (namespace) =>
    request('/api/namespaces/protect', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),

  /**
   * Remove protection from a namespace
   * @param {string} namespace
   * @returns {Promise<{message: string}>}
   */
  unprotectNamespace: (namespace) =>
    request('/api/namespaces/unprotect', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),

  /**
   * List all protected namespaces
   * @returns {Promise<{protected_namespaces: string[]}>}
   */
  getProtectedNamespaces: () =>
    request('/api/namespaces/protected', { method: 'GET' }),

  // ── Knowledge Graph (Graphify Integration) ──

  /**
   * Add an edge between two memory nodes
   * @param {string} fromId
   * @param {string} toId
   * @param {string} relationType
   * @param {number} [confidence=1.0]
   * @returns {Promise<{message: string}>}
   */
  addEdge: (fromId, toId, relationType, confidence = 1.0) =>
    request('/api/graph/edge', {
      method: 'POST',
      body: JSON.stringify({ from_id: fromId, to_id: toId, relation_type: relationType, confidence }),
    }),

  /**
   * Remove an edge between two memory nodes
   * @param {string} fromId
   * @param {string} toId
   * @param {string} relationType
   * @returns {Promise<{message: string}>}
   */
  removeEdge: (fromId, toId, relationType) =>
    request('/api/graph/edge', {
      method: 'DELETE',
      body: JSON.stringify({ from_id: fromId, to_id: toId, relation_type: relationType }),
    }),

  /**
   * Get neighbors of a memory node
   * @param {string} nodeId
   * @param {string} [relationType]
   * @param {string} [direction='both']
   * @param {number} [limit=50]
   * @returns {Promise<{node_id: string, neighbors: Array}>}
   */
  getNeighbors: (nodeId, relationType = null, direction = 'both', limit = 50) =>
    request('/api/graph/neighbors', {
      method: 'POST',
      body: JSON.stringify({ node_id: nodeId, relation_type: relationType, direction, limit }),
    }),

  /**
   * Get full details of a memory node including edges
   * @param {string} nodeId
   * @returns {Promise<{id: string, namespace: string, content: string, edges: Array}>}
   */
  getNodeDetail: (nodeId) =>
    request(`/api/graph/node/${encodeURIComponent(nodeId)}`, { method: 'GET' }),

  /**
   * Find shortest path between two memory nodes
   * @param {string} fromId
   * @param {string} toId
   * @param {number} [maxDepth=5]
   * @returns {Promise<{from_id: string, to_id: string, path: Array, found: boolean}>}
   */
  findPath: (fromId, toId) =>
    request('/api/graph/path', {
      method: 'POST',
      body: JSON.stringify({ from_id: fromId, to_id: toId }),
    }),

  /**
   * Get graph statistics
   * @param {string} [namespace]
   * @returns {Promise<{nodes: number, edges: number, relation_types: string[]}>}
   */
  graphStats: (namespace = null) => {
    let url = '/api/graph/stats';
    if (namespace) url += `?namespace=${encodeURIComponent(namespace)}`;
    return request(url, { method: 'GET' });
  },

  /**
   * Get graph data (nodes + edges) for visualization, capped at limit
   * @param {string} [namespace='all']
   * @param {number} [limit=500]
   * @returns {Promise<{nodes: Array, edges: Array}>}
   */
  getGraphData: (namespace = 'all', limit = 500) =>
    request(`/api/graph/data?namespace=${encodeURIComponent(namespace)}&limit=${limit}`, { method: 'GET' }),

  /**
   * List detected communities for cluster coloring / filtering
   * @param {string|null} [namespace]
   * @returns {Promise<{namespace: string|null, communities: Array<{community_id:number,node_count:number,type_count:number}>}>}
   */
  getCommunities: (namespace = null) => {
    const url = namespace
      ? `/api/graph/communities?namespace=${encodeURIComponent(namespace)}`
      : '/api/graph/communities';
    return request(url, { method: 'GET' });
  },

  /**
   * Semantic search scoped to graph nodes only (excludes dialog memories)
   * @param {string} namespace
   * @param {string} query
   * @param {number} [topK=10]
   * @returns {Promise<{query,namespace,total,results:Array}>}
   */
  searchGraph: (namespace, query, topK = 10) =>
    request('/api/graph/search', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, top_k: topK }),
    }),

  /**
   * Batch import graph data (nodes + edges)
   * @param {string} namespace
   * @param {Array} nodes
   * @param {Array} edges
   * @returns {Promise<{nodes_imported: number, edges_imported: number, id_map_size: number}>}
   */
  importGraph: (namespace, nodes, edges) =>
    request('/api/graph/import', {
      method: 'POST',
      body: JSON.stringify({ namespace, nodes, edges }),
    }),

  /**
   * Run Graphify extraction on a directory - returns task ID immediately (background task)
   * @param {string} targetDir - Directory to extract
   * @param {string} namespace - Target namespace
   * @param {boolean|Object} [options=false] - If boolean, acts as rebuild. If object, can contain rebuild and incremental.
   * @returns {Promise<{task_id: string, namespace: string, message: string}>}
   */
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

  /**
   * Clear all graph data (nodes + edges + vectors) for a namespace
   * @param {string} namespace
   * @returns {Promise<{deleted_count: number, message: string}>}
   */
  clearGraph: (namespace) =>
    request('/api/graph/clear', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),

  /**
   * Import an existing graphify graph.json file - returns task ID immediately (background task)
   * @param {string} graphPath - Path to graph.json
   * @string namespace - Target namespace
   * @returns {Promise<{task_id: string, namespace: string, message: string}>}
   */
  importGraphFile: (graphPath, namespace) =>
    request('/api/graph/import-file', {
      method: 'POST',
      body: JSON.stringify({ graph_path: graphPath, namespace }),
    }),

  /**
   * Get task status and progress by task ID
   * @param {string} taskId - Task ID returned from extract/import
   * @returns {Promise<{task_id, status, stage, current, total, message, percent, result, error}>}
   */
  getTaskStatus: (taskId) =>
    request(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' }),

  /**
   * Get all nodes and edges for a given namespace
   * @param {string} namespace
   * @returns {Promise<{nodes: Array, edges: Array}>}
   */
  getGraphData: (namespace) =>
    request(`/api/graph/data?namespace=${encodeURIComponent(namespace)}`, {
      method: 'GET',
    }),

  /**
   * Exact line-level search over source files referenced by imported graph nodes
   * @param {string} namespace
   * @param {string} query
   * @param {number} [maxResults=8]
   * @param {number} [contextLines=4]
   * @returns {Promise<{namespace, query, results: Array}>}
   */
  preciseSourceSearch: (namespace, query, maxResults = 8, contextLines = 4) =>
    request('/api/graph/source-search', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, max_results: maxResults, context_lines: contextLines }),
    }),

  /**
   * Restore a namespace from a backup file (returns task ID for polling)
   * @param {File} file - The uploaded .json.gz file object
   * @param {string} [targetNamespace] - Optional. Target namespace to restore to.
   * @returns {Promise<{task_id: string, namespace: string, message: string}>}
   */
  restoreNamespace: (file, targetNamespace = null) => {
    const formData = new FormData();
    formData.append('file', file);
    
    let url = '/api/restore';
    if (targetNamespace) {
      url += `?target_namespace=${encodeURIComponent(targetNamespace)}`;
    }
    
    return fetch(`${BASE_URL}${url}`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || `HTTP Error: ${res.status}`);
      }
      return res.json();
    });
  },

  /**
   * Trace call path / call chain (BFS)
   * @param {string} namespace
   * @param {string} start - Start symbol/node name
   * @param {string} [direction='outbound'] - 'outbound' (callees) or 'inbound' (callers)
   * @param {string} [relation='calls'] - Relation type
   * @param {number} [depth=3] - Traversal depth
   * @param {number} [limitPerNode=50] - Result limit per node
   * @returns {Promise<Object>} Traced graph data
   */
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

  /**
   * Structured search over the codebase graph
   * @param {string} namespace
   * @param {Object} filters
   * @returns {Promise<Object>} Search results
   */
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

  /**
   * Get architecture overview of the codebase
   * @param {string} namespace
   * @param {number} [hotspotTop=20]
   * @returns {Promise<Object>} Architecture stats
   */
  getArchitecture: (namespace, hotspotTop = 20) =>
    request(`/api/graph/architecture?namespace=${encodeURIComponent(namespace)}&hotspot_top=${hotspotTop}`, {
      method: 'GET',
    }),

  /**
   * Find dead code (0 inbound call functions)
   * @param {string} namespace
   * @param {number} [limit=500]
   * @returns {Promise<Object>} Dead code list
   */
  getDeadCode: (namespace, limit = 500) =>
    request(`/api/graph/dead-code?namespace=${encodeURIComponent(namespace)}&limit=${limit}`, {
      method: 'GET',
    }),

  /**
   * Introspect graph schema
   * @param {string} [namespace]
   * @returns {Promise<Object>} Schema details
   */
  getGraphSchema: (namespace = null) => {
    let url = '/api/graph/schema';
    if (namespace) url += `?namespace=${encodeURIComponent(namespace)}`;
    return request(url, { method: 'GET' });
  },

  /**
   * Get code snippet for a symbol
   * @param {string} namespace
   * @param {string} [nodeId]
   * @param {string} [qualifiedName]
   * @param {number} [contextLines=6]
   * @returns {Promise<Object>} Code snippet lines
   */
  getCodeSnippet: (namespace, nodeId = null, qualifiedName = null, contextLines = 6) =>
    request('/api/graph/snippet', {
      method: 'POST',
      body: JSON.stringify({
        namespace,
        node_id: nodeId,
        qualified_name: qualifiedName,
        context_lines: contextLines,
      }),
    }),

  /**
   * Detect blast radius of git modifications
   * @param {string} namespace
   * @param {string} [base='HEAD']
   * @param {boolean} [unified=false]
   * @returns {Promise<Object>} Changed symbols and blast radius risk
   */
  detectChanges: (namespace, base = 'HEAD', unified = false) =>
    request('/api/graph/changes', {
      method: 'POST',
      body: JSON.stringify({
        namespace,
        base,
        unified,
      }),
    }),

  /**
   * Build team-shared artifact and return metadata manifest
   * @param {string} namespace
   * @returns {Promise<Object>} Manifest details
   */
  getArtifactManifest: (namespace) =>
    request(`/api/graph/artifact/manifest?namespace=${encodeURIComponent(namespace)}`, {
      method: 'GET',
    }),

  /**
   * Get download URL for team-shared artifact
   * @param {string} namespace
   * @returns {string} Download URL
   */
  getArtifactDownloadUrl: (namespace) =>
    `${BASE_URL}/api/graph/artifact?namespace=${encodeURIComponent(namespace)}`,

  /**
   * Restore namespace from uploaded team artifact file (returns task ID for polling)
   * @param {File} file - Uploaded file object (.json.gz)
   * @param {string} [targetNamespace] - Optional. Target namespace to restore to.
   * @returns {Promise<{task_id: string, namespace: string, message: string}>}
   */
  restoreArtifact: (file, targetNamespace = null) => {
    const formData = new FormData();
    formData.append('file', file);
    
    let url = '/api/graph/artifact/restore';
    if (targetNamespace) {
      url += `?target_namespace=${encodeURIComponent(targetNamespace)}`;
    }
    
    return fetch(`${BASE_URL}${url}`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || `HTTP Error: ${res.status}`);
      }
      return res.json();
    });
  },
};
